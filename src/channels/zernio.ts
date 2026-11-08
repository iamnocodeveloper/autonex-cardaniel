// Zernio — proveedor unificado multicanal (Instagram, Facebook/Messenger, X,
// Telegram, WhatsApp, Bluesky, Reddit…) con UNA api key y OAuth de un clic.
// Canal "tipo ManyChat": webhook entrante + API REST de envío.
//
//   API base: https://zernio.com/api  (configurable con ZERNIO_API_BASE_URL)
//   Enviar:   POST /v1/inbox/conversations/{conversationId}/messages
//             body { accountId, message?, buttons? } — Bearer ZERNIO_API_KEY
//   Webhook:  firma HMAC-SHA256 (hex) en header X-Zernio-Signature
//             (o legacy X-Late-Signature), secreto ZERNIO_WEBHOOK_SECRET.
//
// Eventos que maneja este adapter:
//   • message.received  → DM entrante de cualquier plataforma → al agente.
//   • comment.received  → comentario en un post. Si ZERNIO_AUTO_DM_KEYWORD
//     aparece en el texto (case-insensitive), responde al autor con
//     ZERNIO_AUTO_DM_MESSAGE + botón opcional (ZERNIO_AUTO_DM_BUTTON_URL/
//     ZERNIO_AUTO_DM_BUTTON_LABEL). El comentario NO entra al agente.
//   • reaction.received → ack, se ignora.
//
// Referencia del adapter oficial (Chat SDK): github.com/zernio-dev/chat-sdk-adapter

import type { ChannelAdapter, IncomingMessage, OutgoingReply, ChannelId } from "./shared";
import type { Env } from "../env";
import type { DmLogsRepo } from "../db/dmLogs";
import { matchKeywords, renderUsername } from "../utils/keyword-matcher";
import { commentFingerprint } from "../db/fingerprints";
import { resolveZernioCredentials } from "./zernioCredentials";
import { extractPostContext, MAX_PUBLIC_REPLIES_PER_DAY } from "./zernioComments";
import { checkInstagramFollowStatus } from "./zernioAccounts";
import { toPlainLinks } from "../replies/format";

const DEFAULT_BASE = "https://zernio.com/api";

/**
 * Respuesta pública por defecto cuando una regla `comment_dm_public` no tiene
 * texto público configurado. Evita que la regla "comentario → pública + DM"
 * termine mandando solo el DM.
 */
const DEFAULT_PUBLIC_REPLY = "¡Gracias por tu comentario! Te escribí por privado ✨";

// ─── Firma del webhook ───────────────────────────────────────────────────────
// Zernio firma el body crudo con HMAC-SHA256 y manda el digest hex en
// X-Zernio-Signature (legacy: X-Late-Signature). Comparación en tiempo
// constante para evitar timing attacks.
export async function verifyZernioSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (computed.length !== signature.length) return false;
  // Comparación de igual longitud (ambos hex) — evita el cortocircuito por longitud.
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

// ─── Payloads ────────────────────────────────────────────────────────────────
interface ZernioMessage {
  id?: string;
  conversationId?: string;
  platform?: string;
  direction?: string;
  text?: string | null;
  attachments?: { type?: string; url?: string }[];
  sender?: { id?: string; name?: string; username?: string };
  sentAt?: string;
  platformMessageId?: string;
  /**
   * Quién produjo el mensaje SALIENTE (`message.sent`): `human` (operador en el
   * inbox de Zernio), `api` (una llamada a la API — nuestro bot y las
   * automatizaciones de comentarios), `comment_automation`, `broadcast`,
   * `sequence`, `workflow`, `bulk-api`, o `null` cuando se envió desde la app
   * nativa del celular. Ver docs.zernio.com/webhooks/inbox/message-sent.
   */
  sentVia?: string | null;
  /**
   * Metadatos del mensaje. Cuando el usuario toca un botón, Zernio manda el
   * payload en `metadata.postbackPayload` (y el texto del botón en
   * `metadata.postbackTitle`) — NO como texto del mensaje. Ver
   * docs.zernio.com/webhooks/inbox/message-received (Postback button tap).
   */
  metadata?: {
    postbackPayload?: string;
    postbackTitle?: string;
    quickReplyPayload?: string;
    interactiveId?: string;
    callbackData?: string;
  };
}

interface ZernioComment {
  id?: string;
  postId?: string;
  platformPostId?: string;
  platform?: string;
  text?: string | null;
  author?: { id?: string; username?: string; name?: string; picture?: string };
  isReply?: boolean;
  parentCommentId?: string | null;
}

interface ZernioWebhookBody {
  id?: string;
  event?: string;
  timestamp?: string;
  message?: ZernioMessage;
  conversation?: { id?: string; platformConversationId?: string; participantName?: string; participantUsername?: string };
  account?: { id?: string; accountId?: string; profileId?: string; platform?: string; username?: string; displayName?: string };
  comment?: ZernioComment;
  /** Publicación comentada (caption/permalink/imagen) — la trae comment.received. */
  post?: Record<string, unknown>;
}

/** Primer string no vacío de la lista (para payloads que llegan en varias claves). */
function pickStr(...vals: unknown[]): string | undefined {
  for (const v of vals) if (typeof v === "string" && v.trim() !== "") return v.trim();
  return undefined;
}

function firstUrl(body: { attachments?: { type?: string; url?: string }[] }): { audio?: string; image?: string } {
  let audio: string | undefined;
  let image: string | undefined;
  for (const a of body.attachments ?? []) {
    const url = a.url ?? "";
    if (!url) continue;
    const t = (a.type ?? "").toLowerCase();
    if (t === "audio" || t === "video" || /\.(mp3|mp4|m4a|ogg|webm|amr)(\?|#|$)/i.test(url)) audio = url;
    else if (t === "image" || /\.(jpe?g|png|gif|webp|heic)(\?|#|$)/i.test(url)) image = url;
  }
  return { audio, image };
}

// ─── Flujos de automatización (comentarios + DMs) ────────────────────────────
// Reglas editables desde el panel /admin/flujos (tabla D1 auto_rules). Si un
// comentario o DM matchea una regla activa, la regla GANA (respuesta
// automática) y el mensaje no entra al agente. Las vars ZERNIO_AUTO_DM_*
// siguen funcionando como fallback (modo simple) si no hay reglas en D1.
//
// Endpoints (API pública de Zernio):
//   DM:      POST /v1/inbox/comments/{postId}/{commentId}/private-reply
//            (IG y FB; una respuesta por comentario, dentro de 7 días)
//   Público: POST /v1/inbox/comments/{postId}  body { accountId, message, commentId }
interface AutoDmRule {
  keywords: string[];
  message: string;
  kind?: string;
  buttonLabel?: string;
  buttonUrl?: string;
  /** Respuesta pública al comentario (opcional). Si va vacío, no se responde en público. */
  replyToComment?: string;
  /** Prompt para que la IA genere la respuesta pública en el tono del dueño. */
  aiReplyPrompt?: string;
  /** true = palabra completa (default); false = match parcial. */
  wholeWordMatch?: boolean;
  /** ID de la regla en D1 (para trackear links). */
  ruleId?: string;
  /** Follow gate: exige follow antes de entregar el link (port OpenReply). */
  requireFollow?: boolean;
  followPromptMessage?: string;
  followButtonLabel?: string;
}

/** Carga las reglas desde D1 (panel) o cae a las vars de env (modo simple). */
async function loadAutoDmRules(env: Env): Promise<AutoDmRule[]> {
  // 1) Reglas del panel (auto_rules en D1) — prioridad.
  try {
    const { Db } = await import("../db/client");
    const { AutoRulesRepo } = await import("../db/autoRules");
    const rules = await new AutoRulesRepo(new Db(env.DB)).list({ onlyActive: true });
    const mapped: AutoDmRule[] = rules
      .filter((r) => r.kind === "comment_dm" || r.kind === "comment_reply" || r.kind === "comment_dm_public")
      .map((r) => ({
        ruleId: r.id,
        kind: r.kind,
        keywords: r.keywords,
        message: r.message,
        buttonLabel: r.buttonLabel,
        buttonUrl: r.buttonUrl,
        replyToComment: r.replyToComment,
        aiReplyPrompt: r.aiReplyPrompt,
        wholeWordMatch: r.wholeWordMatch,
        requireFollow: r.requireFollow,
        followPromptMessage: r.followPromptMessage,
        followButtonLabel: r.followButtonLabel,
      }));
    if (mapped.length > 0) return mapped;
  } catch (e) {
    console.warn("[zernio] no se pudieron cargar reglas de D1:", e);
  }

  // 2) ZERNIO_AUTO_DM_RULES (JSON) — modo avanzado por env.
  const rules: AutoDmRule[] = [];
  try {
    const raw = (env.ZERNIO_AUTO_DM_RULES ?? "").trim();
    if (raw) {
      const parsed = JSON.parse(raw) as AutoDmRule[];
      for (const r of parsed) {
        const kws = (r.keywords ?? []).map((k) => String(k).trim().toLowerCase()).filter(Boolean);
        const msg = (r.message ?? "").trim();
        if (kws.length > 0 && msg) {
          rules.push({ keywords: kws, message: msg, buttonLabel: r.buttonLabel, buttonUrl: r.buttonUrl, replyToComment: r.replyToComment, aiReplyPrompt: r.aiReplyPrompt, wholeWordMatch: r.wholeWordMatch, requireFollow: r.requireFollow, followPromptMessage: r.followPromptMessage, followButtonLabel: r.followButtonLabel });
        }
      }
    }
  } catch (e) {
    console.error("[zernio] ZERNIO_AUTO_DM_RULES JSON inválido:", e);
  }
  if (rules.length > 0) return rules;

  // 3) Modo simple legacy (una sola keyword).
  const legacyKw = (env.ZERNIO_AUTO_DM_KEYWORD ?? "").trim().toLowerCase();
  if (legacyKw) {
    rules.push({
      keywords: [legacyKw],
      message:
        env.ZERNIO_AUTO_DM_MESSAGE?.trim() ||
        "¡Hola! 👋 Gracias por tu interés. Aquí tienes la información que pediste:",
      buttonLabel: env.ZERNIO_AUTO_DM_BUTTON_LABEL,
      buttonUrl: env.ZERNIO_AUTO_DM_BUTTON_URL,
    });
  }
  return rules;
}

async function sendCommentActions(
  matched: AutoDmRule,
  accountId: string,
  publishAccountId: string,
  postId: string,
  commentId: string,
  commenterName: string | null | undefined,
  commenterId: string | undefined,
  commentText: string | undefined,
  env: Env,
  platform = "instagram",
): Promise<{ dmSent: boolean; publicSent: boolean }> {
  const { apiKey } = await resolveZernioCredentials(env);
  if (!apiKey) return { dmSent: false, publicSent: false };
  const base = env.ZERNIO_API_BASE_URL ?? DEFAULT_BASE;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  // Trackear el link del botón: si la regla tiene buttonUrl, lo servimos vía
  // /r/:slug (cuenta clicks) en vez del URL crudo.
  let buttonUrl = matched.buttonUrl;
  if (buttonUrl && matched.ruleId) {
    try {
      const { Db } = await import("../db/client");
      const { TrackedLinksRepo } = await import("../db/trackedLinks");
      const link = await new TrackedLinksRepo(new Db(env.DB)).ensureForRule(matched.ruleId, buttonUrl, matched.buttonLabel);
      const baseUrl = (env.DASHBOARD_BASE_URL ?? "").replace(/\/$/, "");
      buttonUrl = `${baseUrl}/r/${link.slug}`;
    } catch (e) {
      console.warn("[zernio] no se pudo trackear el link:", e);
      // sin tracking: se usa el URL crudo
    }
  }

  const buttons: { type: string; title: string; url?: string; payload?: string }[] = [];
  if (buttonUrl) {
    buttons.push({
      type: "url",
      title: matched.buttonLabel?.trim() || "Abrir",
      url: buttonUrl,
    });
  }

  const dmMessage = toPlainLinks(renderUsername(matched.message, commenterName));
  const kind = matched.kind ?? "comment_dm";
  const publicOnly = kind === "comment_reply";
  // Respuesta pública: para comment_reply el texto ES el campo message (público
  // sin DM); para comment_dm / comment_dm_public viene de replyToComment.
  let publicReply = publicOnly
    ? (matched.message ?? "").trim()
      ? toPlainLinks(renderUsername(matched.message, commenterName))
      : undefined
    : matched.replyToComment?.trim()
      ? toPlainLinks(renderUsername(matched.replyToComment.trim(), commenterName))
      : undefined;
  if (!publicReply && matched.aiReplyPrompt?.trim()) {
    try {
      const { generateAiPublicReply } = await import("../aiReply");
      const generated = await generateAiPublicReply(env, {
        prompt: matched.aiReplyPrompt,
        commentText,
        commenterName,
        businessName: env.BUSINESS_NAME,
        keyword: matched.keywords?.[0],
      });
      if (generated) publicReply = toPlainLinks(renderUsername(generated, commenterName));
    } catch (e) {
      console.warn("[zernio] generación IA de respuesta pública falló:", e);
    }
  }

  // ── `comment_dm_public` sin texto público: usar un default ───────────────
  // Este tipo de regla se llama "Comentario → respuesta pública + DM" en el
  // panel, pero la respuesta pública sale de `reply_to_comment`. Si el dueño lo
  // dejó vacío (y no hay prompt de IA), el bot mandaba SOLO el DM y el
  // comentario se quedaba sin responder en público — en silencio, sin avisar.
  // Ahora se usa un texto genérico para que la regla cumpla lo que promete; el
  // dueño puede cambiarlo en Automatizaciones.
  if (!publicReply && kind === "comment_dm_public") {
    let fallback = "";
    try {
      const { Db } = await import("../db/client");
      const { SettingsRepo, SETTING_KEYS } = await import("../db/settings");
      fallback =
        (await new SettingsRepo(new Db(env.DB)).get(SETTING_KEYS.commentDefaultPublicReply)) ?? "";
    } catch {
      /* sin settings → default */
    }
    const text = fallback.trim() || DEFAULT_PUBLIC_REPLY;
    publicReply = toPlainLinks(renderUsername(text, commenterName));
    console.warn(
      `[zernio] regla ${matched.ruleId ?? "?"} es comment_dm_public sin texto público — se usa el default`,
    );
  }

  // ── Follow gate (port OpenReply) ──────────────────────────────────────────
  // Si la regla exige follow, verificamos si el autor sigue la cuenta ANTES de
  // entregar el link. Si NO sigue: enviamos un DM de "sígueme" con botón
  // postback (followcheck) en vez del link; cuando toque el botón, el webhook
  // message.received traerá el payload y entregaremos el link (ver autoReplyOnDm).
  let followGated = false;
  if (!publicOnly && matched.requireFollow && commenterId && platform === "instagram") {
    const follow = await checkInstagramFollowStatus(env, { accountId, userId: commenterId });
    // Se pide el follow salvo que Meta CONFIRME que ya sigue. `unknown` es lo
    // normal en un comentarista que nunca ha escrito (consent_required), así
    // que ahí SÍ se le pide el follow — para eso existe el gate. La diferencia
    // está en la confirmación (autoReplyOnDm): ahí "no lo sé" ya no se confunde
    // con "no me sigue".
    followGated = follow.status !== "yes";
    if (follow.status === "unknown") {
      console.warn(`[zernio] follow-status sin resolver (${follow.reason ?? "sin motivo"}) — se pide follow igual`);
    }
  } else if (!publicOnly && matched.requireFollow && platform !== "instagram") {
    // follow-status es solo de Instagram: en Facebook/TikTok no hay forma de
    // verificar y el gate dejaría al usuario en un bucle imposible de cumplir.
    console.warn(`[zernio] follow gate omitido en ${platform}: solo se verifica en Instagram`);
  }

  // Estados FINALES honestos para el historial: sent = se envió de verdad en
  // este intento · skipped = dedup/ya enviado antes · failed = error real.
  let dmSent = false;
  let dmSkipped = false;
  let dmError: string | undefined;
  let publicSent = false;
  let publicSkipped = false;
  let publicError: string | undefined;

  // ── Dedup SEPARADO por pierna (fix: no saltar la pública si el DM ya fue) ──
  // Meta permite UNA private reply por comentario. Si el DM ya se envió (en
  // CUALQUIER regla o intento previo), NO re-enviamos el DM, PERO sí intentamos
  // la respuesta pública si aún no se publicó (un intento previo pudo fallar a
  // mitad). El error 400 "ya se ha enviado una respuesta privada" de Instagram
  // se trata como caso esperado (el DM ya fue) → skipped para no marcarlo fail.
  let dmAlreadySent = false;
  let publicAlreadySent = false;
  let logs: DmLogsRepo | null = null;
  try {
    const { Db } = await import("../db/client");
    const { DmLogsRepo } = await import("../db/dmLogs");
    const repo = new DmLogsRepo(new Db(env.DB));
    logs = repo;
    const rec = await repo.getProcessedComment(commentId);
    dmAlreadySent = rec?.dmSentAt != null;
    publicAlreadySent = rec?.publicReplySentAt != null;

    // Rate limit por cuenta (Fase 5): si el DM NO se ha enviado aún, reservamos
    // slot. Si ya se envió, no gastamos cupo (solo reintentamos la pública).
    if (!publicOnly && !dmAlreadySent && !(await repo.reserveDmSlot(accountId))) {
      const { used, windowStart } = await repo.currentHourUsage(accountId);
      console.warn(`[zernio] rate limit: cuenta ${accountId} agotó su cupo (${used}/hora) — se salta DM`);
      await repo.log({
        ruleId: matched.ruleId,
        kind: "comment_dm",
        platform: "instagram",
        target: commentId,
        username: commenterName ?? undefined,
        message: dmMessage,
        status: "skipped",
        error: `Rate limit: la cuenta agotó su cupo de esta hora (${used} DM). Ventana: ${new Date(windowStart + 3600_000).toISOString()}`,
      });
      dmAlreadySent = true; // no reintentar DM; intentar pública igual
      dmSkipped = true;
    }

    // Límite free de DMs automáticos / mes (solo si aún no se envió el DM).
    if (!publicOnly && !dmAlreadySent) {
      try {
        const { checkLimit } = await import("../limits");
        const dmCheck = await checkLimit(env, "autoDmsThisMonth");
        if (!dmCheck.allowed) {
          console.warn(`[limits] DMs automáticos al tope (${dmCheck.used}/${dmCheck.limit}) — se salta DM`);
          await repo.log({
            ruleId: matched.ruleId,
            kind: "comment_dm",
            platform: "instagram",
            target: commentId,
            username: commenterName ?? undefined,
            message: dmMessage,
            status: "skipped",
            error: `Límite gratis de respuestas automáticas alcanzado (${dmCheck.used}/${dmCheck.limit} este mes). Activa Pro para quitarlo.`,
          });
          dmAlreadySent = true;
          dmSkipped = true;
        }
      } catch (e) {
        console.warn("[limits] chequeo de DMs mensuales falló — fail-open:", e);
      }
    }
  } catch (e) {
    console.warn("[zernio] dedup/rate check falló (se procede sin control):", e);
  }

  if (publicOnly) {
    // comment_reply: solo respuesta pública — sin DM ni follow gate.
    dmSent = false;
    dmSkipped = false;
  } else if (followGated) {
    // DM de follow gate: NO entrega el link; botón postback "Ya te sigo" con
    // payload followcheck:<ruleId>:<commentId>. Al tocarlo, llega por webhook.
    const prompt = toPlainLinks(
      renderUsername(
        matched.followPromptMessage ||
          "Hola {username}! Sígueme y toca el botón para recibir el link 👇",
        commenterName,
      ),
    );
    const followBtn = [
      {
        type: "postback",
        title: (matched.followButtonLabel || "Ya te sigo").slice(0, 20),
        payload: `followcheck:${matched.ruleId ?? ""}:${commentId}`,
      },
    ];
    if (dmAlreadySent) {
      dmSkipped = true;
    } else {
      // Claim atómico del DM: solo la ejecución que gana el UPDATE condicional
      // envía. Cierra la carrera cuando Zernio reintenta el webhook del mismo
      // comentario (dos deliveries en vuelo a la vez).
      let claimedAt: number | null = Date.now(); // fail-open si la DB falla
      try {
        claimedAt = logs ? await logs.claimLeg(commentId, matched.ruleId ?? "", "dm", Date.now()) : Date.now();
      } catch (e) {
        console.warn("[zernio] claim DM falló (se procede sin control):", e);
      }
      if (claimedAt == null) {
        dmSkipped = true; // otro delivery ya reclamó/envió el DM
      } else {
        try {
          const res = await fetch(`${base}/v1/inbox/comments/${postId}/${commentId}/private-reply`, {
            method: "POST",
            headers,
            body: JSON.stringify({ accountId, message: prompt, buttons: followBtn }),
          });
          if (!res.ok) {
            const detail = await res.text().catch(() => "");
            // Instagram: "ya se ha enviado una respuesta privada" → el DM ya fue
            // (intento previo). Tratarlo como skipped, no como fallo.
            if (/respuesta privada|private reply|already|invalid for a private reply/i.test(detail)) {
              dmSkipped = true;
              console.warn(`[zernio] follow-gate DM ya enviado antes — se omite (${commentId})`);
            } else {
              dmError = `HTTP ${res.status} ${detail.slice(0, 200)}`;
              console.error(`zernio follow-gate DM falló: ${dmError}`);
              await logs?.releaseClaim(commentId, "dm", claimedAt).catch(() => {});
            }
          } else {
            dmSent = true;
            console.log(`[zernio] follow-gate DM enviado (link pendiente): ${matched.keywords.join(",")}`);
            // Zernio NO reenvía el payload del botón al presionarlo (manda la
            // etiqueta + prefijo postback_); guardamos el estado para completar
            // la entrega cuando el usuario toque "Ya te sigo".
            try {
              const { Db } = await import("../db/client");
              await new Db(env.DB).run(
                `INSERT INTO follow_gate_pending (account_id, commenter_id, rule_id, comment_id, post_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
                [accountId, commenterId ?? "", matched.ruleId ?? "", commentId, postId, Date.now()],
              );
            } catch (e) {
              console.warn("[zernio] no se pudo guardar el follow-gate pendiente:", e);
            }
          }
        } catch (e) {
          dmError = String((e as Error)?.message ?? e);
          console.error("zernio follow-gate DM error:", e);
          await logs?.releaseClaim(commentId, "dm", claimedAt).catch(() => {});
        }
      }
    }
  } else {
    // DM normal: private-reply al autor del comentario.
    if (dmAlreadySent) {
      dmSkipped = true;
    } else {
      // Claim atómico del DM (misma protección que el follow-gate DM).
      let claimedAt: number | null = Date.now(); // fail-open si la DB falla
      try {
        claimedAt = logs ? await logs.claimLeg(commentId, matched.ruleId ?? "", "dm", Date.now()) : Date.now();
      } catch (e) {
        console.warn("[zernio] claim DM falló (se procede sin control):", e);
      }
      if (claimedAt == null) {
        dmSkipped = true; // otro delivery ya reclamó/envió el DM
      } else {
        try {
          const res = await fetch(`${base}/v1/inbox/comments/${postId}/${commentId}/private-reply`, {
            method: "POST",
            headers,
            body: JSON.stringify({ accountId, message: dmMessage, buttons: buttons.length ? buttons : undefined }),
          });
          if (!res.ok) {
            const detail = await res.text().catch(() => "");
            // Instagram: "ya se ha enviado una respuesta privada" → el DM ya fue
            // (intento previo del webhook). Tratarlo como skipped.
            if (/respuesta privada|private reply|already|invalid for a private reply/i.test(detail)) {
              dmSkipped = true;
              console.warn(`[zernio] DM ya enviado antes — se omite (${commentId})`);
            } else {
              dmError = `HTTP ${res.status} ${detail.slice(0, 200)}`;
              console.error(`zernio DM falló: ${dmError}`);
              await logs?.releaseClaim(commentId, "dm", claimedAt).catch(() => {});
            }
          } else {
            dmSent = true;
            console.log(`[zernio] DM enviado por keyword: ${matched.keywords.join(",")}`);
          }
        } catch (e) {
          dmError = String((e as Error)?.message ?? e);
          console.error("zernio DM error:", e);
          await logs?.releaseClaim(commentId, "dm", claimedAt).catch(() => {});
        }
      }
    }
  }

  // 2) Respuesta pública al comentario (opcional por regla).
  // Claim atómico ANTES de enviar: solo la ejecución que gana el UPDATE
  // condicional publica. Cierra la carrera con el reintento del webhook — dos
  // deliveries del MISMO comentario pueden estar en vuelo a la vez (Zernio
  // reintenta si el worker tarda; la generación IA tarda segundos) y ambas
  // leerían public_reply_sent_at en NULL antes de que la primera guarde.
  if (publicReply) {
    if (publicAlreadySent) {
      publicSkipped = true; // ya publicada en un intento previo
    } else {
      let claimedAt: number | null = Date.now(); // fail-open si la DB falla
      try {
        claimedAt = logs ? await logs.claimLeg(commentId, matched.ruleId ?? "", "public", Date.now()) : Date.now();
      } catch (e) {
        console.warn("[zernio] claim público falló (se procede sin control):", e);
      }
      if (claimedAt == null) {
        publicSkipped = true; // otro delivery la reclamó/envió → NO responder 2 veces
      } else {
        const candidates = [publishAccountId, accountId].filter((v, i, a) => v && a.indexOf(v) === i);
        let lastError = "";
        for (const acc of candidates) {
          try {
            const res = await fetch(`${base}/v1/inbox/comments/${postId}`, {
              method: "POST",
              headers,
              body: JSON.stringify({ accountId: acc, message: publicReply, commentId }),
            });
            if (res.ok) {
              publicSent = true;
              lastError = "";
              console.log(`[zernio] respuesta pública enviada por keyword: ${matched.keywords.join(",")}`);
              break;
            }
            const detail = await res.text().catch(() => "");
            // "ya respondiste" / "already replied" → la pública ya fue; skipped.
            if (/ya respond|ya.*respuesta|already|duplicate/i.test(detail)) {
              publicSkipped = true;
              lastError = "";
              console.warn(`[zernio] reply público ya enviado antes — se omite (${commentId})`);
              break;
            }
            lastError = `HTTP ${res.status} ${detail.slice(0, 200)}`;
            console.error(`[zernio] reply público falló (cuenta ${acc}): ${lastError}`);
          } catch (e) {
            lastError = String((e as Error)?.message ?? e);
            console.error("zernio reply público error:", e);
          }
        }
        if (!publicSent && !publicSkipped) {
          publicError = lastError;
          // Falló de verdad: soltar el claim para que un intento posterior
          // (reintento del webhook) pueda reintentar la respuesta.
          await logs?.releaseClaim(commentId, "public", claimedAt).catch(() => {});
        }
        // Si publicSent o publicSkipped, el claim se mantiene: la respuesta ya
        // está publicada (la enviamos nosotros o un delivery previo).
      }
    }
  }

  // ── Registro del resultado ────────────────────────────────────────────────
  // Cada escritura va en su PROPIO try/catch. Antes todo el bloque estaba bajo
  // un único try: si `recordProcessedComment` o un `log()` fallaban, se saltaba
  // en silencio la actualización de la tabla `comments` — y el panel mostraba el
  // comentario como "sin automatización / sin DM / sin respuesta pública"
  // aunque el envío hubiera ocurrido. Separarlos hace que un fallo no borre la
  // evidencia de los demás.
  if (dmSent || publicSent) {
    try {
      await logs?.recordProcessedComment({
        commentId,
        ruleId: matched.ruleId ?? "",
        status: "sent",
        matchedKeyword: matched.keywords.join(","),
        dmSentAt: dmSent ? Date.now() : undefined,
        publicReplySentAt: publicSent ? Date.now() : undefined,
        error: dmError ?? publicError,
      });
    } catch (e) {
      console.warn("[zernio] no se pudo marcar el comentario como procesado:", e);
    }
  }

  // Un log por pierna para que el historial no mienta: cada intento de DM y de
  // respuesta pública queda con su propio estado (sent/skipped/failed).
  if (dmSent || dmSkipped || dmError) {
    try {
      await logs?.log({
        ruleId: matched.ruleId,
        kind: "comment_dm",
        platform: "instagram",
        target: commentId,
        username: commenterName ?? undefined,
        message: dmMessage,
        status: dmSent ? "sent" : dmError ? "failed" : "skipped",
        error: dmError,
      });
    } catch (e) {
      console.warn("[zernio] no se pudo registrar el log del DM:", e);
    }
  }
  if (publicReply && (publicSent || publicSkipped || publicError)) {
    try {
      await logs?.log({
        ruleId: matched.ruleId,
        kind: "comment_reply",
        platform: "instagram",
        target: commentId,
        username: commenterName ?? undefined,
        message: publicReply,
        status: publicSent ? "sent" : publicError ? "failed" : "skipped",
        error: publicError,
      });
    } catch (e) {
      console.warn("[zernio] no se pudo registrar el log de la respuesta pública:", e);
    }
  }

  // Actualizar el comentario registrado (pestaña Comentarios): qué regla
  // disparó y si el DM / respuesta pública se enviaron.
  try {
    const { Db } = await import("../db/client");
    const { CommentsRepo } = await import("../db/comments");
    await new CommentsRepo(new Db(env.DB)).upsert({
      id: commentId,
      ruleId: matched.ruleId,
      dmSent,
      publicReplySent: publicSent,
      publicReplyText: publicReply,
    });
  } catch (e) {
    console.warn("[zernio] no se pudo actualizar el comentario:", e);
  }

  return { dmSent, publicSent };
}

// El webhook de comment.received trae account.id = id de la PUBLICACIÓN, no el
// id de la cuenta social del inbox. private-reply exige el id social real (el
// que devuelve GET /v1/accounts) o responde 404 account_not_found. Resolvemos
// el id real por plataforma (+ username) con una caché corta de 5 min.
interface ZernioAccountInfo {
  id: string;
  platform: string;
  username?: string;
}

let _accountsCache: { at: number; list: ZernioAccountInfo[] } | null = null;

/** GET /v1/accounts con caché de 5 min: las cuentas sociales conectadas. */
async function fetchZernioAccounts(env: Env): Promise<ZernioAccountInfo[]> {
  if (_accountsCache && Date.now() - _accountsCache.at <= 5 * 60_000) {
    return _accountsCache.list;
  }
  const { apiKey } = await resolveZernioCredentials(env);
  const base = env.ZERNIO_API_BASE_URL ?? DEFAULT_BASE;
  let list: ZernioAccountInfo[] = [];
  if (apiKey) {
    try {
      const res = await fetch(`${base}/v1/accounts`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const json = (await res.json()) as { accounts?: Array<{ _id?: string; platform?: string; username?: string }> };
        list = (json.accounts ?? []).map((a) => ({
          id: String(a._id ?? ""),
          platform: String(a.platform ?? "").toLowerCase(),
          username: a.username ? String(a.username) : undefined,
        }));
      }
    } catch {
      /* cache miss → lista vacía */
    }
  }
  _accountsCache = { at: Date.now(), list };
  return list;
}

async function resolveInboxAccountId(env: Env, platform?: string, username?: string): Promise<string | undefined> {
  if (!platform) return undefined;
  const list = await fetchZernioAccounts(env);
  const plat = platform.toLowerCase();
  const hit =
    (username && list.find((a) => a.platform === plat && a.username === username)) ||
    list.find((a) => a.platform === plat);
  return hit?.id;
}

/**
 * ¿El autor del comentario es UNA de NUESTRAS propias cuentas conectadas?
 *
 * Anti-bucle: cuando el bot responde en público a un comentario, Zernio
 * reenvía ESA respuesta como un nuevo comment.received cuyo autor es la cuenta
 * del negocio. Sin este chequeo, si el texto de la respuesta contiene una
 * keyword de la regla (ej. la marca "Kooni"), el bot se respondía a sí mismo
 * en loop infinito (observado: 85+ respuestas propias en producción).
 */
async function isOwnCommenter(
  env: Env,
  commenter: { id?: string; username?: string } | undefined,
  account: ZernioWebhookBody["account"] | undefined,
): Promise<boolean> {
  if (!commenter) return false;

  // Señal sin API: el username del autor == username de la cuenta del webhook
  // (la cuenta que publicó el post). Comparación case-insensitive.
  const authorUser = (commenter.username ?? "").trim().toLowerCase();
  const hookUser = (account?.username ?? "").trim().toLowerCase();
  if (authorUser && hookUser && authorUser === hookUser) return true;

  // Chequeo con la lista de cuentas conectadas: cubre posts publicados desde
  // otra cuenta y casos donde el webhook no trae username del account.
  try {
    const accounts = await fetchZernioAccounts(env);
    const authorId = (commenter.id ?? "").trim();
    return accounts.some(
      (a) =>
        (authorId && a.id && a.id === authorId) ||
        (authorUser && a.username && a.username.toLowerCase() === authorUser),
    );
  } catch (e) {
    console.warn("[zernio] chequeo de cuenta propia falló:", e);
    return false;
  }
}

/** Solo para tests: limpia la caché de cuentas (evita contaminación entre casos). */
export function __resetZernioAccountsCache(): void {
  _accountsCache = null;
}

/**
 * Guarda un comentario recibido en la tabla comments (pestaña "Comentarios"
 * del panel, como Zernio). Se llama en cada comment.received, ANTES de la regla.
 */
async function recordZernioComment(body: ZernioWebhookBody, env: Env): Promise<void> {
  const comment = body.comment;
  const account = body.account;
  if (!comment?.id) return;
  try {
    const { Db } = await import("../db/client");
    const { CommentsRepo } = await import("../db/comments");
    const { ContactsRepo } = await import("../db/contacts");
    await new CommentsRepo(new Db(env.DB)).upsert({
      id: comment.id,
      postId: comment.postId ?? undefined,
      platformPostId: comment.platformPostId ?? undefined,
      text: comment.text ?? undefined,
      authorUsername: comment.author?.username,
      authorName: comment.author?.name,
      authorId: comment.author?.id,
      platform: comment.platform ?? account?.platform ?? "instagram",
      accountId: account?.accountId,
    });
    // Registrar el comentarista como contacto (todos los que interactúan).
    if (comment.author?.id) {
      await new ContactsRepo(new Db(env.DB)).touch({
        channel: "zernio",
        channelUserId: `${account?.accountId ?? ""}:${comment.author.id}`,
        displayName: comment.author.name,
        username: comment.author.username,
      });
    }
    // Contexto de la publicación (caption + permalink) para la pestaña
    // Comentarios: el payload de comment.received trae `post`; si falta, el
    // detalle del panel lo completa bajo demanda (GET /v1/inbox/comments/{postId}).
    try {
      const ctx = extractPostContext(body.post, comment.postId ?? comment.platformPostId);
      if (ctx) {
        const { CommentPostsRepo } = await import("../db/commentPosts");
        await new CommentPostsRepo(new Db(env.DB)).upsert({
          postId: ctx.postId,
          platformPostId: ctx.platformPostId ?? comment.platformPostId,
          platform: ctx.platform ?? comment.platform ?? account?.platform,
          accountId: account?.accountId,
          caption: ctx.caption,
          permalink: ctx.permalink,
          picture: ctx.picture,
        });
      }
    } catch (e) {
      console.warn("[zernio] no se pudo guardar el contexto del post:", e);
    }
  } catch (e) {
    console.warn("[zernio] no se pudo guardar el comentario:", e);
  }
}

/**
 * "Regla" sintética para los comentarios que NO matchean ninguna automatización.
 * Dos modos (el orden importa):
 *  1) IA (`comment_ai_fallback_enabled`): responde CUALQUIER comentario sin regla
 *     con una respuesta pública generada por el modelo del dueño (kind
 *     comment_reply + aiReplyPrompt; el texto lo produce `sendCommentActions`).
 *  2) Texto fijo (`commentFallbackEnabled`): respuesta pública genérica con
 *     `commentFallbackMessage`, como antes.
 * Default (ninguno activo): devuelve undefined y el comentario se ignora.
 */
async function buildCommentFallbackRule(env: Env): Promise<AutoDmRule | undefined> {
  try {
    const { Db } = await import("../db/client");
    const { SettingsRepo, SETTING_KEYS } = await import("../db/settings");
    const repo = new SettingsRepo(new Db(env.DB));

    if ((await repo.get(SETTING_KEYS.commentAiFallbackEnabled)) === "1") {
      const prompt = (await repo.get(SETTING_KEYS.commentAiFallbackPrompt))?.trim();
      return {
        keywords: [],
        message: "",
        kind: "comment_reply",
        // No vacío: sendCommentActions solo genera con IA si hay un prompt.
        aiReplyPrompt:
          prompt ||
          "Responde al comentario de forma breve y cálida, en el tono del negocio. " +
            "Si piden algo que no sabes, invítalos a escribir por privado.",
      };
    }

    if ((await repo.get(SETTING_KEYS.commentFallbackEnabled)) !== "1") return undefined;
    const message = (await repo.get(SETTING_KEYS.commentFallbackMessage))?.trim();
    if (!message) return undefined;
    return { keywords: [], message, kind: "comment_reply" };
  } catch (e) {
    console.warn("[zernio] no se pudo leer el fallback de comentarios:", e);
    return undefined;
  }
}

async function autoDmOnComment(body: ZernioWebhookBody, env: Env): Promise<void> {
  const comment = body.comment;
  const account = body.account;
  if (!comment || !account?.platform) return;
  const rules = await loadAutoDmRules(env);

  const text = comment.text ?? "";
  let matched = rules.find((r) =>
    matchKeywords(text, r.keywords, r.wholeWordMatch !== false).matched,
  );
  if (!matched) {
    // Ninguna automatización matcheó → si el dueño lo activó, respuesta pública
    // genérica (nunca DM). Si no, se ignora el comentario (comportamiento base).
    matched = await buildCommentFallbackRule(env);
    if (!matched) return;
  }

  // El account del webhook de comentarios NO es el id social del inbox: lo
  // resolvemos desde GET /v1/accounts solo cuando ya vamos a enviar
  // (private-reply exige el id real o responde 404 account_not_found).
  const accountId = (await resolveInboxAccountId(env, account.platform, account.username)) ?? account.accountId;
  if (!accountId) return;

  const postId = encodeURIComponent(comment.postId ?? comment.platformPostId ?? "");
  const commentId = comment.id ?? "";
  if (!postId || !commentId) return;

  // ── Tope diario de respuestas públicas (anti-flood de seguridad) ─────────
  // Aunque la keyword matchee, nunca más de N respuestas públicas por cuenta
  // en 24h. Red de seguridad: si algo vuelve a disparar en bucle (regla mal
  // configurada, keyword demasiado amplia), el bot se frena solo.
  try {
    const { Db } = await import("../db/client");
    const windowStart = Date.now() - 24 * 3600_000;
    const row = await new Db(env.DB).first<{ n: number }>(
      "SELECT COUNT(*) as n FROM comments WHERE account_id = ? AND public_reply_sent = 1 AND created_at > ?",
      [account.accountId ?? "", windowStart],
    );
    if ((row?.n ?? 0) >= MAX_PUBLIC_REPLIES_PER_DAY) {
      console.warn(`[zernio] tope diario de respuestas públicas alcanzado (${row?.n}/24h) — se omite (${commentId})`);
      try {
        const { Db } = await import("../db/client");
        const { DmLogsRepo } = await import("../db/dmLogs");
        await new DmLogsRepo(new Db(env.DB)).log({
          ruleId: matched.ruleId,
          kind: "comment_dm_public",
          platform: account.platform,
          target: commentId,
          username: comment.author?.username ?? comment.author?.name,
          message: matched.replyToComment ?? matched.message,
          status: "skipped",
          error: `Tope diario de respuestas públicas alcanzado (${row?.n}/24h). Se omite para no inundar al público.`,
        });
      } catch (e) {
        console.warn("[zernio] no se pudo registrar el skip por tope diario:", e);
      }
      return;
    }
  } catch (e) {
    console.warn("[zernio] check tope diario falló — fail-open:", e);
  }

  // ── Dedup por huella (post + autor + texto normalizado) ──────────────────
  // Zernio a veces reentrega el MISMO comentario con un comment.id distinto
  // (observado: hasta 7 ids para un mismo comentario). El dedup por id no lo
  // detecta; la huella es estable entre entregas. El claim es atómico (PK con
  // INSERT OR IGNORE): solo UNA ejecución gana → UN único mensaje de respuesta
  // por comentario real, siempre.
  const fp = commentFingerprint(
    comment.postId ?? comment.platformPostId ?? "",
    comment.author?.id ?? comment.author?.username ?? "",
    comment.text ?? "",
  );
  // ¿Esta regla espera una respuesta PÚBLICA? (comment_reply usa `message`;
  // comment_dm / comment_dm_public usan `replyToComment` o, si falta, una
  // respuesta generada con `aiReplyPrompt`).
  const wantsPublic =
    matched.kind === "comment_reply"
      ? !!matched.message?.trim()
      : !!matched.replyToComment?.trim() || !!matched.aiReplyPrompt?.trim();
  let fpClaimed = true;
  try {
    const { Db } = await import("../db/client");
    const { FingerprintsRepo } = await import("../db/fingerprints");
    const fpRepo = new FingerprintsRepo(new Db(env.DB));
    fpClaimed = await fpRepo.claim(fp, matched.ruleId ?? "", commentId, Date.now());
  } catch (e) {
    // Si el claim falla (DB caída), no bloqueamos: los demás controles
    // (dedup por id, rate limit, tope diario) siguen activos.
    console.warn("[zernio] claim por huella falló — fail-open:", e);
  }

  // ── Reentrega con una pata pendiente ─────────────────────────────────────
  // La huella marca el COMENTARIO, pero una regla tiene DOS patas (DM y
  // pública) que pueden completarse en momentos distintos. Si la primera
  // entrega mandó el DM (o el follow prompt) y la pública falló, la huella ya
  // está tomada y la reentrega se descartaba entera: la respuesta pública no
  // se reintentaba NUNCA. Aquí se detecta ese caso y se deja pasar; el claim
  // por pata (`claimLeg` en processed_comments) sigue evitando duplicados.
  // Id con el que se ejecuta el reintento. En una reentrega Zernio manda un id
  // nuevo; el estado por pata (y el claim) vive bajo el ORIGINAL, así que hay
  // que seguir usando el original para no perder el dedup.
  let effectiveCommentId = commentId;
  if (!fpClaimed) {
    let publicPending = false;
    if (wantsPublic) {
      try {
        const { Db } = await import("../db/client");
        const { DmLogsRepo } = await import("../db/dmLogs");
        const { FingerprintsRepo } = await import("../db/fingerprints");
        const db = new Db(env.DB);
        const original = await new FingerprintsRepo(db).get(fp);
        if (original?.commentId) effectiveCommentId = original.commentId;
        const rec = original
          ? await new DmLogsRepo(db).getProcessedComment(original.commentId)
          : null;
        publicPending = !rec || rec.publicReplySentAt == null;
      } catch {
        publicPending = false;
      }
    }
    if (!publicPending) {
      console.warn(`[zernio] comentario ya respondido antes (misma huella post+autor+texto) — se omite (${commentId})`);
      try {
        const { Db } = await import("../db/client");
        const { DmLogsRepo } = await import("../db/dmLogs");
        await new DmLogsRepo(new Db(env.DB)).log({
          ruleId: matched.ruleId,
          kind: "comment_dm_public",
          platform: account.platform,
          target: commentId,
          username: comment.author?.username ?? comment.author?.name,
          message: matched.replyToComment ?? matched.message,
          status: "skipped",
          error: "Deduplicado por huella (post+autor+texto): este comentario ya recibió respuesta en una entrega previa (Zernio lo reenvió con otro id).",
        });
      } catch (e) {
        console.warn("[zernio] no se pudo registrar el skip por huella:", e);
      }
      return;
    }
    console.log(`[zernio] reentrega con la respuesta pública pendiente — se reintenta solo esa pata (${commentId})`);
  }

  await sendCommentActions(
    matched,
    accountId,
    // La cuenta que publicó el post es la del webhook (la respuesta pública
    // la exige; el DM usa el inbox resuelto arriba).
    account.accountId ?? accountId,
    postId,
    effectiveCommentId,
    comment.author?.username ?? comment.author?.name,
    comment.author?.id,
    comment.text ?? undefined,
    env,
    String(account.platform ?? "instagram").toLowerCase(),
  ).then(async (result) => {
    // Si NO se envió nada (ni DM ni pública), soltamos el claim por huella:
    // si no, la siguiente reentrega del mismo comentario se descarta como
    // "deduplicado" y el comentario se queda sin respuesta para siempre
    // — aunque la automatización sí lo tenga configurado.
    if (!result.dmSent && !result.publicSent) {
      try {
        const { Db } = await import("../db/client");
        const { FingerprintsRepo } = await import("../db/fingerprints");
        await new FingerprintsRepo(new Db(env.DB)).release(fp);
        console.warn(`[zernio] sin envío para ${commentId} — claim de huella liberado para reintentar`);
      } catch (e) {
        console.warn("[zernio] no se pudo liberar el claim de huella:", e);
      }
    }
  });
}

/**
 * Auto-respuesta a DMs (reglas kind=dm_reply del panel): si un DM entrante
 * matchea una keyword, se responde al momento SIN pasar por el agente.
 * Devuelve true si se aplicó una regla (el mensaje NO debe ir a la IA).
 */
async function autoReplyOnDm(body: ZernioWebhookBody, env: Env): Promise<boolean> {
  const m = body.message;
  const conv = body.conversation;
  const account = body.account;
  if (!m || !conv?.id || !account?.accountId) return false;
  const text = (m.text ?? "").trim();

  // ── Botón presionado ─────────────────────────────────────────────────────
  // Zernio entrega el tap de un botón en `metadata.postbackPayload` (y su
  // etiqueta en `metadata.postbackTitle`), NO en `message.text` — que en un tap
  // suele venir vacío. Antes solo se miraba el texto + el prefijo "postback_"
  // de platformMessageId, así que en producción el "Ya te sigo" llegaba al
  // agente (o se descartaba) y el link nunca se entregaba.
  const meta = m.metadata ?? {};
  const postbackPayload = pickStr(
    meta.postbackPayload,
    meta.quickReplyPayload,
    meta.callbackData,
    meta.interactiveId,
  );
  // Señal secundaria: Zernio marca el id de mensaje con prefijo "postback_".
  const isPostback =
    typeof m.platformMessageId === "string" && m.platformMessageId.startsWith("postback_");
  if (!text && !postbackPayload && !isPostback) return false;
  // Texto equivalente a "botón presionado" cuando el payload viaja como texto.
  const tapText = text || meta.postbackTitle || "";

  const apiKey = (await resolveZernioCredentials(env)).apiKey;
  const base = env.ZERNIO_API_BASE_URL ?? DEFAULT_BASE;
  if (!apiKey) return false;

  // ── Confirmación del follow gate ─────────────────────────────────────────
  // El usuario tocó "Ya te sigo". El payload `followcheck:<ruleId>:<commentId>`
  // llega en `metadata.postbackPayload`; como respaldo usamos el texto (algunos
  // canales lo mandan ahí) y la fila pendiente guardada al enviar el DM (Zernio
  // no siempre reenvía el payload: en ese caso solo manda la etiqueta).
  const fgMatch = postbackPayload?.match(/^followcheck:([^:]*):(.*)$/) ??
    text.match(/^followcheck:([^:]*):(.*)$/);
  let fgRuleId = fgMatch ? fgMatch[1] : "";
  let fgCommentId = fgMatch ? fgMatch[2] : "";
  // Solo buscamos el pendiente cuando el tap PARECE el botón de follow. Un
  // `postbackPayload` cualquiera (ej. un botón "Agendar") NO debe caer aquí:
  // si hay un pendiente de follow de ese usuario, entregaría el link por error.
  const looksLikeFollowTap =
    /ya te sigo|sígueme|sigueme/i.test(tapText) ||
    /follow/i.test(postbackPayload ?? "") ||
    (isPostback && !postbackPayload);
  if (!fgMatch && looksLikeFollowTap) {
    try {
      const { Db } = await import("../db/client");
      // Buscamos por comentarista (no por cuenta): tras reconectar Zernio con
      // otra API key/account, el account_id guardado puede no coincidir.
      const row = await new Db(env.DB).first<{ rule_id: string; comment_id: string }>(
        `SELECT rule_id, comment_id FROM follow_gate_pending WHERE commenter_id = ? ORDER BY id DESC LIMIT 1`,
        [m.sender?.id ?? ""],
      );
      if (row) {
        fgRuleId = row.rule_id;
        fgCommentId = row.comment_id ?? "";
      } else {
        // Sin pendiente (se perdió en un deploy, falló el INSERT, o el DM salió
        // desde otra instancia). Antes el tap se descartaba EN SILENCIO y el
        // usuario se quedaba esperando el recurso para siempre — el síntoma
        // "le di ya te sigo y no se envió nada". Caemos a la automatización de
        // follow gate más reciente para poder verificar y responder igual.
        const fallbackRule = await new Db(env.DB).first<{ id: string }>(
          `SELECT id FROM auto_rules
            WHERE is_active = 1 AND require_follow = 1
              AND kind IN ('comment_dm','comment_dm_public','dm_reply')
            ORDER BY updated_at DESC LIMIT 1`,
          [],
        );
        if (fallbackRule?.id) {
          fgRuleId = fallbackRule.id;
          console.warn(`[zernio] follow tap sin pendiente — se usa la regla ${fallbackRule.id}`);
        }
      }
    } catch (e) {
      console.warn("[zernio] follow-gate pending lookup:", e);
    }
  }
  if (fgMatch || fgRuleId) {
    const ruleId = fgRuleId;
    if (!ruleId) return true;
    try {
      const { Db } = await import("../db/client");
      const { AutoRulesRepo } = await import("../db/autoRules");
      const rule = await new AutoRulesRepo(new Db(env.DB)).get(ruleId);
      if (!rule) return true; // regla borrada → ack

      // Verificar el follow AHORA. `refresh=true` salta la caché de Zernio: sin
      // eso, un follow de hace un minuto se lee como "no" y el bot vuelve a
      // pedirlo a alguien que ya siguió.
      const follow = await checkInstagramFollowStatus(env, {
        accountId: account.accountId,
        userId: m.sender?.id,
        refresh: true,
      });

      const convId = conv.id;
      const dmAccountId = account.accountId;
      const sendDm = (payload: Record<string, unknown>) =>
        fetch(`${base}/v1/inbox/conversations/${encodeURIComponent(convId)}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ accountId: dmAccountId, ...payload }),
        });
      const followBtn = [
        {
          type: "postback",
          title: (rule.followButtonLabel || "Ya te sigo").slice(0, 20),
          payload: `followcheck:${ruleId}:${fgCommentId}`,
        },
      ];

      // ── No sigue (o no se pudo verificar) → se le dice claramente ────────
      // `unknown` NO se trata como `no` a secas: si Meta no puede resolverlo
      // (nunca le ha escrito, DM desactivado, etc.) avisamos que aún no lo
      // vemos como seguidor y dejamos el botón para reintentar. Así el usuario
      // nunca se queda esperando un link que no llega.
      if (follow.status !== "yes") {
        // Mensaje configurable en el panel (Automatizaciones → follow gate).
        // IMPORTANTE: no reusamos `rule.followPromptMessage` — ese es el texto
        // con el que se le PIDIÓ seguir al principio. Aquí el usuario ya tocó
        // "Ya te sigo", así que hay que decirle claramente que todavía no se le
        // ve como seguidor.
        let configured = "";
        try {
          const { SettingsRepo, SETTING_KEYS } = await import("../db/settings");
          configured = (await new SettingsRepo(new Db(env.DB)).get(SETTING_KEYS.followGateNotFollowingMessage)) ?? "";
        } catch {
          /* sin settings → default */
        }
        const baseText = configured.trim() || "Todavía no me apareces como seguidor 🙏";
        const notFollowing =
          follow.status === "no"
            ? `${baseText} Sígueme y toca el botón otra vez para recibir el link 👇`
            : `${baseText} Si ya me sigues, espera unos segundos y vuelve a tocar el botón 👇`;
        await sendDm({
          message: toPlainLinks(renderUsername(notFollowing, m.sender?.name ?? m.sender?.username)),
          buttons: followBtn,
        });
        // El pendiente NO se borra: el usuario puede tocar el botón de nuevo.
        try {
          const { DmLogsRepo } = await import("../db/dmLogs");
          await new DmLogsRepo(new Db(env.DB)).log({
            ruleId,
            kind: "comment_dm",
            platform: account.platform,
            target: fgCommentId || conv.id,
            username: m.sender?.name ?? m.sender?.username,
            message: notFollowing,
            status: "skipped",
            error:
              follow.status === "no"
                ? "Follow gate: el usuario confirmó pero todavía no sigue la cuenta."
                : `Follow gate: no se pudo verificar el follow (${follow.reason ?? "sin motivo"}). Se le pidió reintentar.`,
          });
        } catch (e) {
          console.warn("[zernio] followcheck log error:", e);
        }
        return true;
      }

      // ── Sí sigue → entregar el recurso ───────────────────────────────────
      let buttonUrl = rule.buttonUrl;
      if (buttonUrl && ruleId) {
        try {
          const { TrackedLinksRepo } = await import("../db/trackedLinks");
          const link = await new TrackedLinksRepo(new Db(env.DB)).ensureForRule(ruleId, buttonUrl, rule.buttonLabel);
          const baseUrl = (env.DASHBOARD_BASE_URL ?? "").replace(/\/$/, "");
          buttonUrl = `${baseUrl}/r/${link.slug}`;
        } catch (e) {
          console.warn("[zernio] followcheck track link error:", e);
        }
      }
      const buttons: { type: string; title: string; url?: string; payload?: string }[] = [];
      if (buttonUrl) {
        buttons.push({ type: "url", title: (rule.buttonLabel || "Abrir").slice(0, 20), url: buttonUrl });
      }
      const dm = toPlainLinks(renderUsername(rule.message, m.sender?.name ?? m.sender?.username));
      await sendDm({ message: dm, buttons: buttons.length ? buttons : undefined });

      // Ya se cumplió el objetivo: limpiamos el pendiente.
      try {
        await new Db(env.DB).run(`DELETE FROM follow_gate_pending WHERE commenter_id = ?`, [
          m.sender?.id ?? "",
        ]);
      } catch {
        /* best-effort */
      }

      // Registrar la entrega tras el follow gate.
      try {
        const { DmLogsRepo } = await import("../db/dmLogs");
        await new DmLogsRepo(new Db(env.DB)).log({
          ruleId,
          kind: "comment_dm",
          platform: account.platform,
          target: fgCommentId || conv.id,
          username: m.sender?.name ?? m.sender?.username,
          message: dm,
          status: "sent",
          error: undefined,
        });
      } catch (e) {
        console.warn("[zernio] followcheck log error:", e);
      }
      return true;
    } catch (e) {
      console.error("[zernio] followcheck handler error:", e);
      return true; // ack para no reintentar
    }
  }

  let rules: AutoDmRule[] = [];
  try {
    const { Db } = await import("../db/client");
    const { AutoRulesRepo } = await import("../db/autoRules");
    const rows = await new AutoRulesRepo(new Db(env.DB)).list({ kind: "dm_reply", onlyActive: true });
    rules = rows.map((r) => ({ ruleId: r.id, keywords: r.keywords, message: r.message, buttonLabel: r.buttonLabel, buttonUrl: r.buttonUrl, wholeWordMatch: r.wholeWordMatch, requireFollow: r.requireFollow, followPromptMessage: r.followPromptMessage, followButtonLabel: r.followButtonLabel }));
  } catch (e) {
    console.warn("[zernio] dm_reply rules lookup failed:", e);
    return false;
  }
  if (rules.length === 0) return false;

  const matched = rules.find((r) => matchKeywords(text, r.keywords, r.wholeWordMatch !== false).matched);
  if (!matched) return false;

  // Trackear el link del botón (misma lógica que en comentarios).
  let buttonUrl = matched.buttonUrl;
  if (buttonUrl && matched.ruleId) {
    try {
      const { Db } = await import("../db/client");
      const { TrackedLinksRepo } = await import("../db/trackedLinks");
      const link = await new TrackedLinksRepo(new Db(env.DB)).ensureForRule(matched.ruleId, buttonUrl, matched.buttonLabel);
      const baseUrl = (env.DASHBOARD_BASE_URL ?? "").replace(/\/$/, "");
      buttonUrl = `${baseUrl}/r/${link.slug}`;
    } catch (e) {
      console.warn("[zernio] no se pudo trackear el link (DM):", e);
    }
  }

  const buttons: { type: string; title: string; url?: string; payload?: string }[] = [];
  if (buttonUrl) {
    buttons.push({ type: "url", title: matched.buttonLabel?.trim() || "Abrir", url: buttonUrl });
  }
  const dmMessage = toPlainLinks(renderUsername(matched.message, m.sender?.name ?? m.sender?.username));

  // Rate limit por cuenta antes de enviar (misma lógica que en comentarios).
  try {
    const { Db } = await import("../db/client");
    const { DmLogsRepo } = await import("../db/dmLogs");
    const logs = new DmLogsRepo(new Db(env.DB));
    if (!(await logs.reserveDmSlot(account.accountId))) {
      console.warn(`[zernio] rate limit (dm_reply): cuenta ${account.accountId} agotó su cupo — se salta`);
      await logs.log({
        ruleId: matched.ruleId,
        kind: "dm_reply",
        platform: account.platform,
        target: conv.id,
        username: m.sender?.name ?? m.sender?.username,
        message: dmMessage,
        status: "skipped",
        error: "Rate limit: la cuenta agotó su cupo de esta hora.",
      });
      return true;
    }
  } catch (e) {
    console.warn("[zernio] rate check (dm_reply) falló (se procede sin control):", e);
  }

  let ok = false;
  let err: string | undefined;
  try {
    const res = await fetch(`${base}/v1/inbox/conversations/${encodeURIComponent(conv.id)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: account.accountId, message: dmMessage, buttons: buttons.length ? buttons : undefined }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      err = `HTTP ${res.status} ${detail.slice(0, 200)}`;
      console.error(`zernio dm_reply falló: ${err}`);
    } else {
      ok = true;
      console.log(`[zernio] dm_reply enviado por keyword: ${matched.keywords.join(",")}`);
    }
  } catch (e) {
    err = String((e as Error)?.message ?? e);
    console.error("zernio dm_reply error:", e);
  }

  // Registrar el intento en el historial del panel.
  try {
    const { Db } = await import("../db/client");
    const { DmLogsRepo } = await import("../db/dmLogs");
    await new DmLogsRepo(new Db(env.DB)).log({
      ruleId: matched.ruleId,
      kind: "dm_reply",
      platform: account.platform,
      target: conv.id,
      username: m.sender?.name ?? m.sender?.username,
      message: dmMessage,
      status: ok ? "sent" : "failed",
      error: err,
    });
  } catch (e) {
    console.warn("[zernio] no se pudo registrar dm_reply log:", e);
  }

  return ok;
}

// ─── Parseo de eventos ───────────────────────────────────────────────────────
// Devuelve 0..N mensajes entrantes para el agente. Los comentarios no entran
// al agente: disparan el auto-DM (si aplica) y se descartan.
export async function parseZernioEvents(body: unknown, env: Env): Promise<IncomingMessage[]> {
  const b = (body ?? {}) as ZernioWebhookBody;
  const event = b.event ?? "";

  if (event === "message.received" || event === "message.sent") {
    const m = b.message;
    const conv = b.conversation;
    const account = b.account;
    if (!m) return [];
    const convId = conv?.id;
    const accountId = account?.accountId;
    if (!convId || !accountId) return [];

    // ── Mensaje SALIENTE ──────────────────────────────────────────────────
    // Zernio entrega TODO lo saliente por `message.sent`: lo que el dueño
    // escribe desde la app nativa del celular, lo que manda el bot y lo que
    // mandan las automatizaciones (respuestas de comentario, campañas,
    // secuencias). Antes solo se procesaba `message.received` con
    // direction=outgoing, que NO es el evento con el que Zernio manda los
    // salientes → el hilo del panel se quedaba sin lo enviado.
    //
    // `sentVia` dice quién lo produjo:
    //   null (o ausente) → app nativa del celular / respuesta manual
    //   human            → operador en el inbox de Zernio
    //   api / comment_automation / workflow / sequence / broadcast / bulk-api
    //                    → lo mandó el bot o una automatización
    if (m.direction === "outgoing" || event === "message.sent") {
      const { audio, image } = firstUrl(m);
      const marker = (m.text ?? "").trim();
      // Un saliente puede ser solo media (el dueño manda una foto desde el
      // celular): antes se descartaba por no tener texto.
      if (!marker && !image && !audio) return [];
      const via = (m.sentVia ?? "").toLowerCase();
      const byBot =
        via === "api" ||
        via === "comment_automation" ||
        via === "workflow" ||
        via === "sequence" ||
        via === "broadcast" ||
        via === "bulk-api";
      console.log(
        "[zernio] msg saliente:",
        JSON.stringify({ platform: account.platform, sentVia: m.sentVia ?? null, byBot }),
      );
      return [
        {
          channel: "zernio" as ChannelId,
          channelUserId: `${accountId}:${convId}`,
          displayName: conv?.participantName,
          text: marker || undefined,
          imageUrl: image,
          audioUrl: audio,
          ownerEcho: true,
          echoRole: byBot ? ("assistant" as const) : ("owner" as const),
          isOwnerMessage: false,
          receivedAt: Date.now(),
          rawPayload: b,
        },
      ];
    }
    if (m.direction !== "incoming") return [];

    // Flujo automático de DM (reglas dm_reply del panel): si una keyword
    // matchea, respondemos ya y el mensaje NO entra al agente.
    if (await autoReplyOnDm(b, env)) {
      console.log("[zernio] dm_reply automático aplicado — no entra al agente");
      return [];
    }

    const { audio, image } = firstUrl(m);
    const name = conv?.participantName || m.sender?.name || m.sender?.username;

    // channelUserId lleva accountId + conversationId (sendReply los necesita).
    console.log("[zernio] msg in:", JSON.stringify({ platform: account.platform, hasText: !!m.text, img: !!image, aud: !!audio }));
    return [
      {
        channel: "zernio" as ChannelId,
        channelUserId: `${accountId}:${convId}`,
        displayName: name,
        text: m.text ?? undefined,
        audioUrl: audio,
        imageUrl: image,
        isOwnerMessage: false,
        receivedAt: Date.now(),
        rawPayload: b,
      },
    ];
  }

  if (event === "comment.received") {
    const comment = b.comment;
    const account = b.account;

    // ── Anti-bucle de auto-respuesta ──────────────────────────────────────
    // Cuando el bot responde en público, Zernio reenvía ESA respuesta como un
    // comment.received nuevo (con id nuevo en cada entrega). Si el texto de la
    // respuesta contiene una keyword de la regla (ej. la marca "Kooni" en
    // "...la info de Kooni"), el bot se respondía a sí mismo en loop infinito
    // (observado: 85+ respuestas propias en producción). Se ignoran:
    //   1) comentarios de NUESTRAS propias cuentas (autor = el bot/negocio)
    //   2) comentarios que son RESPUESTAS a otro comentario (todo el loop son
    //      respuestas; las keywords de clientes reales vienen en comentarios
    //      de primer nivel del post)
    if (comment?.author && (await isOwnCommenter(env, comment.author, account))) {
      console.log(`[zernio] comentario de cuenta propia (${comment.author.username ?? comment.author.id}) — se ignora (anti-bucle)`);
      return [];
    }
    if (comment?.isReply) {
      console.log(`[zernio] comentario-respuesta (${comment.id}) — se ignora (anti-bucle)`);
      return [];
    }

    await recordZernioComment(b, env);
    await autoDmOnComment(b, env);
    return [];
  }

  // reaction.received y otros eventos de ciclo de vida: ack sin procesar.
  return [];
}

// ─── Adapter ─────────────────────────────────────────────────────────────────
export const zernioAdapter: ChannelAdapter = {
  // Existe por la interfaz; el webhook /webhooks/zernio usa parseZernioEvents
  // directamente (firma + varios eventos + side effects).
  async parseIncoming(request: Request, env: Env): Promise<IncomingMessage> {
    const body = (await request.json()) as unknown;
    const [first] = await parseZernioEvents(body, env);
    if (!first) throw new Error("zernio webhook sin mensaje procesable");
    return first;
  },

  async sendReply(reply: OutgoingReply, env: Env): Promise<void> {
    const { apiKey } = await resolveZernioCredentials(env);
    if (!apiKey) throw new Error("ZERNIO_API_KEY not set");
    const base = env.ZERNIO_API_BASE_URL ?? DEFAULT_BASE;
    // channelUserId = "<accountId>:<conversationId>"
    const sep = reply.channelUserId.indexOf(":");
    if (sep <= 0) throw new Error("zernio: channelUserId sin accountId");
    const accountId = reply.channelUserId.slice(0, sep);
    const conversationId = reply.channelUserId.slice(sep + 1);

    for (let i = 0; i < reply.chunks.length; i++) {
      const delay = i === 0 ? 0 : reply.interChunkDelayMs ?? 1000;
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      const isLast = i === reply.chunks.length - 1;
      const buttons =
        isLast && reply.buttons && reply.buttons.length > 0
          ? reply.buttons.map((b) => ({
              type: b.url ? "url" : "postback",
              title: b.text.slice(0, 20),
              ...(b.url ? { url: b.url } : {}),
              ...(b.callback ? { payload: b.callback } : {}),
            }))
          : undefined;
      // Multimedia: imagen/audio/documento como attachment del primer chunk
      // (Zernio lo soporta).
      const attachments =
        i === 0
          ? [
              ...(reply.imageUrl ? [{ type: "image", url: reply.imageUrl }] : []),
              ...(reply.audioUrl ? [{ type: "audio", url: reply.audioUrl }] : []),
              ...(reply.videoUrl ? [{ type: "video", url: reply.videoUrl }] : []),
              ...(reply.documentUrl ? [{ type: "document", url: reply.documentUrl }] : []),
            ]
          : undefined;
      const res = await fetch(`${base}/v1/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        // Sin timeout, un Zernio colgado bloquea el Durable Object (y con él la
        // conversación). 15s es más que suficiente para un POST de mensaje.
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          accountId,
          message: reply.chunks[i],
          ...(buttons && buttons.length ? { buttons } : {}),
          ...(attachments && attachments.length ? { attachments } : {}),
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`zernio send falló: ${res.status} ${detail.slice(0, 200)}`);
      }
    }
  },
};
