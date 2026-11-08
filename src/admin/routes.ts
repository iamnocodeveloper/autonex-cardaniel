/**
 * Admin dashboard routes (Hono sub-app mounted at `/admin`).
 *
 * Auth: sesión por cookie firmada (el humano, vía la página propia
 * `GET/POST /admin/login`) **o** HTTP Basic Auth (scripts, healthchecks y los
 * tests que mandan `Authorization: Basic ...`). Lo hace `adminAuth(env)` — ver
 * `auth.ts`. Usuario fijo "admin", contraseña en el secret `DASHBOARD_PASSWORD`;
 * la cookie se firma con esa misma contraseña, así que rotarla cierra todas las
 * sesiones. `/admin/login` y `/admin/logout` se registran ANTES del guard para
 * quedar fuera de él (en Hono un `app.use()` solo envuelve lo registrado
 * después).
 *
 * Because the auth middleware needs the per-request `Env` (to read
 * `DASHBOARD_PASSWORD` from the binding), it is applied inside a wildcard
 * middleware that has access to `c.env` rather than at module-init time.
 */
import { parsePeerBots } from "./projects";
import { Hono } from "hono";
import { generateText } from "ai";
import { createModel } from "../llm/provider";
import { loadLlmOverrides } from "../settings-loader";
import type { Env } from "../env";
import { adminAuth, hasValidSessionCookie, verifyDashboardPassword, setSessionCookie, clearSessionCookie } from "./auth";
import type { LoginAttemptsRepo } from "../db/loginAttempts";
import { AuditRepo } from "../db/auditLog";
import { runWithActor, recordAudit } from "../audit/context";
import { hashIp } from "../db/loginAttempts";
import { layout, renderUpgrade, loginPage } from "./views/layout";
import { isProUnlocked } from "../config";
import { renderOverview } from "./views/overview";
import { renderStats } from "./views/stats";
import { renderCosts } from "./views/costs";
import {
  renderInbox,
  renderInboxList,
  renderThreadLive,
  renderSuggestionBox,
  inboxParamsFrom,
} from "./views/conversations";
import { serveTelegramMedia, serveWahaMedia } from "./media";
import { pickAdapter } from "../replies/sender";
import { channelLabel } from "../channels/labels";
import type { ChannelId } from "../channels/shared";
import { renderInsights } from "./views/insights";
import { analyzeConversations } from "../insights/analyzer";
import { renderAgentePage, renderAgenteCanvas, renderNodeModal, toggleTool, toastOob } from "./views/agente";
import { renderKbList, renderKbEditor } from "./views/kb";
import { manifest as pwaManifest, serviceWorker as pwaServiceWorker, iconSvg as pwaIconSvg } from "./pwa";
import { KbDocsRepo, indexDoc, removeDocVectors, reindexAll, MAX_DOC_CHARS } from "../kb/docs";
import { renderMejoras } from "./views/mejoras";
import { runFlywheel, getLessons, saveLessons } from "../flywheel/detect";
import { applySuggestion, dismissSuggestion } from "../flywheel/apply";
import { renderLeads, exportLeadsCsv } from "./views/leads";
import { renderTickets } from "./views/tickets";
import { renderConfig } from "./views/config";
import { renderExtras } from "./views/extras";
import { renderAutomatizaciones } from "./views/automatizaciones";
import { renderEtiquetas } from "./views/etiquetas";
import { renderCotizaciones, renderCotizacionEditor } from "./views/cotizaciones";
import { renderDisparadores } from "./views/disparadores";
import { renderRecursos } from "./views/recursos";
import { renderComentarios, renderComentariosList, renderComentarioThread, renderComposeBox, commentsParamsFrom } from "./views/comentarios";
import { renderContactos } from "./views/contactos";
import { renderBloqueados } from "./views/bloqueados";
import { renderLicencia } from "./views/licencia";
import { renderComandos } from "./views/comandos";
import { renderEquipo } from "./views/equipo";
import { AutoRulesRepo, type AutoRuleKind } from "../db/autoRules";
import { CommentsRepo } from "../db/comments";
import { DmLogsRepo } from "../db/dmLogs";
import { replyToComment, privateReplyToComment, MAX_PUBLIC_REPLIES_PER_DAY } from "../channels/zernioComments";
import { generateAiCommentReply } from "../aiReply";
import { panelI18n, clearPanelLangCache } from "./i18n";
import { ChangeReviewsRepo } from "../db/changeReviews";

/** Parsea el form de una automatización (crear o editar) a un objeto de regla. */
function parseRuleForm(form: FormData) {
  const kind = String(form.get("kind") ?? "comment_dm") as AutoRuleKind;
  const platform = String(form.get("platform") ?? "all").trim() || "all";
  const keywords = String(form.get("keywords") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const message = String(form.get("message") ?? "").trim();
  const buttonLabel = String(form.get("button_label") ?? "").trim() || undefined;
  const buttonUrl = String(form.get("button_url") ?? "").trim() || undefined;
  const replyToComment = String(form.get("reply_to_comment") ?? "").trim() || undefined;
  const aiReplyPrompt = String(form.get("ai_reply_prompt") ?? "").trim() || undefined;
  const wholeWordMatch = String(form.get("whole_word_match") ?? "") !== "0";
  const requireFollow = String(form.get("require_follow") ?? "") === "1";
  const followPromptMessage = String(form.get("follow_prompt_message") ?? "").trim() || undefined;
  const followButtonLabel = String(form.get("follow_button_label") ?? "").trim() || undefined;
  return { kind, platform, keywords, message, buttonLabel, buttonUrl, replyToComment, aiReplyPrompt, wholeWordMatch, requireFollow, followPromptMessage, followButtonLabel };
}
import { renderConexiones } from "./views/conexiones";
import { resolveZernioCredentials } from "../channels/zernioCredentials";
import { renderCampanas } from "./views/campanas";
import { sendCampaign, createHandoffTemplate, contentApprovalStatus } from "../campaigns";
import { Db } from "../db/client";
import { LeadsRepo, type Lead } from "../db/leads";
import { TicketsRepo } from "../db/tickets";
import { ConversationsRepo, PAUSE_INDEFINITE } from "../db/conversations";
import { MessagesRepo } from "../db/messages";
import { SettingsRepo, SETTING_KEYS, type SettingKey } from "../db/settings";
import { isValidTimeZone } from "../timezone";
import { CONTROLS, levelToValue } from "./control-levels";
import { systemPromptFromEnv } from "../system-prompt";
import { renderBusinessContext } from "../businessContext";

export const adminApp = new Hono<{ Bindings: Env }>();

/**
 * Gate del límite de canales del plan gratis (`checkChannelLimit`). Devuelve una
 * respuesta de redirección con el error si NO se puede conectar un canal más, o
 * `null` si sí se puede (o si el canal ya estaba conectado, o Pro). Fail-open.
 * `channelId` es el id de `channelStatuses` (telegram, zernio, waha, mercadolibre);
 * `qsKey` es el prefijo del query string de error de esa card.
 */
async function channelLimitGate(
  c: { env: Env; redirect: (url: string) => Response },
  channelId: string,
  qsKey: string,
): Promise<Response | null> {
  try {
    const { countConnectedChannels } = await import("./views/conexiones");
    const { checkChannelLimit, channelLimitMessage } = await import("../limits");
    const { connected, byId } = await countConnectedChannels(c.env);
    const chk = await checkChannelLimit(c.env, connected, byId[channelId] === true);
    if (!chk.allowed) {
      return c.redirect(
        `/admin/conexiones?${qsKey}=error&msg=${encodeURIComponent(channelLimitMessage(chk.limit ?? 0))}`,
      );
    }
  } catch (e) {
    console.warn("[limits] channelLimitGate falló — fail-open:", e);
  }
  return null;
}

/**
 * Registro de auditoría (§ U) para eventos de login/logout — se llama a mano
 * porque estas rutas van ANTES del guard y del middleware de actor. Best-effort:
 * nunca bloquea ni rompe el login.
 */
async function auditAuthEvent(
  c: { req: { header: (k: string) => string | undefined; method: string; path: string }; env: Env },
  action: "login.ok" | "login.fail" | "login.blocked" | "logout",
  result: "ok" | "denied",
  ipHash?: string,
): Promise<void> {
  try {
    let hash = ipHash;
    if (!hash) {
      const ip =
        c.req.header("CF-Connecting-IP") ??
        c.req.header("X-Forwarded-For")?.split(",")[0]?.trim();
      if (ip) hash = hashIp(ip);
    }
    await new AuditRepo(new Db(c.env.DB)).log({
      action,
      result,
      actorName: action === "login.ok" ? "admin" : undefined,
      actorIpHash: hash,
      actorUa: (c.req.header("User-Agent") ?? "").slice(0, 180),
      method: c.req.method,
      path: c.req.path,
    });
  } catch (e) {
    console.warn("[audit] evento de auth:", e);
  }
}

/**
 * Registro de auditoría (§ U) para una acción del panel que NO pasa por
 * `SettingsRepo.set` (KB, automatizaciones, leads, tickets, conversaciones,
 * mejoras). El actor lo pone el middleware; best-effort, nunca bloquea.
 */
function audit(
  c: { env: Env },
  entry: {
    action: string;
    target?: string;
    targetLabel?: string;
    beforeVal?: string;
    afterVal?: string;
    result?: "ok" | "denied" | "error";
  },
): Promise<void> {
  return recordAudit(new Db(c.env.DB), entry);
}

// --- Login del panel (rutas PÚBLICAS — van antes del guard de abajo) ---------
// El humano entra por aquí: `GET /admin/login` pinta la página propia (dos
// columnas: marca + formulario, ver `loginPage` en views/layout.ts) y
// `POST /admin/login` valida el password contra `DASHBOARD_PASSWORD` y abre la
// sesión por cookie firmada. Basic Auth sigue funcionando en paralelo para
// scripts y tests (no pasan por acá).
adminApp.get("/login", async (c) => {
  // Solo se salta la página si YA hay cookie de sesión válida. Una credencial
  // Basic Auth vieja del navegador NO cuenta acá — si no, nunca vería el login.
  if (hasValidSessionCookie(c, c.env)) return c.redirect("/admin/overview", 302);
  const error = c.req.query("error");
  const { t } = await panelI18n(c.env);
  return c.html(loginPage({ env: c.env, error: error || undefined, t }));
});

adminApp.post("/login", async (c) => {
  const { t } = await panelI18n(c.env);
  const form = await c.req.formData().catch(() => null);
  const password = String(form?.get("password") ?? "");

  // Rate-limit por IP (S5): tras varios fallos, se rechaza sin comprobar la
  // contraseña. Fail-open: si D1 falla, se deja pasar.
  const ip = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For")?.split(",")[0]?.trim();
  let attempts: LoginAttemptsRepo | null = null;
  let ipHash = "";
  if (ip) {
    try {
      const { LoginAttemptsRepo, hashIp } = await import("../db/loginAttempts");
      attempts = new LoginAttemptsRepo(new Db(c.env.DB));
      ipHash = hashIp(ip);
      const gate = await attempts.check(ipHash);
      if (!gate.allowed) {
        const mins = Math.max(1, Math.ceil(gate.retryAfterSeconds / 60));
        await auditAuthEvent(c, "login.blocked", "denied", ipHash);
        return c.redirect(
          "/admin/login?error=" +
            encodeURIComponent(t("msg.loginTooManyAttempts", { mins })),
          302,
        );
      }
    } catch (e) {
      console.warn("[login] rate-limit check falló — fail-open:", e);
      attempts = null;
    }
  }

  if (!verifyDashboardPassword(c.env, password)) {
    if (attempts) await attempts.recordFailure(ipHash).catch(() => {});
    await auditAuthEvent(c, "login.fail", "denied", ipHash || undefined);
    return c.redirect(
      "/admin/login?error=" + encodeURIComponent(t("msg.loginWrongPassword")),
      302,
    );
  }

  if (attempts) await attempts.clear(ipHash).catch(() => {});
  setSessionCookie(c, c.env);
  await auditAuthEvent(c, "login.ok", "ok", ipHash || undefined);
  return c.redirect("/admin/overview", 302);
});

// Cerrar sesión: borra la cookie y manda al login. El guard de páginas ignora
// Basic Auth (solo cuenta la cookie), así que sin cookie el panel queda cerrado
// aunque el navegador todavía tenga una credencial Basic vieja guardada.
adminApp.get("/logout", async (c) => {
  clearSessionCookie(c);
  await auditAuthEvent(c, "logout", "ok");
  return c.redirect("/admin/login", 302);
});

// ── PWA (Fase 0) — públicas a propósito: el navegador pide el manifest y el
// service worker sin cookie. No exponen datos; el start_url del manifest sí
// pasa por el guard normal.
adminApp.get("/manifest.webmanifest", (c) =>
  new Response(pwaManifest(c.env), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  }),
);
adminApp.get("/sw.js", (c) =>
  new Response(pwaServiceWorker(), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/admin/",
      "Cache-Control": "no-cache",
    },
  }),
);
adminApp.get("/icon.svg", (c) =>
  new Response(pwaIconSvg(c.env), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  }),
);

// Guard every admin route with cookie session OR Basic Auth. The middleware factory needs the
// request-scoped Env to read DASHBOARD_PASSWORD, so build it per request here.
//
// ESCOTILLA `DASHBOARD_PUBLIC="1"`: apaga el guard por completo y deja el panel
// PÚBLICO (cualquiera lee conversaciones, leads y deudores, y puede cambiar la
// API key, mandar campañas o responder como el dueño). Pensada solo para
// demos/instalaciones descartables.
//
// La instalación cardaniel NO la tiene puesta (verificado: `/admin` responde 401
// y la var no está en los bindings del Worker). Comentario anterior decía que sí
// — era falso y llevaba a creer que el panel estaba abierto.
// Para desactivarla en cualquier instalación: quitar la var y redeploy.
adminApp.use("*", (c, next) => {
  if (c.env.DASHBOARD_PUBLIC === "1") return next();
  return adminAuth(c.env)(c, next);
});

// Contexto de auditoría (§ U): envolvemos cada request MUTANTE del panel para
// que toda escritura en D1 hecha dentro de ella quede ligada al operador
// (huella: hash de IP + navegador). Fuera de aquí (bot, crons) no hay actor y
// nada se audita. Se registra DESPUÉS del guard: solo acciones autenticadas.
adminApp.use("*", async (c, next) => {
  const m = c.req.method;
  if (m !== "POST" && m !== "PUT" && m !== "PATCH" && m !== "DELETE") return next();
  const ipRaw =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "";
  let ipHash: string | undefined;
  try {
    if (ipRaw) ipHash = hashIp(ipRaw);
  } catch {
    /* sin hash de IP — se registra igual sin él */
  }
  return runWithActor(
    {
      name: "admin",
      ipHash,
      ua: (c.req.header("User-Agent") ?? "").slice(0, 180),
      method: m,
      path: c.req.path,
    },
    () => next(),
  );
});

// MODELO (2026-09-07): sin gate de tier por feature. TODAS las secciones del
// panel están disponibles en todos los planes; free y Pro se diferencian solo
// por los límites de cantidad (src/limits.ts). Se deja `PRO_GATE` vacío por si
// se quiere volver a un modelo con paywall.
const PRO_GATE: Array<[string, string]> = [];
adminApp.use("*", async (c, next) => {
  if (PRO_GATE.length === 0) return next();
  const path = c.req.path;
  const hit = PRO_GATE.find(([pre]) => path === pre || path.startsWith(pre + "/"));
  if (hit && !(await isProUnlocked(c.env))) return c.html(await renderUpgrade(c.env, hit[1]));
  return next();
});

// Página de upgrade (item bloqueado del nav apunta aquí).
adminApp.get("/upgrade", async (c) => c.html(await renderUpgrade(c.env)));

// Root → default tab.
adminApp.get("/", (c) => c.redirect("/admin/overview"));

// Selector de proyectos (header): instancia actual + hermanas de PEER_BOTS.
adminApp.get("/projects", async (c) => {
  const { t } = await panelI18n(c.env);
  return c.json({ current: c.env.BOT_NAME ?? t("msg.botNameFallback"), peers: parsePeerBots(c.env) });
});

// --- Read-only tabs ---------------------------------------------------------

adminApp.get("/overview", async (c) => c.html(await renderOverview(c.env)));

adminApp.get("/stats", async (c) => c.html(await renderStats(c.env)));

adminApp.get("/costs", async (c) => c.html(await renderCosts(c.env, c.req.query("saved") === "1")));

// Monthly AI budget (Costos tab). Empty value clears the cap.
adminApp.post("/costs/budget", async (c) => {
  const form = await c.req.formData();
  const raw = String(form.get("monthly_budget") ?? "").trim();
  const n = Number.parseFloat(raw);
  const value = raw !== "" && Number.isFinite(n) && n > 0 ? String(n) : "";
  await new SettingsRepo(new Db(c.env.DB)).set(SETTING_KEYS.monthlyBudget, value);
  return c.redirect("/admin/costs?saved=1");
});

// --- Conocimiento (KB editable, F4) -------------------------------------------

adminApp.get("/kb", async (c) =>
  c.html(
    await renderKbList(c.env, {
      saved: c.req.query("saved") === "1",
      deleted: c.req.query("deleted") === "1",
      reindexed: c.req.query("reindexed") ?? undefined,
      websync: c.req.query("websync") ?? undefined,
      minscore: c.req.query("minscore") ?? undefined,
    }),
  ),
);

// Probar búsqueda: corre la MISMA consulta que la tool searchKb del bot y
// muestra el top-5 con score. Sirve para ver qué encuentra (o no) el bot.
adminApp.get("/kb/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const { renderKbSearchResults } = await import("./views/kb");
  if (q.length < 2) return c.html(renderKbSearchResults(q, null));
  const { queryKb, resolveKbMinScore } = await import("../kb/query");
  const [res, minScore] = await Promise.all([queryKb(c.env, q), resolveKbMinScore(c.env)]);
  return c.html(renderKbSearchResults(q, res, minScore));
});

// Umbral de coincidencia de la KB (settings.kb_min_score). Fuera de rango o
// vacío → se borra y vuelve al default (KB_MIN_SCORE_DEFAULT).
adminApp.post("/kb/min-score", async (c) => {
  const form = await c.req.formData();
  const n = Number.parseFloat(String(form.get("kb_min_score") ?? ""));
  const value = Number.isFinite(n) && n >= 0 && n <= 1 ? String(n) : "";
  await new SettingsRepo(new Db(c.env.DB)).set(SETTING_KEYS.kbMinScore, value);
  const { KB_MIN_SCORE_DEFAULT } = await import("../kb/query");
  return c.redirect(`/admin/kb?minscore=${value || KB_MIN_SCORE_DEFAULT.toFixed(2)}`);
});

adminApp.get("/kb/new", async (c) => c.html(await renderKbEditor(null, c.env)));

adminApp.get("/kb/:id/edit", async (c) => {
  const doc = await new KbDocsRepo(new Db(c.env.DB)).getById(c.req.param("id"));
  if (!doc) return c.redirect("/admin/kb");
  return c.html(await renderKbEditor(doc, c.env));
});

// Save = persist in D1 + index into Vectorize immediately (stale vectors for
// the doc are blanket-deleted first), so searchKb uses it on the next message.
adminApp.post("/kb/save", async (c) => {
  const form = await c.req.formData();
  const title = String(form.get("title") ?? "").trim().slice(0, 200);
  const content = String(form.get("content") ?? "").trim().slice(0, MAX_DOC_CHARS);
  if (!title || !content) return c.redirect("/admin/kb");

  const rawId = String(form.get("id") ?? "").trim();
  const id = rawId || crypto.randomUUID();
  const repo = new KbDocsRepo(new Db(c.env.DB));
  const prev = rawId ? await repo.getById(rawId) : null;
  await repo.upsert({ id, title, content });
  const doc = (await repo.getById(id))!;
  await indexDoc(c.env, doc);
  await audit(c, {
    action: prev ? "kb.doc.update" : "kb.doc.create",
    target: `kb:${id}`,
    targetLabel: title,
    beforeVal: prev ? `${prev.title} (${prev.content.length} car.)` : undefined,
    afterVal: `${title} (${content.length} car.)`,
  });
  return c.redirect("/admin/kb?saved=1");
});

adminApp.post("/kb/:id/delete", async (c) => {
  const id = c.req.param("id");
  const repo = new KbDocsRepo(new Db(c.env.DB));
  const doc = await repo.getById(id);
  await repo.delete(id);
  await removeDocVectors(c.env, id);
  await audit(c, {
    action: "kb.doc.delete",
    target: `kb:${id}`,
    targetLabel: doc?.title ?? id,
    beforeVal: doc ? `${doc.title} (${doc.content.length} car.)` : undefined,
  });
  return c.redirect("/admin/kb?deleted=1");
});

// Global reindex: repo fixtures + every dashboard doc.
adminApp.post("/kb/reindex", async (c) => {
  const r = await reindexAll(c.env);
  return c.redirect(`/admin/kb?reindexed=${r.indexed}`);
});

// ── PWA push (avisos al celular del dueño) ───────────────────────────────────
adminApp.get("/push/config", async (c) => {
  const { pushConfigured, vapidPublicKey } = await import("../push");
  return c.json({ configured: pushConfigured(c.env), publicKey: vapidPublicKey(c.env) });
});

adminApp.post("/push/subscribe", async (c) => {
  const body = await c.req.json().catch(() => null) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null;
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (!endpoint || !p256dh || !auth) return c.json({ ok: false }, 400);
  const { PushSubsRepo } = await import("../db/push");
  await new PushSubsRepo(new Db(c.env.DB)).upsert({ endpoint, p256dh, auth });
  return c.json({ ok: true });
});

adminApp.post("/push/unsubscribe", async (c) => {
  const body = await c.req.json().catch(() => null) as { endpoint?: string } | null;
  if (body?.endpoint) {
    const { PushSubsRepo } = await import("../db/push");
    await new PushSubsRepo(new Db(c.env.DB)).remove(body.endpoint);
  }
  return c.json({ ok: true });
});

// El service worker lo pide al recibir un push (que va sin cuerpo).
adminApp.get("/push/latest", async (c) => {
  const { t } = await panelI18n(c.env);
  const { PushEventsRepo } = await import("../db/push");
  const ev = await new PushEventsRepo(new Db(c.env.DB)).takeLatest();
  return c.json(
    ev
      ? { title: ev.title, body: ev.body, url: ev.url }
      : { title: c.env.BRAND_NAME || "Kooni", body: t("msg.pushFallbackBody"), url: "/admin/overview" },
  );
});

// Aviso de prueba (botón "Enviar aviso de prueba").
adminApp.post("/push/test", async (c) => {
  const { t } = await panelI18n(c.env);
  const { notifyOwnerPush } = await import("../push");
  await notifyOwnerPush(c.env, { title: t("msg.pushTestTitle"), body: t("msg.pushTestBody"), url: "/admin/overview" });
  return c.json({ ok: true });
});

// Web Sync manual (módulo web_sync): scrapea ya las páginas configuradas.
adminApp.post("/kb/web-sync", async (c) => {
  const { t } = await panelI18n(c.env);
  const { runWebSync } = await import("../kb/webSync");
  const r = await runWebSync(c.env, { trigger: "manual" });
  let msg: string;
  if (r.skipped) {
    msg = t("msg.kbWebSyncSkipped", { skipped: r.skipped });
  } else {
    msg = t("msg.kbWebSyncUpdated", { updated: r.updated, unchanged: r.unchanged });
    if (r.vehicles !== undefined) {
      msg += ` · ${t("msg.kbWebSyncVehicles", { vehicles: r.vehicles })}`;
      if ((r.imagesPending ?? 0) > 0) msg += ` · ${t("msg.kbWebSyncImagesPending", { imagesPending: r.imagesPending ?? 0 })}`;
    }
    if ((r.added ?? 0) > 0 || (r.removed ?? 0) > 0 || (r.changed ?? 0) > 0) {
      msg += ` · ${t("msg.kbWebSyncDelta", { added: r.added ?? 0, removed: r.removed ?? 0, changed: r.changed ?? 0 })}`;
    }
    if (r.errors.length) {
      // Mostrar el primer error concreto (no solo el conteo).
      const e = r.errors[0];
      msg += ` · ${t("msg.kbWebSyncError", { path: `${new URL(e.url).pathname}${new URL(e.url).search}`, error: e.error.slice(0, 160) })}`;
    }
  }
  // Las fotos de autos nuevos/cambiados van en background (delta acotado).
  if (r.vehicles !== undefined && (r.imagesPending ?? 0) > 0) {
    c.executionCtx.waitUntil(
      (async () => {
        const { refreshVehicleImages } = await import("../kb/inventory");
        const { Db } = await import("../db/client");
        const img = await refreshVehicleImages(c.env, new Db(c.env.DB)).catch((e) => {
          console.error("webSync fotos (background):", e);
          return { fetched: 0, failed: 0, pending: 0 };
        });
        console.log(`[webSync] fotos en background: ${img.fetched} ok, ${img.failed} fallaron, ${img.pending} pendientes`);
      })(),
    );
  }
  return c.redirect(`/admin/kb?websync=${encodeURIComponent(msg)}`);
});

// ── Registro de scraping (/admin/scraping) ───────────────────────────────────
// Ventana de solo lectura con lo que pasó en cada corrida de Decodo: autos
// nuevos, vendidos y campos cambiados. Ver src/db/webSyncLog.ts.
adminApp.get("/scraping", async (c) => {
  const { renderScraping } = await import("./views/scraping");
  const beforeRaw = Number(c.req.query("before"));
  return c.html(
    await renderScraping(c.env, {
      run: c.req.query("run") || undefined,
      trigger: c.req.query("trigger") || undefined,
      before: Number.isFinite(beforeRaw) && beforeRaw > 0 ? beforeRaw : undefined,
      ok: c.req.query("ok") || undefined,
      err: c.req.query("err") || undefined,
      rev: c.req.query("rev") || undefined,
    }),
  );
});

// Validar un cambio de scraping: confirmado / descartado / pendiente (↺ = limpia).
adminApp.post("/scraping/changes/:id/review", async (c) => {
  const id = c.req.param("id");
  const form = await c.req.formData();
  const raw = String(form.get("status") ?? "");
  const repo = new ChangeReviewsRepo(new Db(c.env.DB));
  if (raw === "confirmed" || raw === "rejected") {
    await repo.set(id, raw, undefined, undefined).catch(() => {});
    await audit(c, { action: "scraping.review", target: id, afterVal: raw, result: "ok" });
  } else {
    await repo.clear(id).catch(() => {});
    await audit(c, { action: "scraping.review", target: id, afterVal: "pending", result: "ok" });
  }
  const back = String(form.get("back") ?? "");
  return c.redirect(/^\/admin\//.test(back) ? back : "/admin/scraping");
});

// Inventario sincronizado: TODOS los autos del store, con búsqueda, filtros
// (sin precio / sin foto / nuevos / usados) y paginación. Antes la pestaña solo
// mostraba el diff de la corrida.
adminApp.get("/scraping/inventario", async (c) => {
  const { renderInventario } = await import("./views/inventario");
  const pageRaw = Number.parseInt(c.req.query("page") ?? "", 10);
  return c.html(
    await renderInventario(c.env, {
      q: c.req.query("q") || undefined,
      f: c.req.query("f") || undefined,
      page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : undefined,
      flash: c.req.query("flash") || undefined,
    }),
  );
});

// Importar autos desde CSV/Excel (giro concesionario, pero sirve a cualquier
// instalación con inventario): los autos entran al MISMO store que Web Sync con
// `source: "csv"`, así el scraping nocturno no los borra. El resumen en la KB
// se reindexa aparte: si Vectorize/AI no están listos no se pierde la carga.
adminApp.post("/scraping/inventario/import", async (c) => {
  const { t } = await panelI18n(c.env);
  const { mapCsvToVehicles, mergeCsvVehicles, buildAndIndexAutosResumen } = await import("../kb/vehiclesCsv");
  const { loadVehicleStore, saveVehicleStore } = await import("../kb/inventory");
  const form = await c.req.formData();
  const csv = String(form.get("csv") ?? "");
  const back = (msg: string) => c.redirect(`/admin/scraping/inventario?flash=${encodeURIComponent(msg)}`);
  if (!csv.trim()) return back(t("inv.msg.importEmpty"));
  const { vehicles, errors } = mapCsvToVehicles(csv);
  const firstErr = errors[0] ? t("inv.msg.line", { line: errors[0].line, motivo: errors[0].motivo }) : "";
  if (vehicles.length === 0) return back(t("inv.msg.importNone", { detail: firstErr }).trim());
  const db = new Db(c.env.DB);
  const store = await loadVehicleStore(db);
  const res = mergeCsvVehicles(store, vehicles, { replace: form.get("replace") === "1" });
  await saveVehicleStore(db, res.store);
  await buildAndIndexAutosResumen(c.env, db, res.store).catch((e) =>
    console.warn("[inventario] no se pudo indexar el resumen:", e),
  );
  await audit(c, {
    action: "inventario.import",
    target: "settings:web_sync_vehicles",
    targetLabel: "Inventario de autos (CSV)",
    afterVal: `${res.added} nuevos, ${res.updated} actualizados, ${errors.length} con problema`,
  });
  const msg =
    t("inv.msg.importOk", { n: res.added, updated: res.updated, errors: errors.length }) +
    (firstErr ? ` · ${firstErr}` : "");
  return back(msg);
});

adminApp.post("/scraping/inventario/duplicados/unmark", async (c) => {
  const { t } = await panelI18n(c.env);
  const form = await c.req.formData().catch(() => null);
  const key = String(form?.get("key") ?? "").trim();
  if (!key) return c.redirect("/admin/scraping/inventario");
  const { loadVehicleStore, saveVehicleStore } = await import("../kb/inventory");
  const db = new Db(c.env.DB);
  const store = await loadVehicleStore(db);
  const v = store.vehicles[key];
  if (v?.duplicateOf) {
    delete v.duplicateOf;
    await saveVehicleStore(db, store);
    await audit(c, {
      action: "inventario.unmark_duplicate",
      target: `vehicle:${key}`,
      targetLabel: v.title,
    });
  }
  return c.redirect(`/admin/scraping/inventario?flash=${encodeURIComponent(t("inv.dup.unmarked"))}`);
});

adminApp.get("/scraping/export.csv", async (c) => {
  const { exportScrapingCsv } = await import("./views/scraping");
  const beforeRaw = Number(c.req.query("before"));
  const csv = await exportScrapingCsv(c.env, {
    trigger: c.req.query("trigger") || undefined,
    before: Number.isFinite(beforeRaw) && beforeRaw > 0 ? beforeRaw : undefined,
  });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="scraping-${Date.now()}.csv"`,
    },
  });
});

// Scrapeo manual desde el registro (mismo pipeline que /kb/web-sync).
adminApp.post("/scraping/run", async (c) => {
  const { t } = await panelI18n(c.env);
  const { runWebSync } = await import("../kb/webSync");
  const r = await runWebSync(c.env, { trigger: "manual" });
  if (r.skipped) return c.redirect(`/admin/scraping?err=${encodeURIComponent(t("msg.scrapingSkipped", { skipped: r.skipped }))}`);
  if (r.vehicles !== undefined && (r.imagesPending ?? 0) > 0) {
    c.executionCtx.waitUntil(
      (async () => {
        const { refreshVehicleImages } = await import("../kb/inventory");
        const { Db } = await import("../db/client");
        await refreshVehicleImages(c.env, new Db(c.env.DB)).catch((e) => console.error("scraping fotos (background):", e));
      })(),
    );
  }
  const msg =
    t("msg.scrapingOk", { added: r.added ?? 0, removed: r.removed ?? 0, changed: r.changed ?? 0, vehicles: r.vehicles ?? 0 }) +
    (r.errors.length ? ` · ${t("msg.scrapingErrors", { n: r.errors.length })}` : "");
  return c.redirect(`/admin/scraping?ok=${encodeURIComponent(msg)}`);
});

// Enriquecimiento manual por tandas: descripción/versión/foto/precio de hasta
// 60 fichas. Se corre varias veces para completar un inventario grande.
adminApp.post("/scraping/fichas", async (c) => {
  const { t } = await panelI18n(c.env);
  const { refreshVehicleImages } = await import("../kb/inventory");
  const r = await refreshVehicleImages(c.env, new Db(c.env.DB), { max: 60, force: true });
  const msg = t("scr.enrichDone", { ok: r.fetched, failed: r.failed, pending: r.pending });
  return c.redirect(`/admin/scraping?ok=${encodeURIComponent(msg)}`);
});

// ── Nicho INMOBILIARIA: propiedades (/admin/propiedades) ─────────────────────
// El nav solo la muestra si BOT_NICHE=inmobiliaria (hooks.navExtra del pack);
// igual redirigimos si no es el giro, para no servir una vista vacía por URL
// directa. La vista tiene dos entradas: pegar/subir un CSV y leer el sitio.
function isInmobiliaria(c: { env: Env }): boolean {
  return (c.env.BOT_NICHE ?? "").trim().toLowerCase() === "inmobiliaria";
}

adminApp.get("/propiedades", async (c) => {
  if (!isInmobiliaria(c)) return c.redirect("/admin/overview");
  const { renderPropiedades } = await import("./views/propiedades");
  const pageRaw = Number.parseInt(c.req.query("page") ?? "", 10);
  // Igual que las vistas vecinas: el flash llega por `?flash=`; `?saved=1` se
  // mantiene por compatibilidad con los formularios que ya usan ese estilo.
  const flash =
    c.req.query("flash") ||
    (c.req.query("saved") === "1" ? (await panelI18n(c.env)).t("props.msg.saved") : undefined);
  return c.html(
    await renderPropiedades(c.env, {
      q: c.req.query("q") || undefined,
      f: c.req.query("f") || undefined,
      page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : undefined,
      flash,
    }),
  );
});

// Importar propiedades: parsea el CSV/TSV pegado (o volcado por FileReader desde
// el archivo), mezcla con el store —sin pisar la foto/datos ya enriquecidos— y
// reindexa el doc de resumen que consume el bot.
adminApp.post("/propiedades/import", async (c) => {
  if (!isInmobiliaria(c)) return c.redirect("/admin/overview");
  const { t } = await panelI18n(c.env);
  const { mapCsvToPropiedades } = await import("../kb/propertiesCsv");
  const { loadPropiedadStoreFromDb, mergePropiedades, savePropiedadStore } = await import("../kb/properties");
  const { buildAndIndexPropiedadesResumen } = await import("../kb/propertiesScrape");
  const form = await c.req.formData();
  const csv = String(form.get("csv") ?? "");
  if (!csv.trim()) return c.redirect(`/admin/propiedades?flash=${encodeURIComponent(t("props.msg.importEmpty"))}`);
  const db = new Db(c.env.DB);
  const { props, errors } = mapCsvToPropiedades(csv);
  const store = await loadPropiedadStoreFromDb(db);
  const res = mergePropiedades(store, props);
  await savePropiedadStore(db, res.store);
  // El store ya quedó guardado: si falta el índice (Vectorize/AI sin configurar)
  // no se pierde la importación — se avisa y se sigue.
  await buildAndIndexPropiedadesResumen(c.env, db, res.store).catch((e) =>
    console.warn("[propiedades] no se pudo indexar el resumen:", e),
  );
  await audit(c, {
    action: "propiedades.import",
    target: "settings:web_sync_properties",
    targetLabel: "Inventario de propiedades",
    afterVal: `${res.added} nuevas, ${res.updated} actualizadas, ${errors.length} con error`,
  });
  const msg = t("props.msg.importOk", { n: res.added, updated: res.updated, errors: errors.length });
  return c.redirect(`/admin/propiedades?flash=${encodeURIComponent(msg)}`);
});

// Leer el sitio de la inmobiliaria: descubre las fichas, las scrapea con el
// proveedor configurado (AIsa/Decodo) y actualiza el store. Es una acción manual
// (puede tardar: recorre varias fichas), por eso va por su propio POST.
adminApp.post("/propiedades/sync", async (c) => {
  if (!isInmobiliaria(c)) return c.redirect("/admin/overview");
  const { t } = await panelI18n(c.env);
  const { runPropertiesSync } = await import("../kb/propertiesScrape");
  const form = await c.req.formData();
  const site = String(form.get("site") ?? "").trim();
  const r = await runPropertiesSync(c.env, { siteUrl: site || undefined });
  await audit(c, {
    action: "propiedades.sync",
    target: "settings:web_sync_properties",
    targetLabel: "Lectura del sitio (propiedades)",
    afterVal: `${r.found} fichas, ${r.added} nuevas, ${r.updated} actualizadas, ${r.errors.length} errores`,
  });
  const msg = !r.found && !r.scraped
    ? t("props.msg.syncEmpty")
    : t("props.msg.syncOk", {
        scraped: r.scraped,
        added: r.added,
        updated: r.updated,
        errors: r.errors.length,
        source: r.source,
      });
  return c.redirect(`/admin/propiedades?flash=${encodeURIComponent(msg)}`);
});

// --- Handoff: plantilla HSM del aviso al dueño ---------------------------------

// Setup one-shot: crea la plantilla en la Content API de Twilio, la somete a
// aprobación de WhatsApp (UTILITY) y guarda el ContentSid en settings —
// notifyOwner la usa como fallback del secret, sin pasos manuales.
adminApp.post("/handoff/template/setup", async (c) => {
  const r = await createHandoffTemplate(c.env);
  if ("error" in r) return c.json(r, 502);
  await new SettingsRepo(new Db(c.env.DB)).set(SETTING_KEYS.twilioHandoffContentSid, r.sid);
  return c.json(r);
});

// Estado de aprobación de la plantilla del handoff (approved | pending | …).
adminApp.get("/handoff/template/status", async (c) => {
  const { t } = await panelI18n(c.env);
  const sid =
    c.env.TWILIO_HANDOFF_CONTENT_SID ||
    (await new SettingsRepo(new Db(c.env.DB)).get(SETTING_KEYS.twilioHandoffContentSid));
  if (!sid) return c.json({ error: t("msg.configHandoffNoTemplate") }, 404);
  const r = await contentApprovalStatus(c.env, sid);
  return c.json({ sid, ...r });
});

// --- Mejoras (flywheel, F5) ----------------------------------------------------

adminApp.get("/mejoras", async (c) =>
  c.html(
    await renderMejoras(c.env, {
      found: c.req.query("found") ?? undefined,
      applied: c.req.query("applied") === "1",
      dismissed: c.req.query("dismissed") === "1",
    }),
  ),
);

// Run the detectors on demand (they also run nightly from scheduled()).
adminApp.post("/mejoras/run", async (c) => {
  const r = await runFlywheel(c.env);
  return c.redirect(`/admin/mejoras?found=${r.created}`);
});

adminApp.post("/mejoras/:id/apply", async (c) => {
  const id = c.req.param("id");
  const ok = await applySuggestion(c.env, id);
  await audit(c, { action: "mejora.apply", target: `mejora:${id}`, result: ok ? "ok" : "error" });
  return c.redirect(ok ? "/admin/mejoras?applied=1" : "/admin/mejoras");
});

adminApp.post("/mejoras/:id/dismiss", async (c) => {
  const id = c.req.param("id");
  const ok = await dismissSuggestion(c.env, id);
  await audit(c, { action: "mejora.dismiss", target: `mejora:${id}`, result: ok ? "ok" : "error" });
  return c.redirect(ok ? "/admin/mejoras?dismissed=1" : "/admin/mejoras");
});

// Autonomía del flywheel: manual (default) o copiloto (auto-aplica lo seguro
// en el cron nocturno — KB sin huecos y lecciones; lo delicado sigue en cola).
adminApp.post("/mejoras/autonomy", async (c) => {
  const form = await c.req.formData();
  const level = String(form.get("level") ?? "manual") === "copilot" ? "copilot" : "manual";
  await new SettingsRepo(new Db(c.env.DB)).set(SETTING_KEYS.autonomyLevel, level);
  return c.redirect("/admin/mejoras");
});

// Remove one lesson from the prompt (the ✕ next to each active lesson).
adminApp.post("/mejoras/lessons/remove", async (c) => {
  const form = await c.req.formData();
  const lesson = String(form.get("lesson") ?? "");
  const lessons = (await getLessons(c.env)).filter((l) => l !== lesson);
  await saveLessons(c.env, lessons);
  return c.redirect("/admin/mejoras");
});

// Inbox (F1): two-pane view. ?c=<id> selects the thread; ?f/?q filter the list.
adminApp.get("/conversations", async (c) =>
  c.html(await renderInbox(c.env, inboxParamsFrom((k) => c.req.query(k)))),
);

// HTMX fragments (polled): left list every 10s, thread every 5s. Registered
// before /conversations/:id so the static segments win the match.
adminApp.get("/conversations/list-fragment", async (c) =>
  c.html(await renderInboxList(c.env, inboxParamsFrom((k) => c.req.query(k)))),
);

adminApp.get("/conversations/thread/:id", async (c) =>
  c.html(await renderThreadLive(c.env, c.req.param("id"))),
);

// Old detail URLs (linked from Insights, notifications, etc.) → inbox selection.
adminApp.get("/conversations/:id", (c) =>
  c.redirect(`/admin/conversations?c=${encodeURIComponent(c.req.param("id"))}`),
);

// Previsualización de media entrante en el hilo (§ V Fase 2) — proxy
// autenticado (mismo guard de /admin/*): el token/API key nunca llega al
// navegador. Ver src/admin/media.ts.
adminApp.get("/media/telegram", (c) => serveTelegramMedia(c.req.query("u") ?? "", c.env));
adminApp.get("/media/waha", (c) => serveWahaMedia(c.req.query("u") ?? "", c.env));

// ── Laboratorio (auto-evaluación del agente) ────────────────────────────────
// Corre escenarios/clientes simulados contra el agente REAL en sandbox (no
// persiste ni manda nada) y los puntúa con un juez IA. Ver src/lab/*.
adminApp.get("/laboratorio", async (c) => {
  const { renderLaboratorio } = await import("./views/laboratorio");
  return c.html(await renderLaboratorio(c.env));
});

adminApp.get("/laboratorio/run/:id", async (c) => {
  const { renderLaboratorio } = await import("./views/laboratorio");
  return c.html(await renderLaboratorio(c.env, c.req.param("id")));
});

adminApp.post("/laboratorio/run", async (c) => {
  const { LabRepo } = await import("../db/lab");
  const { runLab, DEFAULT_LAB_THRESHOLD, DEFAULT_LAB_MAX } = await import("../lab/run");
  const f = await c.req.formData();
  const kind = String(f.get("kind") ?? "quick") === "personas" ? "personas" : "quick";
  const repo = new LabRepo(new Db(c.env.DB));
  const runId = await repo.createRun({ kind, threshold: DEFAULT_LAB_THRESHOLD });
  // La corrida es secuencial y puede tardar: se ejecuta en segundo plano y la
  // vista hace poll mientras status="running".
  c.executionCtx.waitUntil(runLab(c.env, runId, { kind, maxScenarios: DEFAULT_LAB_MAX }));
  await audit(c, { action: "lab.run", target: `lab:${runId}`, targetLabel: kind });
  return c.redirect(`/admin/laboratorio/run/${runId}`);
});

// Insights tab. Visiting it opportunistically grades a few pending
// conversations in the background (waitUntil) so the tab catches up on its own
// even without pressing "Analizar ahora". TODO: move the main run to
// scheduled() in index.ts once the channels/meta work in flight there lands.
adminApp.get("/insights", async (c) => {
  try {
    c.executionCtx.waitUntil(
      analyzeConversations(c.env, { limit: 3 }).catch((e) =>
        console.error("[insights] background analysis failed:", e),
      ),
    );
  } catch {
    // no executionCtx (tests) — render without background catch-up
  }
  return c.html(await renderInsights(c.env, c.req.query("analyzed") ?? undefined));
});

// "Analizar ahora": grade up to 10 pending conversations inline, then redirect
// back with the count for the confirmation banner.
adminApp.post("/insights/analyze", async (c) => {
  const result = await analyzeConversations(c.env, { limit: 10 });
  return c.redirect(`/admin/insights?analyzed=${result.analyzed}`);
});

// "Mi Agente": n8n-style canvas of how the bot works. The canvas fragment is
// polled by HTMX every 15s (live activity pulse); node panels load on click.
adminApp.get("/agente", async (c) => c.html(await renderAgentePage(c.env)));

// Probar el bot — chat de prueba (no persiste, no manda por canal).
adminApp.get("/probar", async (c) => {
  const { renderProbar } = await import("./views/probar");
  return c.html(await renderProbar(c.env));
});
adminApp.post("/probar/send", async (c) => {
  const { t } = await panelI18n(c.env);
  const body = (await c.req.json().catch(() => null)) as
    | { text?: string; history?: { role: "user" | "assistant"; content: string }[] }
    | null;
  const text = (body?.text ?? "").trim();
  if (!text) return c.json({ error: t("msg.probarEmpty") }, 400);
  const history = Array.isArray(body?.history)
    ? body!.history.filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    : [];
  try {
    const { runTestTurn } = await import("./playground");
    const r = await runTestTurn(c.env, history, text);
    return c.json(r);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

adminApp.get("/agente/canvas", async (c) => c.html(await renderAgenteCanvas(c.env)));

adminApp.get("/agente/node/:id", async (c) =>
  c.html(await renderNodeModal(c.env, c.req.param("id"))),
);

// Save a node's config from its modal. Writes the relevant settings (with
// clamps), re-renders the modal with a saved banner + toast, and fires the
// `canvas-refresh` event so the diagram updates immediately.
adminApp.post("/agente/node/:id/save", async (c) => {
  const id = c.req.param("id");
  const { t } = await panelI18n(c.env);
  const form = await c.req.formData();
  const repo = new SettingsRepo(new Db(c.env.DB));

  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
  const num = (key: string): number | null => {
    const raw = form.get(key);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  if (id === "buffer") {
    const s = num("buffer_seconds");
    if (s !== null) await repo.set(SETTING_KEYS.bufferSeconds, String(Math.round(clamp(s, 1, 60))));
  } else if (id === "reply") {
    const chunks = num("max_chunks");
    if (chunks !== null) await repo.set(SETTING_KEYS.maxChunks, String(Math.round(clamp(chunks, 1, 5))));
    const delayS = num("inter_chunk_delay_s");
    if (delayS !== null)
      await repo.set(SETTING_KEYS.interChunkDelayMs, String(Math.round(clamp(delayS, 0, 5) * 1000)));
  } else if (id === "model") {
    const m = String(form.get("model_override") ?? "");
    if (m === "auto" || m === "haiku" || m === "sonnet") await repo.set(SETTING_KEYS.modelOverride, m);
    const temp = num("temperature");
    if (temp !== null) await repo.set(SETTING_KEYS.temperature, String(clamp(temp, 0, 1)));
  } else if (id === "brain") {
    // Three sub-actions share the brain modal: reset-to-auto, pause toggle,
    // and saving the manual prompt. Checked in that priority order.
    if (String(form.get("action") ?? "") === "reset") {
      await repo.set(SETTING_KEYS.systemPromptOverride, "");
    } else if (form.get("bot_paused") !== null) {
      await repo.set(SETTING_KEYS.botPaused, String(form.get("bot_paused")) === "1" ? "1" : "0");
    } else if (form.get("channel_pause") !== null) {
      // Pausa por canal: form manda "channel_pause=<canal>" + "channel_paused=1|0".
      // Mantiene la lista JSON de canales pausados (paused_channels).
      const channel = String(form.get("channel_pause")).trim();
      const pause = String(form.get("channel_paused")) === "1";
      if (channel) {
        let list: string[] = [];
        try {
          const raw = await repo.get(SETTING_KEYS.pausedChannels);
          if (raw) list = JSON.parse(raw);
        } catch {
          list = [];
        }
        if (!Array.isArray(list)) list = [];
        list = pause
          ? [...new Set([...list, channel])]
          : list.filter((c) => c !== channel);
        await repo.set(SETTING_KEYS.pausedChannels, JSON.stringify(list));
      }
    } else if (form.get("custom_instructions") !== null) {
      // El campo ADITIVO: se suma al prompt generado sin congelarlo. Guardar
      // vacío = quitar las instrucciones (por eso no se filtra el "").
      await repo.set(SETTING_KEYS.customInstructions, String(form.get("custom_instructions")).trim());
    } else if (form.get("system_prompt_override") !== null) {
      await repo.set(SETTING_KEYS.systemPromptOverride, String(form.get("system_prompt_override")).trim());
    }
  } else {
    return c.text(t("msg.agenteUnknownNode"), 404);
  }

  c.header("HX-Trigger", "canvas-refresh");
  return c.html((await renderNodeModal(c.env, id, true)) + toastOob(t("msg.saved")));
});

// Toggle a tool on/off (settings.disabled_tools). Returns the refreshed modal;
// the canvas badge updates via the canvas-refresh event.
adminApp.post("/agente/tools/:name/toggle", async (c) => {
  const { t } = await panelI18n(c.env);
  const name = c.req.param("name");
  const ok = await toggleTool(c.env, name);
  if (!ok) return c.text(t("msg.agenteToolNotFound"), 404);
  c.header("HX-Trigger", "canvas-refresh");
  return c.html((await renderNodeModal(c.env, `tool:${name}`, true)) + toastOob(t("msg.saved")));
});

adminApp.get("/leads", async (c) =>
  c.html(await renderLeads(c.env, c.req.query("vista") === "tabla" ? "tabla" : "kanban")),
);

adminApp.get("/tickets", async (c) => c.html(await renderTickets(c.env)));

// ── Etiquetas (módulo etiquetas_ia) ─────────────────────────────────────────
// Catálogo del usuario + reglas que las aplican solas (palabra clave o IA).
adminApp.get("/etiquetas", async (c) => c.html(await renderEtiquetas(c.env, c.req.query("saved") === "1")));

adminApp.post("/etiquetas/save", async (c) => {
  const form = await c.req.formData().catch(() => null);
  const name = String(form?.get("name") ?? "").trim();
  if (name) {
    const { LabelsRepo } = await import("../db/labels");
    const { Db } = await import("../db/client");
    const id = await new LabelsRepo(new Db(c.env.DB)).upsert({
      name,
      color: String(form?.get("color") ?? "").trim() || null,
      icon: String(form?.get("icon") ?? "").trim() || null,
      description: String(form?.get("description") ?? "").trim() || null,
    });
    await audit(c, { action: "label.create", target: `label:${id}`, targetLabel: name });
  }
  return c.redirect("/admin/etiquetas?saved=1");
});

adminApp.post("/etiquetas/:id/save", async (c) => {
  const id = c.req.param("id");
  const form = await c.req.formData().catch(() => null);
  const name = String(form?.get("name") ?? "").trim();
  if (name) {
    const { LabelsRepo } = await import("../db/labels");
    const { Db } = await import("../db/client");
    await new LabelsRepo(new Db(c.env.DB)).upsert({
      id,
      name,
      color: String(form?.get("color") ?? "").trim() || null,
      icon: String(form?.get("icon") ?? "").trim() || null,
      description: String(form?.get("description") ?? "").trim() || null,
    });
  }
  return c.redirect("/admin/etiquetas?saved=1");
});

adminApp.post("/etiquetas/:id/toggle", async (c) => {
  const id = c.req.param("id");
  const { LabelsRepo } = await import("../db/labels");
  const { Db } = await import("../db/client");
  const repo = new LabelsRepo(new Db(c.env.DB));
  const row = await repo.get(id);
  if (row) await repo.setEnabled(id, row.enabled === 0);
  return c.redirect("/admin/etiquetas?saved=1");
});

adminApp.post("/etiquetas/:id/delete", async (c) => {
  const { LabelsRepo } = await import("../db/labels");
  const { Db } = await import("../db/client");
  const labelId = c.req.param("id");
  await new LabelsRepo(new Db(c.env.DB)).remove(labelId);
  await audit(c, { action: "label.delete", target: `label:${labelId}` });
  return c.redirect("/admin/etiquetas?saved=1");
});

adminApp.post("/etiquetas/:id/rules/save", async (c) => {
  const labelId = c.req.param("id");
  const form = await c.req.formData().catch(() => null);
  const kind = String(form?.get("kind") ?? "keyword") === "ai" ? "ai" : "keyword";
  const keywords = String(form?.get("keywords") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const instruction = String(form?.get("instruction") ?? "").trim() || null;
  const hasContent = kind === "ai" ? !!instruction : keywords.length > 0;
  if (hasContent) {
    const { LabelsRepo } = await import("../db/labels");
    const { Db } = await import("../db/client");
    await new LabelsRepo(new Db(c.env.DB)).upsertRule({ labelId, kind, keywords, aiInstruction: instruction });
    await audit(c, { action: "label.rule.save", target: `label:${labelId}`, afterVal: kind });
  }
  return c.redirect("/admin/etiquetas?saved=1");
});

adminApp.post("/etiquetas/rules/:ruleId/delete", async (c) => {
  const { LabelsRepo } = await import("../db/labels");
  const { Db } = await import("../db/client");
  await new LabelsRepo(new Db(c.env.DB)).removeRule(c.req.param("ruleId"));
  return c.redirect("/admin/etiquetas?saved=1");
});

// Etiqueta automática al capturar un lead (captureLead). Vacío = ninguna.
adminApp.post("/etiquetas/capture-label", async (c) => {
  const form = await c.req.formData().catch(() => null);
  const label = String(form?.get("label") ?? "").trim();
  const { SettingsRepo, SETTING_KEYS } = await import("../db/settings");
  const { Db } = await import("../db/client");
  await new SettingsRepo(new Db(c.env.DB)).set(SETTING_KEYS.captureAutoLabel, label);
  await audit(c, { action: "label.capture_auto", target: "settings", afterVal: label || "(ninguna)" });
  return c.redirect("/admin/etiquetas?saved=1");
});

// ── Cotizaciones (nicho eventos y otros) ────────────────────────────────────
adminApp.get("/cotizaciones", async (c) => c.html(await renderCotizaciones(c.env)));

adminApp.get("/cotizaciones/:id", async (c) => c.html(await renderCotizacionEditor(c.env, c.req.param("id"))));

adminApp.post("/cotizaciones/:id/save", async (c) => {
  const id = c.req.param("id");
  const form = await c.req.formData().catch(() => null);
  const get = (k: string) => String(form?.get(k) ?? "").trim();
  const { QuotesRepo } = await import("../db/quotes");
  const { Db } = await import("../db/client");
  const repo = new QuotesRepo(new Db(c.env.DB));
  const names = form?.getAll("item_name") ?? [];
  const descs = form?.getAll("item_desc") ?? [];
  const qtys = form?.getAll("item_qty") ?? [];
  const prices = form?.getAll("item_price") ?? [];
  const items = names
    .map((n, i) => ({
      name: String(n).trim(),
      description: String(descs[i] ?? "").trim() || null,
      qty: Number(qtys[i] ?? 0) || 0,
      unitPrice: Number(prices[i] ?? 0) || 0,
    }))
    .filter((it) => it.name);
  await repo.update(id, {
    clientName: get("client_name") || null,
    clientContact: get("client_contact") || null,
    eventType: get("event_type") || null,
    eventDate: get("event_date") || null,
    eventPlace: get("event_place") || null,
    guests: Number(get("guests")) || null,
    currency: get("currency") || "USD",
    validUntil: get("valid_until") || null,
    discount: Number(get("discount")) || 0,
    tax: Number(get("tax")) || 0,
    deposit: Number(get("deposit")) || 0,
    notes: get("notes") || null,
  });
  if (items.length) await repo.setItems(id, items);
  await audit(c, { action: "quote.save", target: `quote:${id}`, afterVal: `${items.length} ítems` });
  return c.redirect(`/admin/cotizaciones/${encodeURIComponent(id)}`);
});

adminApp.post("/cotizaciones/:id/send", async (c) => {
  const id = c.req.param("id");
  const { QuotesRepo } = await import("../db/quotes");
  const { Db } = await import("../db/client");
  const { sendQuoteToCustomer } = await import("../quotes/send");
  const quote = await new QuotesRepo(new Db(c.env.DB)).get(id);
  const res = await sendQuoteToCustomer(c.env, id, { resend: (quote?.sent_count ?? 0) > 0 });
  await audit(c, { action: "quote.send", target: `quote:${id}`, afterVal: res.ok ? "enviada" : `error: ${res.message ?? ""}` });
  return c.redirect(`/admin/cotizaciones/${encodeURIComponent(id)}`);
});

adminApp.post("/cotizaciones/:id/status", async (c) => {
  const id = c.req.param("id");
  const form = await c.req.formData().catch(() => null);
  const status = String(form?.get("status") ?? "draft");
  const { QuotesRepo, QUOTE_STATUSES } = await import("../db/quotes");
  const { Db } = await import("../db/client");
  if ((QUOTE_STATUSES as readonly string[]).includes(status)) {
    await new QuotesRepo(new Db(c.env.DB)).setStatus(id, status as any);
    await audit(c, { action: "quote.status", target: `quote:${id}`, afterVal: status });
  }
  return c.redirect(`/admin/cotizaciones/${encodeURIComponent(id)}`);
});

adminApp.get("/cotizaciones/:id/pdf", async (c) => {
  const id = c.req.param("id");
  const { QuotesRepo } = await import("../db/quotes");
  const { Db } = await import("../db/client");
  const { buildQuoteHtml } = await import("../quotes/template");
  const { htmlToPdf } = await import("../quotes/pdf");
  const { quoteFilename } = await import("../quotes/link");
  const repo = new QuotesRepo(new Db(c.env.DB));
  const quote = await repo.get(id);
  if (!quote) return c.text("Cotización no encontrada", 404);
  const html = await buildQuoteHtml(c.env, quote, await repo.items(id));
  const pdf = await htmlToPdf(c.env, html);
  if (pdf) {
    return new Response(pdf as unknown as BodyInit, {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${quoteFilename(quote)}"` },
    });
  }
  return c.html(html);
});

// ── Disparadores (automatizaciones keyword→flujo, multi-canal) ───────────────
async function saveDisparador(env: Env, form: FormData | null, id?: string): Promise<string | null> {
  const get = (k: string) => String(form?.get(k) ?? "").trim();
  const name = get("name");
  if (!name) return null;
  const action = (get("action") || "reply_fixed") as any;
  const payloadStr = get("payload");
  const actionPayload: Record<string, unknown> = {};
  if (action === "reply_fixed") actionPayload.message = payloadStr;
  else if (action === "reply_ai") actionPayload.instruction = payloadStr;
  else if (action === "label") actionPayload.label = payloadStr;
  else if (action === "capture_lead") actionPayload.intent = payloadStr;
  else if (action === "handoff") actionPayload.reason = payloadStr;

  const steps = get("steps")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|");
      const delay = parts[0];
      let rest = parts.slice(1);
      // Tercer campo opcional `@recurso`: adjunta un recurso de la biblioteca
      // al paso (imagen/nota de voz/PDF). El `@` lo distingue de un `|` en el texto.
      let resource: string | undefined;
      if (rest.length > 1 && rest[rest.length - 1].trim().startsWith("@")) {
        resource = rest[rest.length - 1].trim().slice(1).trim() || undefined;
        rest = rest.slice(0, -1);
      }
      let content = rest.join("|").trim();
      let kind: "text" | "ai" = "text";
      // Prefijo "ai:" → ese paso lo redacta la IA con esa instrucción.
      if (/^ai:/i.test(content)) {
        kind = "ai";
        content = content.slice(3).trim();
      }
      return { delayMinutes: Number(delay) || 0, kind, content, ...(resource ? { resource } : {}) };
    })
    .filter((s) => s.content || s.resource);

  const { TriggersRepo } = await import("../db/triggers");
  const { Db } = await import("../db/client");
  const repo = new TriggersRepo(new Db(env.DB));
  const triggerId = await repo.upsert({
    id,
    name,
    scope: get("scope") || "any",
    matchKind: (get("match_kind") || "keyword") as any,
    keywords: get("keywords").split(",").map((s) => s.trim()).filter(Boolean),
    aiInstruction: get("ai_instruction") || null,
    action,
    actionPayload,
    priority: Number(get("priority")) || 0,
    runOncePerConversation: form?.get("run_once") != null,
  });
  if (action === "flow") await repo.setSteps(triggerId, steps);
  return triggerId;
}

adminApp.get("/disparadores", async (c) => c.html(await renderDisparadores(c.env, c.req.query("saved") === "1")));

adminApp.post("/disparadores/save", async (c) => {
  const form = await c.req.formData().catch(() => null);
  const id = await saveDisparador(c.env, form);
  if (id) await audit(c, { action: "trigger.create", target: `trigger:${id}` });
  return c.redirect("/admin/disparadores?saved=1");
});

adminApp.post("/disparadores/:id/save", async (c) => {
  const form = await c.req.formData().catch(() => null);
  const id = await saveDisparador(c.env, form, c.req.param("id"));
  if (id) await audit(c, { action: "trigger.update", target: `trigger:${id}` });
  return c.redirect("/admin/disparadores?saved=1");
});

adminApp.post("/disparadores/:id/toggle", async (c) => {
  const id = c.req.param("id");
  const { TriggersRepo } = await import("../db/triggers");
  const { Db } = await import("../db/client");
  const repo = new TriggersRepo(new Db(c.env.DB));
  const tr = await repo.get(id);
  if (tr) await repo.setEnabled(id, tr.enabled === 0);
  return c.redirect("/admin/disparadores?saved=1");
});

adminApp.post("/disparadores/:id/delete", async (c) => {
  const { TriggersRepo } = await import("../db/triggers");
  const { Db } = await import("../db/client");
  const id = c.req.param("id");
  await new TriggersRepo(new Db(c.env.DB)).remove(id);
  await audit(c, { action: "trigger.delete", target: `trigger:${id}` });
  return c.redirect("/admin/disparadores?saved=1");
});

// ── Galería de recursos (biblioteca multimedia: imagen / nota de voz / PDF) ──
// Sube archivos al almacén (R2 si hay binding `MEDIA`, si no D1) y los guarda
// en el setting `resource_library`. El bot los usa con la tool enviarRecurso.
adminApp.get("/recursos", async (c) =>
  c.html(
    await renderRecursos(
      c.env,
      {
        saved: c.req.query("saved") === "1",
        deleted: c.req.query("deleted") === "1",
        error: c.req.query("error") || undefined,
      },
      c.req.query("edit") || undefined,
    ),
  ),
);

adminApp.post("/recursos/save", async (c) => {
  const { SettingsRepo, SETTING_KEYS } = await import("../db/settings");
  const { Db } = await import("../db/client");
  const { parseResourceLibrary } = await import("../resources/library");
  const { putMedia, maxMediaBytes } = await import("../media/store");
  const { mimeFromName, kindFromMime } = await import("../media/mime");

  const form = await c.req.formData().catch(() => null);
  const get = (k: string) => String(form?.get(k) ?? "").trim();
  const name = get("name");
  if (!name) return c.redirect("/admin/recursos?error=" + encodeURIComponent("Falta el nombre del recurso"));

  const repo = new SettingsRepo(new Db(c.env.DB));
  const lib = parseResourceLibrary(await repo.get(SETTING_KEYS.resourceLibrary));

  // El archivo subido tiene prioridad sobre la URL pegada.
  let url = get("url");
  let kind: "image" | "audio" | "video" | "document" = (get("kind") || "image") as "image" | "audio" | "video" | "document";
  let filename: string | undefined;
  const file = form?.get("file");
  if (file && typeof file === "object" && "arrayBuffer" in file && (file as File).size > 0) {
    const f = file as File;
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (bytes.byteLength > maxMediaBytes(c.env)) {
      return c.redirect("/admin/recursos?error=" + encodeURIComponent("El archivo supera el tamaño máximo permitido"));
    }
    const mime = f.type || mimeFromName(f.name);
    kind = kindFromMime(mime);
    const stored = await putMedia(c.env, bytes, { mime, name: f.name || name, kind });
    url = stored.url;
    filename = stored.name;
  }
  if (!url) return c.redirect("/admin/recursos?error=" + encodeURIComponent("Subí un archivo o pegá una URL"));

  const keywords = get("keywords").split(",").map((s) => s.trim()).filter(Boolean);
  const prev = lib[name];
  lib[name] = {
    name,
    kind,
    url,
    ...(filename ? { filename } : {}),
    ...(get("caption") ? { caption: get("caption") } : {}),
    ...(get("when") ? { when: get("when") } : {}),
    ...(keywords.length ? { keywords } : {}),
    ...(kind === "audio" ? { asVoice: form?.get("asVoice") != null } : {}),
    ...(form?.get("firstMessage") != null ? { firstMessage: true } : {}),
    ...(prev?.buttons ? { buttons: prev.buttons } : {}),
  };
  await repo.set(SETTING_KEYS.resourceLibrary, JSON.stringify(lib));
  await audit(c, { action: "recursos.save", target: `recurso:${name}` });
  return c.redirect("/admin/recursos?saved=1");
});

adminApp.post("/recursos/delete", async (c) => {
  const { SettingsRepo, SETTING_KEYS } = await import("../db/settings");
  const { Db } = await import("../db/client");
  const { parseResourceLibrary } = await import("../resources/library");
  const form = await c.req.formData().catch(() => null);
  const name = String(form?.get("name") ?? "").trim();
  if (name) {
    const repo = new SettingsRepo(new Db(c.env.DB));
    const lib = parseResourceLibrary(await repo.get(SETTING_KEYS.resourceLibrary));
    if (lib[name]) {
      delete lib[name];
      await repo.set(SETTING_KEYS.resourceLibrary, JSON.stringify(lib));
    }
  }
  await audit(c, { action: "recursos.delete", target: `recurso:${name}` });
  return c.redirect("/admin/recursos?deleted=1");
});

// Conexiones: mapa de canales con estado verde/gris (paso 4 del onboarding).
// Lee los canales pausados de settings y las cuentas conectadas de Zernio.
adminApp.get("/conexiones", async (c) => {
  const { t } = await panelI18n(c.env);
  let pausedChannels: string[] = [];
  try {
    const { Db } = await import("../db/client");
    const { SettingsRepo, SETTING_KEYS } = await import("../db/settings");
    const raw = await new SettingsRepo(new Db(c.env.DB)).get(SETTING_KEYS.pausedChannels);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) pausedChannels = parsed.map((x) => String(x)).filter(Boolean);
    }
  } catch {
    // sin settings: sin canales pausados
  }
  const { listZernioAccounts } = await import("../channels/zernioAccounts");
  const { resolveTelegramToken, resolveOwnerTelegramChatId } = await import("../channels/telegramCredentials");
  const { loadMlCredentials } = await import("../channels/mercadolibreCredentials");
  const { resolveWahaConfig } = await import("../channels/wahaCredentials");
  const { getWahaSessionStatus } = await import("../channels/wahaApi");
  const zernioAccounts = await listZernioAccounts(c.env);
  const zernioCreds = await resolveZernioCredentials(c.env);
  const telegramToken = await resolveTelegramToken(c.env);
  const ownerChatId = await resolveOwnerTelegramChatId(c.env);
  const mlCreds = await loadMlCredentials(c.env);
  const wahaCfg = await resolveWahaConfig(c.env);
  const wahaStatus = await getWahaSessionStatus(wahaCfg);
  const { resolveVoiceConfig } = await import("../integrations/voiceProviders");
  const voiceCfg = await resolveVoiceConfig(c.env);

  // Uso de rate limit por cuenta (DM/hora) para mostrar en la card Zernio.
  const rateUsage: Record<string, { used: number; windowStart: number }> = {};
  try {
    const { Db } = await import("../db/client");
    const { DmLogsRepo } = await import("../db/dmLogs");
    const logs = new DmLogsRepo(new Db(c.env.DB));
    for (const acc of zernioAccounts) {
      rateUsage[acc.id] = await logs.currentHourUsage(acc.id);
    }
  } catch {
    // sin rate usage
  }
  // Fallback de origin para la webhook URL: si DASHBOARD_BASE_URL está vacío,
  // usamos la URL real del request para que las cards SIEMPRE muestren su webhook.
  const baseUrl = c.env.DASHBOARD_BASE_URL?.trim() || new URL(c.req.url).origin;

  // Auto-reparación del webhook de Zernio: una instalación conectada ANTES de
  // que se suscribiera `message.sent` (o `comment.received`) recibía los
  // entrantes pero no registraba NADA de lo enviado en el hilo del panel, y las
  // automatizaciones de comentarios no corrían. Al abrir esta pantalla se
  // corrigen los eventos del endpoint existente sin pedir reconectar.
  await ensureZernioWebhookEvents(c.env, zernioCreds, baseUrl).catch((e) =>
    console.warn("[conexiones] no se pudo reparar el webhook de Zernio:", e),
  );

  return c.html(await renderConexiones(c.env, pausedChannels, zernioAccounts, rateUsage, {
    zernioCreds,
    telegramToken,
    ownerChatId,
    mlCreds,
    wahaCfg,
    wahaStatus,
    voiceCfg,
    baseUrl,
    savedKind:
      c.req.query("telegram") === "saved"
        ? "telegram"
        : c.req.query("zernio") === "saved"
          ? "zernio"
          : c.req.query("ml") === "saved"
            ? "mercadolibre"
            : c.req.query("waha") === "saved"
              ? "waha"
              : c.req.query("vapi") === "saved"
                ? "vapi"
                : c.req.query("retell") === "saved"
                  ? "retell"
                  : c.req.query("voz") === "saved"
                    ? "voz"
                    : undefined,
    error:
      c.req.query("zernio") === "error"
        ? (c.req.query("msg") ?? t("msg.conexionesErrZernio"))
        : c.req.query("telegram") === "error"
          ? (c.req.query("msg") ?? t("msg.conexionesErrTelegram"))
          : c.req.query("ml") === "error"
            ? (c.req.query("msg") ?? t("msg.conexionesErrMl"))
            : c.req.query("waha") === "error"
              ? (c.req.query("msg") ?? t("msg.conexionesErrWaha"))
              : c.req.query("vapi") === "error"
                ? (c.req.query("msg") ?? t("msg.conexionesErrVapi"))
                : c.req.query("retell") === "error"
                  ? (c.req.query("msg") ?? t("msg.conexionesErrRetell"))
                  : undefined,
  }));
});

// Eventos que Kooni necesita de Zernio. `message.sent` es el que trae TODO lo
// saliente (app del celular + bot + automatizaciones): sin él, el hilo del
// panel nunca muestra lo enviado.
const ZERNIO_WEBHOOK_EVENTS = [
  "message.received",
  "message.sent",
  "comment.received",
  "reaction.received",
];

/**
 * Deja el endpoint de webhook de Zernio con los eventos que Kooni usa.
 *
 * Existe porque la lista de eventos se fijó al conectar el canal: una
 * instalación conectada antes de agregar `message.sent` seguiría recibiendo
 * solo entrantes para siempre. Repara sin reconectar y sin tocar el secret.
 * Silencioso a propósito: si falla, la pantalla de Conexiones igual carga.
 */
async function ensureZernioWebhookEvents(
  env: Env,
  creds: { apiKey: string | undefined; webhookSecret: string | undefined },
  baseUrl: string,
): Promise<void> {
  const apiKey = creds.apiKey?.trim();
  if (!apiKey) return;
  const zBase = env.ZERNIO_API_BASE_URL ?? "https://zernio.com/api";
  const whUrl = `${baseUrl.replace(/\/$/, "")}/webhooks/zernio`;
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  const listRes = await fetch(`${zBase}/v1/webhooks/settings`, {
    headers,
    signal: AbortSignal.timeout(8000),
  });
  if (!listRes.ok) return;
  const listJson = (await listRes.json().catch(() => ({}))) as {
    webhooks?: Array<{ _id: string; url?: string; events?: string[]; isActive?: boolean }>;
  };
  const mine = (listJson.webhooks ?? []).filter((w) => w.url === whUrl);
  if (mine.length === 0) return; // sin endpoint propio: lo crea el formulario

  for (const w of mine) {
    const current = w.events ?? [];
    const missing = ZERNIO_WEBHOOK_EVENTS.filter((e) => !current.includes(e));
    if (missing.length === 0) continue;
    const body: Record<string, unknown> = {
      _id: w._id,
      url: whUrl,
      // Se SUMAN los que falten; se conservan los que el dueño haya puesto.
      events: [...current, ...missing],
      isActive: true,
    };
    await fetch(`${zBase}/v1/webhooks/settings`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    }).catch(() => undefined);
    console.log(`[conexiones] webhook Zernio actualizado (+${missing.join(", ")})`);
  }
}

// Conectar Zernio desde el panel: guarda API key + webhook secret en D1 (settings)
// para que el canal quede activo sin `wrangler secret put` ni redeploy. Si viene
// una key nueva, se valida con GET /v1/accounts antes de guardarla.
adminApp.post("/conexiones/zernio", async (c) => {
  const { t } = await panelI18n(c.env);
  const form = await c.req.formData();
  const repo = new SettingsRepo(new Db(c.env.DB));
  const zBase = c.env.ZERNIO_API_BASE_URL ?? "https://zernio.com/api";
  const baseUrl = (c.env.DASHBOARD_BASE_URL?.trim() || new URL(c.req.url).origin).replace(/\/$/, "");
  const whUrl = `${baseUrl}/webhooks/zernio`;
  // message.sent: es como Zernio entrega TODO lo saliente — lo que el dueño
  // escribe desde la app del celular (sentVia null) y lo que envían el bot y
  // las automatizaciones de comentarios. Sin este evento el hilo del panel se
  // queda sin lo enviado y solo muestra lo que entró.
  const EVENTS = ZERNIO_WEBHOOK_EVENTS;

  if (String(form.get("clear") ?? "") === "1") {
    // Desregistrar el webhook de Zernio (best-effort) antes de borrar las creds.
    const oldKey = await repo.get(SETTING_KEYS.zernioApiKey);
    if (oldKey) {
      try {
        const listRes = await fetch(`${zBase}/v1/webhooks/settings`, {
          headers: { Authorization: `Bearer ${oldKey}` },
          signal: AbortSignal.timeout(8000),
        });
        const listJson = (await listRes.json().catch(() => ({}))) as { webhooks?: Array<{ _id: string; url?: string }> };
        for (const w of (listJson.webhooks ?? []).filter((w) => w.url === whUrl)) {
          await fetch(`${zBase}/v1/webhooks/settings?id=${encodeURIComponent(w._id)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${oldKey}` },
            signal: AbortSignal.timeout(8000),
          });
        }
      } catch { /* best-effort */ }
    }
    await repo.set(SETTING_KEYS.zernioApiKey, "");
    await repo.set(SETTING_KEYS.zernioWebhookSecret, "");
    return c.redirect("/admin/conexiones?zernio=saved");
  }

  // Límite de canales del plan gratis (no aplica si Zernio ya estaba conectado).
  const znLimited = await channelLimitGate(c, "zernio", "zernio");
  if (znLimited) return znLimited;

  const apiKey = String(form.get("zernio_api_key") ?? "").trim();
  const webhookSecret = String(form.get("zernio_webhook_secret") ?? "").trim();

  // Si NO escribieron una key nueva (campo vacío), se conserva la que ya existe.
  const existing = await repo.get(SETTING_KEYS.zernioApiKey);
  const keyToSave = apiKey || existing || "";

  if (keyToSave) {
    // Validación directa contra la API de Zernio (GET /v1/accounts). Una key
    // inválida devuelve 4xx/5xx; una válida devuelve 2xx (aunque no haya cuentas).
    const base = c.env.ZERNIO_API_BASE_URL ?? "https://zernio.com/api";
    let valid = false;
    let status = 0;
    try {
      const res = await fetch(`${base}/v1/accounts`, {
        headers: { Authorization: `Bearer ${keyToSave}` },
        signal: AbortSignal.timeout(8000),
      });
      status = res.status;
      valid = res.ok;
    } catch {
      return c.redirect(`/admin/conexiones?zernio=error&msg=${encodeURIComponent(t("msg.conexionesZernioNoContact"))}`);
    }
    if (!valid) {
      return c.redirect(`/admin/conexiones?zernio=error&msg=${encodeURIComponent(t("msg.conexionesZernioKeyInvalid", { status }))}`);
    }
  }

  await repo.set(SETTING_KEYS.zernioApiKey, keyToSave);
  // El webhook secret solo se sobreescribe si escribieron algo.
  if (webhookSecret) {
    await repo.set(SETTING_KEYS.zernioWebhookSecret, webhookSecret);
  }

  // Registrar el webhook automáticamente (como Telegram): sin esto Zernio no
  // entrega message.received/comment.received y las automatizaciones no corren.
  if (keyToSave) {
    const effSecret = webhookSecret || (await repo.get(SETTING_KEYS.zernioWebhookSecret)) || "";
    const headers = { Authorization: `Bearer ${keyToSave}`, "Content-Type": "application/json" };
    try {
      const listRes = await fetch(`${zBase}/v1/webhooks/settings`, { headers, signal: AbortSignal.timeout(8000) });
      const listJson = (await listRes.json().catch(() => ({}))) as { webhooks?: Array<{ _id: string; url?: string }> };
      const mine = (listJson.webhooks ?? []).filter((w) => w.url === whUrl);
      const body: Record<string, unknown> = { url: whUrl, events: EVENTS, isActive: true };
      if (effSecret) body.secret = effSecret;
      let regRes: Response;
      if (mine.length > 0) {
        body._id = mine[0]._id;
        regRes = await fetch(`${zBase}/v1/webhooks/settings`, { method: "PUT", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
      } else {
        body.name = "Kooni";
        regRes = await fetch(`${zBase}/v1/webhooks/settings`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
      }
      if (!regRes.ok) {
        return c.redirect(`/admin/conexiones?zernio=error&msg=${encodeURIComponent(t("msg.conexionesZernioWebhookRegFail", { status: regRes.status }))}`);
      }
    } catch {
      return c.redirect(`/admin/conexiones?zernio=error&msg=${encodeURIComponent(t("msg.conexionesZernioWebhookNoContact"))}`);
    }
  }

  return c.redirect("/admin/conexiones?zernio=saved");
});

// Conectar Telegram desde el panel: guarda el token del bot en D1 (settings),
// validándolo con getMe antes de persistirlo, y REGISTRA el webhook del worker
// automáticamente (setWebhook). Sin `wrangler secret put` ni redeploy.
adminApp.post("/conexiones/telegram", async (c) => {
  const { t } = await panelI18n(c.env);
  const form = await c.req.formData();
  const repo = new SettingsRepo(new Db(c.env.DB));
  const existing = await repo.get(SETTING_KEYS.telegramBotToken);

  // "Quitar conexión": borra el token y el aviso al dueño (y desregistra el webhook).
  if (String(form.get("clear") ?? "") === "1") {
    if (existing) {
      try {
        await fetch(`https://api.telegram.org/bot${existing}/deleteWebhook`, {
          method: "POST",
          signal: AbortSignal.timeout(6000),
        });
      } catch { /* best-effort */ }
    }
    await repo.set(SETTING_KEYS.telegramBotToken, "");
    await repo.set(SETTING_KEYS.ownerTelegramChatId, "");
    return c.redirect("/admin/conexiones?telegram=saved");
  }

  // Límite de canales del plan gratis (no aplica si Telegram ya estaba conectado).
  const tgLimited = await channelLimitGate(c, "telegram", "telegram");
  if (tgLimited) return tgLimited;

  const token = String(form.get("telegram_bot_token") ?? "").trim();
  // Campo vacío: conserva el token existente.
  const tokenToSave = token || existing || "";

  // Chat id del dueño (avisos de handoff por DM): si viene el campo, se guarda;
  // si viene clear_owner=1, se borra. Campo vacío + sin clear = se conserva.
  const ownerInput = String(form.get("owner_telegram_chat_id") ?? "").trim();
  if (ownerInput) {
    await repo.set(SETTING_KEYS.ownerTelegramChatId, ownerInput);
  } else if (String(form.get("clear_owner") ?? "") === "1") {
    await repo.set(SETTING_KEYS.ownerTelegramChatId, "");
  }

  if (tokenToSave) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${tokenToSave}/getMe`, {
        signal: AbortSignal.timeout(8000),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || j.ok !== true) {
        return c.redirect(`/admin/conexiones?telegram=error&msg=${encodeURIComponent(t("msg.conexionesTelegramTokenInvalid"))}`);
      }
    } catch {
      return c.redirect(`/admin/conexiones?telegram=error&msg=${encodeURIComponent(t("msg.conexionesTelegramNoContact"))}`);
    }

    await repo.set(SETTING_KEYS.telegramBotToken, tokenToSave);

    // Registrar el webhook del worker: sin esto Telegram NO entrega ningún
    // mensaje (el síntoma es "el token sale conectado pero el bot no responde").
    // Se reintenta un par de veces: un workers.dev recién desplegado a veces da
    // "Temporary failure in name resolution" en el resolver de Telegram.
    const baseUrl = (c.env.DASHBOARD_BASE_URL?.trim() || new URL(c.req.url).origin).replace(/\/$/, "");
    let whError = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const whRes = await fetch(`https://api.telegram.org/bot${tokenToSave}/setWebhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: `${baseUrl}/webhooks/telegram`, allowed_updates: ["message"] }),
          signal: AbortSignal.timeout(8000),
        });
        const wh = (await whRes.json().catch(() => ({}))) as { ok?: boolean; description?: string };
        if (whRes.ok && wh.ok === true) { whError = ""; break; }
        whError = wh.description ?? t("msg.conexionesTelegramWebhookErrDefault");
      } catch {
        whError = t("msg.conexionesTelegramWebhookUnreachable");
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000));
    }
    if (whError) {
      return c.redirect(`/admin/conexiones?telegram=error&msg=${encodeURIComponent(t("msg.conexionesTelegramWebhookFail", { error: whError }))}`);
    }
  }

  return c.redirect("/admin/conexiones?telegram=saved");
});

// Conectar WAHA: guarda URL del servidor + API key + sesión en D1 (settings) y
// crea/actualiza la sesión en el propio servidor WAHA con el webhook del
// worker ya apuntado (POST /api/sessions o PUT + start — ver
// channels/wahaApi.ts). Sin `wrangler secret put` ni redeploy. El QR para
// emparejar se ve en GET /conexiones/waha/qr (proxiado: la API key nunca llega
// al navegador).
adminApp.post("/conexiones/waha", async (c) => {
  const { t } = await panelI18n(c.env);
  const form = await c.req.formData();
  const repo = new SettingsRepo(new Db(c.env.DB));

  if (String(form.get("clear") ?? "") === "1") {
    await repo.set(SETTING_KEYS.wahaApiUrl, "");
    await repo.set(SETTING_KEYS.wahaApiKey, "");
    await repo.set(SETTING_KEYS.wahaWebhookToken, "");
    return c.redirect("/admin/conexiones?waha=saved");
  }

  // Límite de canales del plan gratis (no aplica si WAHA ya estaba conectado).
  const wahaLimited = await channelLimitGate(c, "waha", "waha");
  if (wahaLimited) return wahaLimited;

  const { resolveWahaConfig } = await import("../channels/wahaCredentials");
  const { ensureWahaSession } = await import("../channels/wahaApi");

  const urlInput = String(form.get("waha_api_url") ?? "").trim();
  const keyInput = String(form.get("waha_api_key") ?? "").trim();
  const sessionInput = String(form.get("waha_session") ?? "").trim();

  // Campo vacío: conserva lo que ya había guardado (mismo patrón que Zernio/Telegram).
  const current = await resolveWahaConfig(c.env);
  const baseToSave = (urlInput || current.base).replace(/\/+$/, "");
  const keyToSave = keyInput || current.apiKey || "";
  const sessionToSave = sessionInput || current.session || "default";

  if (!baseToSave || !keyToSave) {
    return c.redirect(`/admin/conexiones?waha=error&msg=${encodeURIComponent(t("msg.conexionesWahaMissing"))}`);
  }

  await repo.set(SETTING_KEYS.wahaApiUrl, baseToSave);
  await repo.set(SETTING_KEYS.wahaSession, sessionToSave);
  await repo.set(SETTING_KEYS.wahaApiKey, keyToSave);

  // El webhook token protege /webhooks/waha (?token=...) — se genera una sola
  // vez y se reusa en los guardados siguientes (no rota solo).
  let webhookToken = current.webhookToken;
  if (!webhookToken) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    webhookToken = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    await repo.set(SETTING_KEYS.wahaWebhookToken, webhookToken);
  }

  const baseUrl = (c.env.DASHBOARD_BASE_URL?.trim() || new URL(c.req.url).origin).replace(/\/$/, "");
  const webhookUrl = `${baseUrl}/webhooks/waha?token=${encodeURIComponent(webhookToken)}`;

  const result = await ensureWahaSession(
    { base: baseToSave, session: sessionToSave, apiKey: keyToSave, webhookToken },
    webhookUrl,
  );
  if (!result.ok) {
    return c.redirect(
      `/admin/conexiones?waha=error&msg=${encodeURIComponent(t("msg.conexionesWahaSavedButError", { msg: result.message ?? t("msg.conexionesWahaConnectFail") }))}`,
    );
  }

  return c.redirect("/admin/conexiones?waha=saved");
});

// Reinicia la sesión de WAHA con la config ya guardada (crea/actualiza + start,
// mismo `ensureWahaSession` que al guardar). Sirve cuando la sesión quedó
// FAILED/STOPPED (WhatsApp deslogueado) y hay que volver a emparejar: el panel
// no mostraba forma de recuperarla sin re-guardar la card a mano.
adminApp.post("/conexiones/waha/restart", async (c) => {
  const { t } = await panelI18n(c.env);
  const { resolveWahaConfig } = await import("../channels/wahaCredentials");
  const { ensureWahaSession } = await import("../channels/wahaApi");
  const cfg = await resolveWahaConfig(c.env);
  if (!cfg.base || !cfg.apiKey) {
    return c.redirect(
      `/admin/conexiones?waha=error&msg=${encodeURIComponent(t("msg.conexionesWahaMissing"))}`,
    );
  }
  const baseUrl = (c.env.DASHBOARD_BASE_URL?.trim() || new URL(c.req.url).origin).replace(/\/$/, "");
  const webhookUrl = `${baseUrl}/webhooks/waha${cfg.webhookToken ? `?token=${encodeURIComponent(cfg.webhookToken)}` : ""}`;
  const result = await ensureWahaSession(cfg, webhookUrl);
  if (!result.ok) {
    return c.redirect(
      `/admin/conexiones?waha=error&msg=${encodeURIComponent(t("msg.conexionesWahaRestartError", { msg: result.message ?? t("msg.conexionesWahaUnknown") }))}`,
    );
  }
  return c.redirect("/admin/conexiones?waha=saved");
});

// Proxea el QR de WAHA (PNG) para emparejar WhatsApp: la API key nunca sale al
// navegador, solo el worker la usa para pedirlo. 404 si el canal no está
// configurado o WAHA no tiene el QR listo (ej. sesión ya emparejada).
adminApp.get("/conexiones/waha/qr", async (c) => {
  const { t } = await panelI18n(c.env);
  const { resolveWahaConfig } = await import("../channels/wahaCredentials");
  const { fetchWahaQrPng } = await import("../channels/wahaApi");
  const cfg = await resolveWahaConfig(c.env);
  const png = await fetchWahaQrPng(cfg);
  if (!png)
    return c.text(t("msg.conexionesWahaNoQr"), 404);
  return new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
});

// ── Cobros por voz: Vapi / Retell ─────────────────────────────────────────
// Guarda las credenciales de cada proveedor de voz en D1 (settings) para
// conectarlos sin `wrangler secret put`. Campo vacío = conserva el valor actual
// (mismo patrón que Zernio/Telegram/WAHA). Valida la API key contra el
// proveedor (best-effort: si no hay red, igual se guarda).
// POR AHORA es solo configuración; el flujo de llamadas se cablea después.
async function saveVoiceProvider(c: any, provider: "vapi" | "retell"): Promise<Response> {
  const { t } = await panelI18n(c.env);
  const form = await c.req.formData();
  const repo = new SettingsRepo(new Db(c.env.DB));
  const { resolveVoiceConfig, VAPI_DEFAULT_BASE, RETELL_DEFAULT_BASE } = await import("../integrations/voiceProviders");
  const current = await resolveVoiceConfig(c.env);
  const field = (n: string) => String(form.get(n) ?? "").trim();

  if (field("clear") === "1") {
    const keys =
      provider === "vapi"
        ? [SETTING_KEYS.vapiApiKey, SETTING_KEYS.vapiAssistantId, SETTING_KEYS.vapiPhoneNumberId, SETTING_KEYS.vapiWebhookSecret, SETTING_KEYS.vapiApiBaseUrl]
        : [SETTING_KEYS.retellApiKey, SETTING_KEYS.retellAgentId, SETTING_KEYS.retellPhoneNumber, SETTING_KEYS.retellWebhookSecret, SETTING_KEYS.retellApiBaseUrl];
    for (const k of keys) await repo.set(k, "");
    if (current.provider === provider) await repo.set(SETTING_KEYS.voiceProvider, "");
    return c.redirect(`/admin/conexiones?${provider}=saved`);
  }

  const makeActive = field("make_active") === "1";

  if (provider === "vapi") {
    const apiKey = field("vapi_api_key") || current.vapi.apiKey || "";
    const assistantId = field("vapi_assistant_id") || current.vapi.assistantId || "";
    const phoneNumberId = field("vapi_phone_number_id") || current.vapi.phoneNumberId || "";
    const webhookSecret = field("vapi_webhook_secret") || current.vapi.webhookSecret || "";
    const baseUrl = (field("vapi_api_base_url") || current.vapi.baseUrl || VAPI_DEFAULT_BASE).replace(/\/+$/, "");
    if (!apiKey) {
      return c.redirect(`/admin/conexiones?vapi=error&msg=${encodeURIComponent(t("msg.conexionesVapiMissing"))}`);
    }
    await repo.set(SETTING_KEYS.vapiApiKey, apiKey);
    await repo.set(SETTING_KEYS.vapiAssistantId, assistantId);
    await repo.set(SETTING_KEYS.vapiPhoneNumberId, phoneNumberId);
    await repo.set(SETTING_KEYS.vapiWebhookSecret, webhookSecret);
    await repo.set(SETTING_KEYS.vapiApiBaseUrl, baseUrl);
    if (makeActive) await repo.set(SETTING_KEYS.voiceProvider, "vapi");
    try {
      const res = await fetch(`${baseUrl}/assistant`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok && res.status !== 404) {
        return c.redirect(
          `/admin/conexiones?vapi=error&msg=${encodeURIComponent(t("msg.conexionesVapiBadStatus", { status: res.status }))}`,
        );
      }
    } catch {
      /* sin red: se guardó igual */
    }
    return c.redirect("/admin/conexiones?vapi=saved");
  }

  // Retell
  const apiKey = field("retell_api_key") || current.retell.apiKey || "";
  const agentId = field("retell_agent_id") || current.retell.agentId || "";
  const phoneNumber = field("retell_phone_number") || current.retell.phoneNumber || "";
  const webhookSecret = field("retell_webhook_secret") || current.retell.webhookSecret || "";
  const baseUrl = (field("retell_api_base_url") || current.retell.baseUrl || RETELL_DEFAULT_BASE).replace(/\/+$/, "");
  if (!apiKey) {
    return c.redirect(`/admin/conexiones?retell=error&msg=${encodeURIComponent(t("msg.conexionesRetellMissing"))}`);
  }
  await repo.set(SETTING_KEYS.retellApiKey, apiKey);
  await repo.set(SETTING_KEYS.retellAgentId, agentId);
  await repo.set(SETTING_KEYS.retellPhoneNumber, phoneNumber);
  await repo.set(SETTING_KEYS.retellWebhookSecret, webhookSecret);
  await repo.set(SETTING_KEYS.retellApiBaseUrl, baseUrl);
  if (makeActive) await repo.set(SETTING_KEYS.voiceProvider, "retell");
  try {
    const res = await fetch(`${baseUrl}/list-agents`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok && res.status !== 404) {
      return c.redirect(
        `/admin/conexiones?retell=error&msg=${encodeURIComponent(t("msg.conexionesRetellBadStatus", { status: res.status }))}`,
      );
    }
  } catch {
    /* sin red: se guardó igual */
  }
  return c.redirect("/admin/conexiones?retell=saved");
}

adminApp.post("/conexiones/vapi", (c) => saveVoiceProvider(c, "vapi"));
adminApp.post("/conexiones/retell", (c) => saveVoiceProvider(c, "retell"));

// Parámetros comunes de la cartera por voz (objetivo + intentos máximos).
adminApp.post("/conexiones/voz", async (c) => {
  const form = await c.req.formData();
  const repo = new SettingsRepo(new Db(c.env.DB));
  const objective = String(form.get("cobros_voice_objective") ?? "").trim();
  const attemptsRaw = String(form.get("cobros_voice_max_attempts") ?? "").trim();
  const attempts = Math.min(10, Math.max(1, Number(attemptsRaw) || 3));
  await repo.set(SETTING_KEYS.cobrosVoiceObjective, objective);
  await repo.set(SETTING_KEYS.cobrosVoiceMaxAttempts, String(attempts));
  return c.redirect("/admin/conexiones?voz=saved");
});

// Conectar MercadoLibre: guarda App ID + Secret + país en D1 (settings). Los
// tokens NO se piden aquí — se obtienen en el OAuth (botón "Autorizar", que
// arranca en GET /conexiones/mercadolibre/oauth y termina en el callback
// público /webhooks/mercadolibre/oauth).
adminApp.post("/conexiones/mercadolibre", async (c) => {
  const form = await c.req.formData();
  const repo = new SettingsRepo(new Db(c.env.DB));

  if (String(form.get("clear") ?? "") === "1") {
    const { clearMlTokens } = await import("../channels/mercadolibreCredentials");
    await clearMlTokens(c.env);
    await repo.set(SETTING_KEYS.mlClientId, "");
    await repo.set(SETTING_KEYS.mlClientSecret, "");
    return c.redirect("/admin/conexiones?ml=saved");
  }

  const clientId = String(form.get("ml_client_id") ?? "").trim();
  const clientSecret = String(form.get("ml_client_secret") ?? "").trim();
  const site = String(form.get("ml_site") ?? "").trim().toUpperCase();
  if (clientId) await repo.set(SETTING_KEYS.mlClientId, clientId);
  if (clientSecret) await repo.set(SETTING_KEYS.mlClientSecret, clientSecret);
  if (site) await repo.set(SETTING_KEYS.mlSite, site);
  return c.redirect("/admin/conexiones?ml=saved");
});

// Arranca el OAuth de MercadoLibre: guarda un `state` anti-CSRF y redirige al
// login del vendedor. MercadoLibre vuelve a /webhooks/mercadolibre/oauth.
adminApp.get("/conexiones/mercadolibre/oauth", async (c) => {
  const { t } = await panelI18n(c.env);
  const { loadMlCredentials, mlAuthorizeUrl } = await import("../channels/mercadolibreCredentials");
  const creds = await loadMlCredentials(c.env);
  if (!creds.clientId || !creds.clientSecret) {
    return c.redirect(
      `/admin/conexiones?ml=error&msg=${encodeURIComponent(t("msg.conexionesMlMissingCreds"))}`,
    );
  }
  // Límite de canales del plan gratis (no aplica si ML ya estaba conectado).
  const mlLimited = await channelLimitGate(c, "mercadolibre", "ml");
  if (mlLimited) return mlLimited;
  const base = (c.env.DASHBOARD_BASE_URL?.trim() || new URL(c.req.url).origin).replace(/\/$/, "");
  const redirectUri = `${base}/webhooks/mercadolibre/oauth`;
  const state = crypto.randomUUID();
  await new SettingsRepo(new Db(c.env.DB)).set(SETTING_KEYS.mlOauthState, state);
  return c.redirect(mlAuthorizeUrl(creds, redirectUri, state));
});

// Comandos: cheat sheet (terminal + prompts del agente), solo lectura.
adminApp.get("/comandos", async (c) => c.html(await renderComandos(c.env)));

// Equipo: gestiona los accesos de colaboradores (admin_emails).
adminApp.get("/equipo", async (c) => {
  const { t } = await panelI18n(c.env);
  return c.html(await renderEquipo(c.env, c.req.query("saved") ? t("msg.equipoSaved") : undefined));
});
adminApp.post("/equipo/add", async (c) => {
  const { Db } = await import("../db/client");
  const { AdminEmailsRepo } = await import("../db/adminEmails");
  const form = await c.req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const role = String(form.get("role") ?? "staff") === "owner" ? "owner" : "staff";
  if (email) await new AdminEmailsRepo(new Db(c.env.DB)).add(email, role);
  return c.redirect("/admin/equipo?saved=1");
});
adminApp.post("/equipo/remove", async (c) => {
  const { Db } = await import("../db/client");
  const { AdminEmailsRepo } = await import("../db/adminEmails");
  const form = await c.req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (email) await new AdminEmailsRepo(new Db(c.env.DB)).remove(email);
  return c.redirect("/admin/equipo?saved=1");
});

// Licencia: activa Pro pegando un código KOONI-PRO-... (validación local HMAC).
adminApp.get("/licencia", async (c) => c.html(await renderLicencia(c.env)));

// Fuerza un sync inmediato del estado de licencia con el backend (super admin).
adminApp.post("/licencia/sync", async (c) => {
  const { t } = await panelI18n(c.env);
  const { syncLicenseState } = await import("../licenseSync");
  const r = await syncLicenseState(c.env, { force: true });
  const msg = r.ok
    ? t("msg.licenciaSyncOk", { detail: r.detail ?? "ok" })
    : t("msg.licenciaSyncError", { detail: r.detail ?? "error" });
  return c.html(await renderLicencia(c.env, msg, !r.ok));
});

// Menú Extras (Kooni+): cuadrícula de funciones de pago con toggles on/off.
adminApp.get("/extras", async (c) => {
  const saved = c.req.query("saved") === "1";
  return c.html(await renderExtras(c.env, saved, c.req.query("report")));
});

adminApp.post("/extras", async (c) => {
  const form = await c.req.formData();
  const repo = new SettingsRepo(new Db(c.env.DB));
  const { EXTRA_FEATURES } = await import("../features");
  // Toggles de todas las funciones del catálogo (reporte incluido).
  for (const f of EXTRA_FEATURES) {
    await repo.set(f.toggleKey, form.get(f.toggleKey) === "1" ? "1" : "0");
    // Campos de config de la función (links de reseñas / pago, etc.).
    for (const c of f.config ?? []) {
      await repo.set(c.key, String(form.get(c.key) ?? "").trim());
    }
  }
  // Canal del reporte nocturno (allow-list).
  const channel = String(form.get(SETTING_KEYS.nightlyReportChannel) ?? "telegram").trim().toLowerCase();
  await repo.set(SETTING_KEYS.nightlyReportChannel, ["telegram", "email", "both"].includes(channel) ? channel : "telegram");
  return c.redirect("/admin/extras?saved=1");
});

adminApp.post("/licencia", async (c) => {
  const { t } = await panelI18n(c.env);
  const { Db } = await import("../db/client");
  const { SettingsRepo, SETTING_KEYS } = await import("../db/settings");
  const { verifyLicense, verifyLicenseFor } = await import("../license");
  const form = await c.req.formData();
  const repo = new SettingsRepo(new Db(c.env.DB));

  if (form.get("clear")) {
    await repo.set(SETTING_KEYS.proLicense, "");
    return c.html(await renderLicencia(c.env, t("msg.licenciaRemoved"), false));
  }

  const code = String(form.get("code") ?? "").trim();
  if (!code) return c.html(await renderLicencia(c.env, t("msg.licenciaEmpty"), true));
  const payload = verifyLicense(code, c.env);
  if (!payload) {
    return c.html(await renderLicencia(c.env, t("msg.licenciaInvalid"), true));
  }
  if (!verifyLicenseFor(c.env, code, { instanceUid: c.env.BOT_INSTANCE_ID })) {
    return c.html(await renderLicencia(c.env, t("msg.licenciaWrongInstance"), true));
  }
  await repo.set(SETTING_KEYS.proLicense, code);
  const detail = payload.kind === "monthly" && payload.expiry
    ? t("msg.licenciaValidUntil", { date: new Date(payload.expiry).toLocaleDateString("es") })
    : t("msg.licenciaForever");
  return c.html(await renderLicencia(c.env, t("msg.licenciaActivated", { kind: payload.kind, detail }), false));
});

// Automatizaciones: flujos keyword → respuesta (comentarios y DMs) desde el panel.
adminApp.get("/automatizaciones", async (c) =>
  c.html(
    await renderAutomatizaciones(c.env, c.req.query("saved") === "1", c.req.query("error")),
  ),
);

// Comentarios: bandeja de comentarios recibidos (como Zernio). Dos paneles como
// Conversaciones: ?c=<commentId> selecciona; ?f/?q/?p/?d filtran la lista.
adminApp.get("/comentarios", async (c) =>
  c.html(await renderComentarios(c.env, commentsParamsFrom((k) => c.req.query(k)))),
);

// Fragmentos HTMX (polled): lista cada 10s, detalle cada 30s. Registrados antes
// de cualquier /comentarios/:id para que los segmentos estáticos ganen.
adminApp.get("/comentarios/list-fragment", async (c) =>
  c.html(await renderComentariosList(c.env, commentsParamsFrom((k) => c.req.query(k)))),
);

adminApp.get("/comentarios/thread/:id", async (c) =>
  c.html(await renderComentarioThread(c.env, c.req.param("id"))),
);

/** Cuenta cuántas respuestas públicas salieron por esa cuenta en 24h (tope). */
async function publicRepliesLast24h(env: Env, accountId: string | undefined): Promise<number> {
  try {
    const row = await new Db(env.DB).first<{ n: number }>(
      "SELECT COUNT(*) as n FROM comments WHERE account_id = ? AND public_reply_sent = 1 AND created_at > ?",
      [accountId ?? "", Date.now() - 24 * 3600_000],
    );
    return row?.n ?? 0;
  } catch {
    return 0;
  }
}

// Responde EN PÚBLICO un comentario desde el panel (respeta el tope diario).
adminApp.post("/comentarios/:id/reply", async (c) => {
  const id = c.req.param("id");
  const { t } = await panelI18n(c.env);
  const form = await c.req.parseBody();
  const text = String(form.text ?? "").trim();
  const repo = new CommentsRepo(new Db(c.env.DB));
  const comment = await repo.getById(id).catch(() => null);
  if (!comment?.postId || !text) {
    return c.html(await renderComentarioThread(c.env, id, { type: "error", text: t("msg.commentsMissingData") }));
  }
  const sent = await publicRepliesLast24h(c.env, comment.accountId);
  if (sent >= MAX_PUBLIC_REPLIES_PER_DAY) {
    return c.html(
      await renderComentarioThread(c.env, id, {
        type: "error",
        text: t("msg.commentsDailyLimit", { n: sent }),
      }),
    );
  }
  const res = await replyToComment(c.env, {
    accountId: comment.accountId,
    postId: comment.postId,
    commentId: id,
    message: text,
  });
  await repo.markPublicReply(id, text, res.ok).catch(() => {});
  await new DmLogsRepo(new Db(c.env.DB))
    .log({
      ruleId: comment.ruleId,
      kind: "comment_reply",
      platform: comment.platform,
      target: id,
      username: comment.authorUsername ?? comment.authorName,
      message: text,
      status: res.ok ? "sent" : "failed",
      error: res.ok ? undefined : res.error,
    })
    .catch(() => {});
  await audit(c, {
    action: "comment.reply",
    target: id,
    targetLabel: comment.authorUsername ?? comment.authorName ?? undefined,
    afterVal: text.slice(0, 200),
    result: res.ok ? "ok" : "error",
  });
  return c.html(
    await renderComentarioThread(
      c.env,
      id,
      res.ok
        ? { type: "ok", text: t("msg.commentsReplySent") }
        : { type: "error", text: t("msg.commentsReplyError", { error: res.error ?? res.status }) },
    ),
  );
});

// Manda el DM (private reply) al comentarista desde el panel.
adminApp.post("/comentarios/:id/dm", async (c) => {
  const id = c.req.param("id");
  const { t } = await panelI18n(c.env);
  const form = await c.req.parseBody();
  const text = String(form.text ?? "").trim();
  const repo = new CommentsRepo(new Db(c.env.DB));
  const comment = await repo.getById(id).catch(() => null);
  if (!comment?.postId || !text) {
    return c.html(await renderComentarioThread(c.env, id, { type: "error", text: t("msg.commentsDmMissingData") }));
  }
  const res = await privateReplyToComment(c.env, {
    accountId: comment.accountId,
    postId: comment.postId,
    commentId: id,
    message: text,
  });
  await repo.markDmSent(id, res.ok).catch(() => {});
  await new DmLogsRepo(new Db(c.env.DB))
    .log({
      ruleId: comment.ruleId,
      kind: "comment_dm",
      platform: comment.platform,
      target: id,
      username: comment.authorUsername ?? comment.authorName,
      message: text,
      status: res.ok ? "sent" : res.consumed ? "skipped" : "failed",
      error: res.ok ? undefined : res.error,
    })
    .catch(() => {});
  await audit(c, {
    action: "comment.dm",
    target: id,
    targetLabel: comment.authorUsername ?? comment.authorName ?? undefined,
    afterVal: text.slice(0, 200),
    result: res.ok ? "ok" : "error",
  });
  const notice = res.ok
    ? { type: "ok" as const, text: t("msg.commentsDmSent") }
    : res.consumed
      ? { type: "error" as const, text: t("msg.commentsDmConsumed") }
      : { type: "error" as const, text: t("msg.commentsDmError", { error: res.error ?? res.status }) };
  return c.html(await renderComentarioThread(c.env, id, notice));
});

// Borrador con IA para responder el comentario (el dueño lo revisa y envía).
adminApp.post("/comentarios/:id/suggest", async (c) => {
  const id = c.req.param("id");
  const { t } = await panelI18n(c.env);
  const comment = await new CommentsRepo(new Db(c.env.DB)).getById(id).catch(() => null);
  if (!comment) return c.html(renderComposeBox(id));
  const draft = await generateAiCommentReply(c.env, {
    commentText: comment.text,
    commenterName: comment.authorName ?? comment.authorUsername,
    businessName: c.env.BUSINESS_NAME,
  });
  return c.html(
    renderComposeBox(
      id,
      draft ?? t("msg.commentsSuggestError"),
    ),
  );
});

// Contactos: todos los que interactúan (separados de Leads).
adminApp.get("/contactos", async (c) => c.html(await renderContactos(c.env)));

// Contactos bloqueados al bot: silencio total (respuestas + proactivos).
adminApp.get("/blocked", async (c) => c.html(await renderBloqueados(c.env)));

adminApp.post("/blocked", async (c) => {
  const { ContactBlocksRepo } = await import("../db/contactBlocks");
  const form = await c.req.formData().catch(() => null);
  const target = String(form?.get("target") ?? "").trim();
  let channel = String(form?.get("channel") ?? "").trim();
  let channelUserId = String(form?.get("channel_user_id") ?? "").trim();
  if (target.includes("|")) {
    const [ch, ...rest] = target.split("|");
    channel = ch;
    channelUserId = rest.join("|");
  }
  if (!channel || !channelUserId) return c.redirect("/admin/blocked");
  const reason = String(form?.get("reason") ?? "").trim() || null;
  await new ContactBlocksRepo(new Db(c.env.DB)).block({
    channel,
    channelUserId,
    reason,
    createdBy: "panel",
  });
  await audit(c, {
    action: "conversation.block",
    target: `contact:${channel}:${channelUserId}`,
    targetLabel: `${channelLabel(channel)} · ${channelUserId}`,
    afterVal: reason ?? undefined,
  });
  return c.redirect("/admin/blocked");
});

adminApp.post("/blocked/remove", async (c) => {
  const { ContactBlocksRepo } = await import("../db/contactBlocks");
  const form = await c.req.formData().catch(() => null);
  const channel = String(form?.get("channel") ?? "").trim();
  const channelUserId = String(form?.get("channel_user_id") ?? "").trim();
  if (!channel || !channelUserId) return c.redirect("/admin/blocked");
  await new ContactBlocksRepo(new Db(c.env.DB)).unblock(channel, channelUserId);
  await audit(c, {
    action: "conversation.unblock",
    target: `contact:${channel}:${channelUserId}`,
    targetLabel: `${channelLabel(channel)} · ${channelUserId}`,
  });
  return c.redirect("/admin/blocked");
});

// Auditoría (§ U) — solo lectura (Pro; gate en PRO_GATE + nav). Ninguna ruta
// escribe ni borra el registro desde el panel.
function auditQueryFrom(c: { req: { query: (k: string) => string | undefined } }) {
  const beforeRaw = Number(c.req.query("before"));
  return {
    action: c.req.query("action") || undefined,
    actorIpHash: c.req.query("actor") || undefined,
    text: c.req.query("q") || undefined,
    before: Number.isFinite(beforeRaw) && beforeRaw > 0 ? beforeRaw : undefined,
  };
}
adminApp.get("/auditoria", async (c) => {
  const { renderAuditoria } = await import("./views/auditoria");
  return c.html(await renderAuditoria(c.env, auditQueryFrom(c)));
});
adminApp.get("/auditoria/export.csv", async (c) => {
  const { exportAuditCsv } = await import("./views/auditoria");
  const csv = await exportAuditCsv(c.env, auditQueryFrom(c));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="auditoria-${Date.now()}.csv"`,
    },
  });
});

// Idioma del PANEL (es | en). Es una preferencia de la instalación (el panel es
// mono-usuario). No toca el idioma con el que el bot le habla a los clientes.
adminApp.post("/config/language", async (c) => {
  const form = await c.req.formData();
  const lang = String(form.get("lang") ?? "es") === "en" ? "en" : "es";
  await new SettingsRepo(new Db(c.env.DB)).set(SETTING_KEYS.panelLanguage, lang);
  clearPanelLangCache();
  await audit(c, { action: "config.language", afterVal: lang, result: "ok" });
  const back = c.req.header("referer") ?? "";
  return c.redirect(/^\/admin\//.test(back) ? back : "/admin/overview");
});

// Fallback: respuesta pública a comentarios que no matchean ninguna regla.
// (checkbox + mensaje, arriba de la lista de automatizaciones)
adminApp.post("/automatizaciones/fallback", async (c) => {
  const form = await c.req.formData();
  const repo = new SettingsRepo(new Db(c.env.DB));
  await repo.set(SETTING_KEYS.commentFallbackEnabled, form.get("enabled") === "1" ? "1" : "0");
  await repo.set(SETTING_KEYS.commentFallbackMessage, String(form.get("message") ?? "").trim());
  await repo.set(SETTING_KEYS.commentAiFallbackEnabled, form.get("ai_enabled") === "1" ? "1" : "0");
  await repo.set(SETTING_KEYS.commentAiFallbackPrompt, String(form.get("ai_prompt") ?? "").trim());
  await repo.set(SETTING_KEYS.followGateNotFollowingMessage, String(form.get("follow_not_following") ?? "").trim());
  return c.redirect("/admin/automatizaciones?saved=1");
});

adminApp.post("/automatizaciones/save", async (c) => {
  const { t } = await panelI18n(c.env);
  try {
    const form = await c.req.formData();
    const input = parseRuleForm(form);
    if (input.keywords.length === 0 || !input.message) {
      return c.redirect("/admin/automatizaciones?error=" + encodeURIComponent(t("msg.automationsKeywordsRequired")));
    }
    // `comment_dm_public` promete DOS cosas: respuesta pública y DM. Sin texto
    // público (ni prompt de IA) la regla mandaba solo el DM y el comentario
    // quedaba sin responder en público — el bug que reportó el dueño.
    if (input.kind === "comment_dm_public" && !input.replyToComment && !input.aiReplyPrompt) {
      return c.redirect(
        "/admin/automatizaciones?error=" + encodeURIComponent(t("msg.automationsPublicRequired")),
      );
    }
    const { Db } = await import("../db/client");
    const { checkLimit } = await import("../limits");
    const limitCheck = await checkLimit(c.env, "rules");
    if (!limitCheck.allowed) {
      return c.redirect(
        "/admin/automatizaciones?error=" +
          encodeURIComponent(t("msg.automationsLimit", { used: limitCheck.used, limit: String(limitCheck.limit) })),
      );
    }
    await new AutoRulesRepo(new Db(c.env.DB)).create(input);
    await audit(c, {
      action: "rule.create",
      targetLabel: `Automatización · ${input.keywords.join(", ").slice(0, 60)}`,
      afterVal: input.message?.slice(0, 200),
    });
    return c.redirect("/admin/automatizaciones?saved=1");
  } catch (e) {
    return c.redirect("/admin/automatizaciones?error=" + encodeURIComponent(String((e as Error)?.message ?? e)));
  }
});

// Editar una automatización: vista con el formulario precargado.
adminApp.get("/automatizaciones/:id/edit", async (c) => {
  const { t } = await panelI18n(c.env);
  const { Db } = await import("../db/client");
  const rule = await new AutoRulesRepo(new Db(c.env.DB)).get(c.req.param("id"));
  if (!rule) return c.redirect("/admin/automatizaciones?error=" + encodeURIComponent(t("msg.automationsRuleNotFound")));
  return c.html(await renderAutomatizaciones(c.env, false, undefined, rule));
});

// Guardar edición de una automatización.
adminApp.post("/automatizaciones/:id/save", async (c) => {
  const { t } = await panelI18n(c.env);
  try {
    const form = await c.req.formData();
    const input = parseRuleForm(form);
    if (input.keywords.length === 0 || !input.message) {
      return c.redirect("/admin/automatizaciones?error=" + encodeURIComponent(t("msg.automationsKeywordsRequired")));
    }
    // Misma regla que al crear: comment_dm_public necesita texto público.
    if (input.kind === "comment_dm_public" && !input.replyToComment && !input.aiReplyPrompt) {
      return c.redirect(
        "/admin/automatizaciones?error=" + encodeURIComponent(t("msg.automationsPublicRequired")),
      );
    }
    const { Db } = await import("../db/client");
    const repo = new AutoRulesRepo(new Db(c.env.DB));
    const id = c.req.param("id");
    const prev = await repo.get(id);
    await repo.update(id, { ...input, isActive: undefined });
    await audit(c, {
      action: "rule.update",
      target: `rule:${id}`,
      targetLabel: `Automatización · ${input.keywords.join(", ").slice(0, 60)}`,
      beforeVal: prev?.message?.slice(0, 200),
      afterVal: input.message?.slice(0, 200),
    });
    return c.redirect("/admin/automatizaciones?saved=1");
  } catch (e) {
    return c.redirect("/admin/automatizaciones?error=" + encodeURIComponent(String((e as Error)?.message ?? e)));
  }
});

adminApp.post("/automatizaciones/:id/toggle", async (c) => {
  const { Db } = await import("../db/client");
  const repo = new AutoRulesRepo(new Db(c.env.DB));
  const rule = await repo.get(c.req.param("id"));
  if (rule) {
    await repo.setActive(rule.id, !rule.isActive);
    await audit(c, {
      action: "rule.toggle",
      target: `rule:${rule.id}`,
      targetLabel: `Automatización · ${rule.keywords.join(", ").slice(0, 60)}`,
      beforeVal: rule.isActive ? "activa" : "inactiva",
      afterVal: rule.isActive ? "inactiva" : "activa",
    });
  }
  return c.redirect("/admin/automatizaciones?saved=1");
});

adminApp.post("/automatizaciones/:id/delete", async (c) => {
  const { Db } = await import("../db/client");
  const repo = new AutoRulesRepo(new Db(c.env.DB));
  const id = c.req.param("id");
  const rule = await repo.get(id);
  await repo.remove(id);
  await audit(c, {
    action: "rule.delete",
    target: `rule:${id}`,
    targetLabel: rule ? `Automatización · ${rule.keywords.join(", ").slice(0, 60)}` : `rule:${id}`,
    beforeVal: rule?.message?.slice(0, 200),
  });
  return c.redirect("/admin/automatizaciones?saved=1");
});

adminApp.get("/campanas", async (c) => {
  const q: Record<string, string | undefined> = {
    ok: c.req.query("ok"),
    err: c.req.query("err"),
    ff: c.req.query("ff"),
    tp: c.req.query("tp"),
    dup: c.req.query("dup"),
    quota: c.req.query("quota"),
    fail: c.req.query("fail"),
  };
  return c.html(await renderCampanas(c.env, q));
});

adminApp.post("/campanas/send", async (c) => {
  const { t } = await panelI18n(c.env);
  const form = await c.req.formData();
  const segmentId = String(form.get("segment") ?? "");
  const campaignKey = String(form.get("campaign_key") ?? "").trim();
  const freeformText = String(form.get("freeform_text") ?? "").trim();
  const templateSid = String(form.get("template_sid") ?? "").trim();
  const varsRaw = String(form.get("template_vars") ?? "").trim();
  if (!segmentId || !campaignKey || (!freeformText && !templateSid)) {
    return c.redirect("/admin/campanas?err=" + encodeURIComponent(t("msg.campaignsMissingFields")));
  }
  let variables: Record<string, string> | undefined;
  if (varsRaw) {
    try {
      variables = JSON.parse(varsRaw);
    } catch {
      return c.redirect("/admin/campanas?err=" + encodeURIComponent(t("msg.campaignsInvalidJson")));
    }
  }
  // El body de la plantilla viaja al historial de cada conversación — sin él,
  // el agente no sabría qué se le preguntó al cliente cuando responda.
  let templateBody: string | undefined;
  if (templateSid) {
    const { listContentTemplates } = await import("../campaigns");
    const tpl = (await listContentTemplates(c.env).catch(() => [])).find((x) => x.sid === templateSid);
    templateBody = tpl?.body || undefined;
  }
  const result = await sendCampaign(c.env, {
    segmentId,
    campaignKey,
    freeformText: freeformText || undefined,
    template: templateSid ? { sid: templateSid, variables, body: templateBody } : undefined,
  });
  await audit(c, {
    action: "campaign.send",
    target: `campaign:${campaignKey}`,
    targetLabel: `Campaña · ${campaignKey}`,
    afterVal: `segmento ${segmentId} — enviados: ${result.sentFreeform + result.sentTemplate}, fallidos: ${result.failed}`,
  });
  const q = new URLSearchParams({
    ok: "1",
    ff: String(result.sentFreeform),
    tp: String(result.sentTemplate),
    dup: String(result.skippedDuplicate),
    quota: String(result.skippedQuota),
    fail: String(result.failed),
  });
  return c.redirect("/admin/campanas?" + q.toString());
});

// Restaura una versión anterior del prompt (del historial).
adminApp.post("/prompt/restore", async (c) => {
  const { Db } = await import("../db/client");
  const { SettingsRepo, SETTING_KEYS } = await import("../db/settings");
  const { listPromptVersions } = await import("../prompt/versions");
  const repo = new SettingsRepo(new Db(c.env.DB));
  const form = await c.req.formData();
  const at = Number(form.get("at") ?? 0);
  const list = await listPromptVersions(repo);
  const v = list.find((x) => x.at === at);
  if (v) {
    await repo.set(SETTING_KEYS.systemPromptOverride, v.system);
    await repo.set(SETTING_KEYS.customInstructions, v.instructions);
  }
  return c.redirect("/admin/config?prompt_restored=1");
});

adminApp.get("/config", async (c) => {
  const settings = await new SettingsRepo(new Db(c.env.DB)).all();
  const saved = c.req.query("saved") === "1";
  // Nombres de herramientas (las que el modelo puede llamar) para la barra de
  // inserción del prompt manual. Best-effort: sin tools, la barra igual muestra
  // las etiquetas {{...}}.
  let toolNames: string[] = [];
  try {
    const { buildTools } = await import("../tools");
    toolNames = Object.keys(await buildTools({ env: c.env, getConversationId: () => null }));
  } catch { /* sin registro de tools */ }
  return c.html(await renderConfig(c.env, settings, saved, c.req.query("llmtest"), toolNames));
});

// Botón "Enviar prueba ahora" del Reporte nocturno: manda el resumen del día
// por el canal configurado (aunque el reporte esté apagado) y vuelve con el
// resultado en la query para el banner de la sección.
adminApp.post("/config/report-test", async (c) => {
  const { t } = await panelI18n(c.env);
  try {
    const { sendReportTest } = await import("../reports/nightly");
    const res = await sendReportTest(c.env);
    if (res.sentTo.length === 0) {
      return c.redirect("/admin/extras?report=" + encodeURIComponent("err:" + t("msg.configReportNoChannel")));
    }
    return c.redirect("/admin/extras?report=ok:" + res.sentTo.join("+"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.redirect(`/admin/extras?report=${encodeURIComponent(`err:${msg.slice(0, 160)}`)}`);
  }
});

// Prueba de la config BYO-LLM guardada: un generateText mínimo con el modelo
// resuelto (settings > env). Redirige de vuelta con el resultado en la query.
adminApp.get("/config/llm-test", async (c) => {
  try {
    const ov = await loadLlmOverrides(c.env);
    const { model, modelId, provider } = createModel(c.env, "fast", ov);
    const r = await generateText({
      model,
      prompt: "Responde únicamente: ok",
      maxOutputTokens: 8,
    });
    const okText = r.text.trim().slice(0, 20) || "ok";
    return c.redirect(
      `/admin/config?llmtest=${encodeURIComponent(`ok:${provider}/${modelId} → "${okText}"`)}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.redirect(`/admin/config?llmtest=${encodeURIComponent(`err:${msg.slice(0, 180)}`)}`);
  }
});

// Save the control panel. Card selections are mapped from the picked option
// (value or label) back to the value we persist via `levelToValue`; free-text
// fields are stored verbatim (trimmed). Empty/absent => default at load time.
adminApp.post("/config", async (c) => {
  const form = await c.req.formData();
  const repo = new SettingsRepo(new Db(c.env.DB));

  // Card-based controls: tone, buffer_seconds, max_chunks, model_override, bot_paused.
  for (const key of Object.keys(CONTROLS)) {
    const picked = form.get(key);
    if (picked === null) continue; // control not submitted — leave as-is
    const value = levelToValue(key, String(picked));
    if (value !== null) await repo.set(key, value);
  }

  // Free-text controls (stored verbatim, trimmed).
  const textKeys: SettingKey[] = [
    SETTING_KEYS.botName,
    SETTING_KEYS.businessContext,
    SETTING_KEYS.systemPromptOverride,
    SETTING_KEYS.escalationKeywords,
    SETTING_KEYS.menuButtons,
    SETTING_KEYS.resourceLibrary,
    SETTING_KEYS.allowMultimedia,
  ];
  // Historial del prompt: capturamos el estado PREVIO para versionar el cambio.
  const beforePrompt = await repo.get(SETTING_KEYS.systemPromptOverride);
  const beforeInstr = await repo.get(SETTING_KEYS.customInstructions);
  for (const key of textKeys) {
    const raw = form.get(key);
    if (raw === null) continue;
    await repo.set(key, String(raw).trim());
  }
  const afterPrompt = await repo.get(SETTING_KEYS.systemPromptOverride);
  const afterInstr = await repo.get(SETTING_KEYS.customInstructions);
  if ((beforePrompt ?? "") !== (afterPrompt ?? "") || (beforeInstr ?? "") !== (afterInstr ?? "")) {
    const { snapshotPrompt } = await import("../prompt/versions");
    await snapshotPrompt(repo, beforePrompt, beforeInstr);
  }

  // Persona del bot (¿asistente o el dueño mismo en primera persona?).
  const personaRaw = form.get(SETTING_KEYS.agentPersona);
  if (personaRaw !== null) {
    await repo.set(SETTING_KEYS.agentPersona, String(personaRaw).trim() === "dueño" ? "dueño" : "");
  }

  // BYO-LLM: proveedor y modelo se guardan tal cual (allow-list de valores).
  const provRaw = form.get(SETTING_KEYS.llmProvider);
  if (provRaw !== null) {
    const v = String(provRaw).trim().toLowerCase();
    await repo.set(
      SETTING_KEYS.llmProvider,
      v === "anthropic" || v === "openai" || v === "xai" || v === "minimax" || v === "google" || v === "aisa" ? v : "",
    );
  }
  const baseUrlRaw = form.get(SETTING_KEYS.llmApiBaseUrl);
  if (baseUrlRaw !== null) {
    await repo.set(SETTING_KEYS.llmApiBaseUrl, String(baseUrlRaw).trim().slice(0, 200));
  }
  const modelRaw = form.get(SETTING_KEYS.llmModel);
  if (modelRaw !== null) {
    await repo.set(SETTING_KEYS.llmModel, String(modelRaw).trim().slice(0, 100));
  }
  // La API key SOLO se sobreescribe si escribieron algo (el input siempre
  // llega vacío cuando no la tocaron); el checkbox la borra explícitamente.
  if (form.get("llm_api_key_clear") === "1") {
    await repo.set(SETTING_KEYS.llmApiKey, "");
  } else {
    const keyRaw = form.get(SETTING_KEYS.llmApiKey);
    if (keyRaw !== null && String(keyRaw).trim() !== "") {
      await repo.set(SETTING_KEYS.llmApiKey, String(keyRaw).trim());
    }
  }

  // Zona horaria del negocio (reloj del bot + agenda). Solo se acepta una zona
  // IANA válida — un typo mandaría las citas a la hora equivocada; vacío = default.
  const tzRaw = form.get(SETTING_KEYS.businessTimezone);
  if (tzRaw !== null) {
    const v = String(tzRaw).trim();
    await repo.set(SETTING_KEYS.businessTimezone, v === "" || isValidTimeZone(v) ? v : "");
  }

  // Modelo de ANÁLISIS (scraping): misma forma que el del bot, pero SEPARADO.
  // Todo vacío = hereda la config del chat (ver analysisLlmOverridesFrom).
  const aProvRaw = form.get(SETTING_KEYS.analysisLlmProvider);
  if (aProvRaw !== null) {
    const v = String(aProvRaw).trim().toLowerCase();
    await repo.set(
      SETTING_KEYS.analysisLlmProvider,
      v === "anthropic" || v === "openai" || v === "xai" || v === "minimax" || v === "google" || v === "aisa" ? v : "",
    );
  }
  const aBaseRaw = form.get(SETTING_KEYS.analysisLlmApiBaseUrl);
  if (aBaseRaw !== null) {
    await repo.set(SETTING_KEYS.analysisLlmApiBaseUrl, String(aBaseRaw).trim().slice(0, 200));
  }
  const aModelRaw = form.get(SETTING_KEYS.analysisLlmModel);
  if (aModelRaw !== null) {
    await repo.set(SETTING_KEYS.analysisLlmModel, String(aModelRaw).trim().slice(0, 100));
  }
  if (form.get("analysis_llm_api_key_clear") === "1") {
    await repo.set(SETTING_KEYS.analysisLlmApiKey, "");
  } else {
    const aKeyRaw = form.get(SETTING_KEYS.analysisLlmApiKey);
    if (aKeyRaw !== null && String(aKeyRaw).trim() !== "") {
      await repo.set(SETTING_KEYS.analysisLlmApiKey, String(aKeyRaw).trim());
    }
  }

  // Decodo (scraping): misma regla que la API key del LLM — solo se sobreescribe
  // si escribieron algo; el checkbox la borra. Vacía → cae al secret del worker.
  if (form.get("decodo_clear") === "1") {
    await repo.set(SETTING_KEYS.decodoAuth, "");
  } else {
    const decodoRaw = form.get(SETTING_KEYS.decodoAuth);
    if (decodoRaw !== null && String(decodoRaw).trim() !== "") {
      await repo.set(SETTING_KEYS.decodoAuth, String(decodoRaw).trim());
    }
  }

  // Proveedor de scraping (auto | aisa | decodo) y la key de AIsa. La key vacía
  // = hereda la del LLM, así que solo se guarda si escribieron algo.
  const provider = String(form.get(SETTING_KEYS.scrapeProvider) ?? "").trim();
  if (provider === "auto" || provider === "aisa" || provider === "decodo") {
    await repo.set(SETTING_KEYS.scrapeProvider, provider);
  }
  if (form.get("aisa_clear") === "1") {
    await repo.set(SETTING_KEYS.aisaApiKey, "");
  } else {
    const aisaRaw = form.get(SETTING_KEYS.aisaApiKey);
    if (aisaRaw !== null && String(aisaRaw).trim() !== "") {
      await repo.set(SETTING_KEYS.aisaApiKey, String(aisaRaw).trim());
    }
  }

  return c.redirect("/admin/config?saved=1");
});

// Copia la API key de Decodo del secret del worker (`env.DECODO_AUTH`) a los
// settings, para que el dueño la vea/edite desde el panel sin `wrangler secret`.
adminApp.post("/config/decodo-import", async (c) => {
  const raw = (c.env.DECODO_AUTH ?? "").trim();
  if (raw) await new SettingsRepo(new Db(c.env.DB)).set(SETTING_KEYS.decodoAuth, raw);
  await audit(c, {
    action: "config.decodo_import",
    target: `settings:${SETTING_KEYS.decodoAuth}`,
    afterVal: raw ? "importada del secret del worker" : "(el worker no tiene secret)",
  });
  return c.redirect("/admin/config?saved=1");
});

adminApp.get("/leads/export.csv", async (c) => {
  const csv = await exportLeadsCsv(c.env);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${Date.now()}.csv"`,
    },
  });
});

// --- Mutating actions (HTMX / plain form posts) -----------------------------

// Mover un lead en el kanban (entrada / nuevo / contactado / vendido / perdido).
// Lo llama el drag&drop del kanban, el <select> de la tabla, y —cuando el dueño
// lo mueve— la ficha del lead queda actualizada para que el bot la lea después.
adminApp.post("/leads/:id/status", async (c) => {
  const { LEAD_STATUSES } = await import("../db/leads");
  const form = await c.req.formData();
  const raw = String(form.get("status") ?? "new");
  const note = String(form.get("note") ?? "").trim() || undefined;
  const status = (LEAD_STATUSES as readonly string[]).includes(raw) ? (raw as (typeof LEAD_STATUSES)[number]) : "new";
  const leads = new LeadsRepo(new Db(c.env.DB));
  const id = c.req.param("id");
  await leads.setStatus(id, status, note);
  await audit(c, { action: "lead.status", target: `lead:${id}`, targetLabel: `Lead ${id}`, afterVal: status });
  // El kanban hace fetch (no navega): devolvemos 204 y el JS mueve la tarjeta.
  if (c.req.header("x-kanban") === "1") return new Response(null, { status: 204 });
  return c.redirect(`/admin/leads${form.get("vista") === "tabla" ? "?vista=tabla" : ""}`);
});

// ── Nicho RESTAURANTE: cambiar el estado de un pedido ────────────────────────
// El cambio válido dispara el aviso al cliente por su canal (src/orders/notify).
adminApp.post("/pedidos/:id/status", async (c) => {
  const { OrdersRepo } = await import("../db/orders");
  const { notifyCustomerStatus } = await import("../orders/notify");
  const form = await c.req.formData();
  const to = String(form.get("status") ?? "").trim();
  const note = String(form.get("note") ?? "").trim() || undefined;
  const id = c.req.param("id");
  const repo = new OrdersRepo(new Db(c.env.DB));
  const before = await repo.get(id);
  const updated = await repo.setStatus(id, to as never, note);
  if (!updated) {
    await audit(c, { action: "order.status", target: `order:${id}`, beforeVal: before?.status, afterVal: `${to} (rechazado)`, result: "error" });
    return c.redirect("/admin/pedidos?err=transicion");
  }
  await notifyCustomerStatus(c.env, updated);
  await audit(c, { action: "order.status", target: `order:${id}`, targetLabel: `Pedido ${before?.track_code ?? id}`, beforeVal: before?.status, afterVal: to });
  return c.redirect("/admin/pedidos");
});

// Pago recibido (marca el comprobante). El nombre del repartidor asignado sale
// en el aviso "en camino" al cliente.
adminApp.post("/pedidos/:id/proof", async (c) => {
  const { OrdersRepo } = await import("../db/orders");
  const f = await c.req.formData().catch(() => null);
  const id = c.req.param("id");
  const url = String(f?.get("proofUrl") ?? "").trim() || "manual";
  await new OrdersRepo(new Db(c.env.DB)).setPaymentProof(id, url);
  await audit(c, { action: "order.proof", target: `order:${id}`, afterVal: url });
  return c.redirect("/admin/pedidos");
});

adminApp.post("/pedidos/:id/driver", async (c) => {
  const { OrdersRepo } = await import("../db/orders");
  const f = await c.req.formData();
  const id = c.req.param("id");
  const name = String(f.get("driverName") ?? "").trim();
  const phone = String(f.get("driverPhone") ?? "").trim();
  if (!name) return c.redirect("/admin/pedidos");
  await new OrdersRepo(new Db(c.env.DB)).assignDriver(id, name, phone);
  await audit(c, { action: "order.driver", target: `order:${id}`, afterVal: name });
  return c.redirect("/admin/pedidos");
});

// ── Nicho RESTAURANTE: vistas Pedidos / Menú / Reportes ─────────────────────
// El nav solo las muestra si BOT_NICHE=restaurante (hooks.navExtra); igual
// redirigimos si no es el giro, para no servir una vista vacía por URL directa.
function isRestaurante(c: { env: Env }): boolean {
  return (c.env.BOT_NICHE ?? "").trim().toLowerCase() === "restaurante";
}

function isTaxis(c: { env: Env }): boolean {
  return (c.env.BOT_NICHE ?? "").trim().toLowerCase() === "taxis";
}

/** Lee un monto no negativo de un campo de formulario (0 si inválido). */
function formMoney(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

adminApp.get("/pedidos", async (c) => {
  if (!isRestaurante(c)) return c.redirect("/admin/overview");
  const { renderPedidos } = await import("./views/pedidos");
  return c.html(await renderPedidos(c.env, { filter: c.req.query("status"), err: c.req.query("err"), tv: c.req.query("tv") === "1" }));
});

// Feed liviano para el sonido/badge de la pantalla de Pedidos: los ids de los
// pedidos activos + el timestamp del más nuevo. El cliente lo pide cada ~15 s y
// suena si aparece un id que no tenía. No depende de push ni del sistema operativo.
adminApp.get("/pedidos/feed", async (c) => {
  if (!isRestaurante(c)) return c.json({ ids: [], latestAt: 0 });
  const { OrdersRepo } = await import("../db/orders");
  const active = await new OrdersRepo(new Db(c.env.DB)).active();
  return c.json({
    ids: active.map((o) => o.id),
    latestAt: active.reduce((m, o) => Math.max(m, o.created_at), 0),
    count: active.length,
  });
});

// Catálogo/menú: tabla `products` (precios). Disponible para TODOS los giros —
// restaurante lo llama "Menú"; los demás, "Catálogo" (lo usa catalogQuery y,
// para cotizar, la tool crearCotizacion).
adminApp.get("/menu", async (c) => {
  const { renderMenu } = await import("./views/menu-editor");
  return c.html(await renderMenu(c.env, c.req.query("saved") === "1"));
});

adminApp.post("/menu", async (c) => {
  const { ProductsRepo } = await import("../db/products");
  const f = await c.req.formData();
  const name = String(f.get("name") ?? "").trim();
  const price = Number(f.get("price"));
  if (!name || !Number.isFinite(price) || price < 0) return c.redirect("/admin/menu");
  const id = await new ProductsRepo(new Db(c.env.DB)).create({
    name,
    price,
    category: String(f.get("category") ?? "").trim() || null,
    description: String(f.get("description") ?? "").trim() || null,
    imageUrl: String(f.get("imageUrl") ?? "").trim() || null,
  });
  await audit(c, { action: "menu.product.create", target: `product:${id}`, targetLabel: name });
  return c.redirect("/admin/menu?saved=1");
});

// Carga el catálogo de ejemplo del pack (NichePack.seedCatalog) si el catálogo
// está vacío. Reutilizable por cualquier giro que cotice. OJO: va ANTES de
// `/menu/:id` — si no, Hono matchea "seed" como :id y esta ruta nunca corre.
adminApp.post("/menu/seed", async (c) => {
  const { getNiche } = await import("../niches");
  const { ProductsRepo } = await import("../db/products");
  const repo = new ProductsRepo(new Db(c.env.DB));
  const seed = getNiche(c.env).seedCatalog ?? [];
  const existing = await repo.count();
  if (seed.length && existing === 0) {
    for (const item of seed) {
      await repo.create({ name: item.name, price: item.price, category: item.category ?? null, description: item.description ?? null });
    }
    await audit(c, { action: "menu.catalog.seed", target: "products", afterVal: `${seed.length} artículos` });
  }
  return c.redirect("/admin/menu?saved=1");
});

adminApp.post("/menu/:id", async (c) => {
  const { ProductsRepo } = await import("../db/products");
  const f = await c.req.formData();
  const id = c.req.param("id");
  const price = Number(f.get("price"));
  await new ProductsRepo(new Db(c.env.DB)).update(id, {
    name: String(f.get("name") ?? "").trim() || undefined,
    price: Number.isFinite(price) && price >= 0 ? price : undefined,
    category: f.has("category") ? String(f.get("category") ?? "").trim() || null : undefined,
    description: f.has("description") ? String(f.get("description") ?? "").trim() || null : undefined,
    imageUrl: f.has("imageUrl") ? String(f.get("imageUrl") ?? "").trim() || null : undefined,
  });
  await audit(c, { action: "menu.product.update", target: `product:${id}` });
  return c.redirect("/admin/menu?saved=1");
});

adminApp.post("/menu/:id/toggle", async (c) => {
  const { ProductsRepo } = await import("../db/products");
  const repo = new ProductsRepo(new Db(c.env.DB));
  const id = c.req.param("id");
  const p = await repo.get(id);
  if (p) await repo.setActive(id, p.active === 0);
  await audit(c, { action: "menu.product.toggle", target: `product:${id}`, afterVal: p && p.active === 0 ? "activo" : "agotado" });
  return c.redirect("/admin/menu");
});

adminApp.post("/menu/:id/delete", async (c) => {
  const { ProductsRepo } = await import("../db/products");
  const id = c.req.param("id");
  await new ProductsRepo(new Db(c.env.DB)).delete(id);
  await audit(c, { action: "menu.product.delete", target: `product:${id}` });
  return c.redirect("/admin/menu");
});

// Zonas de entrega (nicho restaurante): envío y mínimo por zona, que usa
// tomarPedido para cotizar el envío en vez de confiar en el modelo/KB.
adminApp.get("/zonas", async (c) => {
  if (!isRestaurante(c)) return c.redirect("/admin/overview");
  const { renderZonas } = await import("./views/zonas");
  return c.html(await renderZonas(c.env, c.req.query("saved") === "1"));
});

adminApp.post("/zonas", async (c) => {
  if (!isRestaurante(c)) return c.redirect("/admin/overview");
  const { DeliveryZonesRepo } = await import("../db/deliveryZones");
  const f = await c.req.formData();
  const name = String(f.get("name") ?? "").trim();
  if (!name) return c.redirect("/admin/zonas");
  const id = await new DeliveryZonesRepo(new Db(c.env.DB)).create({
    name,
    fee: formMoney(f.get("fee")),
    minOrder: formMoney(f.get("minOrder")),
    notes: String(f.get("notes") ?? "").trim() || null,
  });
  await audit(c, { action: "zonas.create", target: `zone:${id}`, targetLabel: name });
  return c.redirect("/admin/zonas?saved=1");
});

adminApp.post("/zonas/:id", async (c) => {
  if (!isRestaurante(c)) return c.redirect("/admin/overview");
  const { DeliveryZonesRepo } = await import("../db/deliveryZones");
  const f = await c.req.formData();
  const id = c.req.param("id");
  await new DeliveryZonesRepo(new Db(c.env.DB)).update(id, {
    name: String(f.get("name") ?? "").trim() || undefined,
    fee: f.has("fee") ? formMoney(f.get("fee")) : undefined,
    minOrder: f.has("minOrder") ? formMoney(f.get("minOrder")) : undefined,
    notes: f.has("notes") ? String(f.get("notes") ?? "").trim() || null : undefined,
  });
  await audit(c, { action: "zonas.update", target: `zone:${id}` });
  return c.redirect("/admin/zonas?saved=1");
});

adminApp.post("/zonas/:id/toggle", async (c) => {
  if (!isRestaurante(c)) return c.redirect("/admin/overview");
  const { DeliveryZonesRepo } = await import("../db/deliveryZones");
  const repo = new DeliveryZonesRepo(new Db(c.env.DB));
  const id = c.req.param("id");
  const z = await repo.get(id);
  if (z) await repo.setActive(id, z.active === 0);
  await audit(c, { action: "zonas.toggle", target: `zone:${id}` });
  return c.redirect("/admin/zonas");
});

adminApp.post("/zonas/:id/delete", async (c) => {
  if (!isRestaurante(c)) return c.redirect("/admin/overview");
  const { DeliveryZonesRepo } = await import("../db/deliveryZones");
  const id = c.req.param("id");
  await new DeliveryZonesRepo(new Db(c.env.DB)).delete(id);
  await audit(c, { action: "zonas.delete", target: `zone:${id}` });
  return c.redirect("/admin/zonas");
});

// Reportes por nicho (la ruta es la misma; el giro decide qué pantalla se sirve).
adminApp.get("/reportes", async (c) => {
  if (isRestaurante(c)) {
    const { renderReportesRestaurante, windowFromQuery } = await import("./views/reportes-restaurante");
    return c.html(await renderReportesRestaurante(c.env, windowFromQuery(new URL(c.req.url).searchParams)));
  }
  if (isTaxis(c)) {
    const { renderReportesTaxis } = await import("./views/reportes-taxis");
    const { windowFromQuery } = await import("./views/reportes-restaurante");
    return c.html(await renderReportesTaxis(c.env, windowFromQuery(new URL(c.req.url).searchParams)));
  }
  return c.redirect("/admin/overview");
});

adminApp.get("/reportes/export.csv", async (c) => {
  const win = new URL(c.req.url).searchParams;
  if (isRestaurante(c)) {
    const { windowFromQuery } = await import("./views/reportes-restaurante");
    const { buildRestaurantReports, reportsToCsv } = await import("../reports/restaurante");
    const r = await buildRestaurantReports(c.env, windowFromQuery(win));
    return new Response(reportsToCsv(r), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="reportes-restaurante.csv"`,
      },
    });
  }
  if (isTaxis(c)) {
    const { windowFromQuery } = await import("./views/reportes-restaurante");
    const { buildTaxiReports, reportsToCsv } = await import("../reports/taxis");
    const r = await buildTaxiReports(c.env, windowFromQuery(win));
    return new Response(reportsToCsv(r), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="reportes-taxis.csv"`,
      },
    });
  }
  return c.redirect("/admin/overview");
});

// ── Nicho TAXIS: Viajes / Cola / Bases / Conductores ─────────────────────────
// El nav solo las muestra si BOT_NICHE=taxis (hooks.navExtra); igual redirigimos
// si no es el giro, para no servir una vista vacía por URL directa.

// Cambiar el estado de un viaje: avisa al cliente por su canal.
adminApp.post("/viajes/:id/status", async (c) => {
  if (!isTaxis(c)) return c.redirect("/admin/overview");
  const { TaxiTripsRepo, TaxiDriversRepo } = await import("../db/taxi");
  const { notifyCustomerTripStatus } = await import("../taxi/notify");
  const form = await c.req.formData();
  const to = String(form.get("status") ?? "").trim();
  const note = String(form.get("note") ?? "").trim() || undefined;
  const id = c.req.param("id");
  const db = new Db(c.env.DB);
  const repo = new TaxiTripsRepo(db);
  const before = await repo.get(id);
  const updated = await repo.setStatus(id, to as never, note);
  if (!updated) {
    await audit(c, { action: "trip.status", target: `trip:${id}`, beforeVal: before?.status, afterVal: `${to} (rechazado)`, result: "error" });
    return c.redirect("/admin/viajes?err=transicion");
  }
  const driver = updated.driver_id ? await new TaxiDriversRepo(db).get(updated.driver_id) : null;
  await notifyCustomerTripStatus(c.env, updated, driver);
  await audit(c, { action: "trip.status", target: `trip:${id}`, targetLabel: `Viaje ${id}`, beforeVal: before?.status, afterVal: to });
  return c.redirect("/admin/viajes");
});

// Asignar un conductor a mano (cuando no había ninguno, o para corregir).
adminApp.post("/viajes/:id/assign", async (c) => {
  if (!isTaxis(c)) return c.redirect("/admin/overview");
  const { TaxiTripsRepo, TaxiDriversRepo, TaxiQueueRepo, TaxiBasesRepo } = await import("../db/taxi");
  const { notifyCustomerAssigned, notifyDriverAssigned } = await import("../taxi/notify");
  const form = await c.req.formData();
  const driverId = String(form.get("driver_id") ?? "").trim();
  if (!driverId) return c.redirect("/admin/viajes?err=sinconductor");
  const db = new Db(c.env.DB);
  const id = c.req.param("id");
  const driver = await new TaxiDriversRepo(db).get(driverId);
  if (!driver) return c.redirect("/admin/viajes?err=sinconductor");
  const updated = await new TaxiTripsRepo(db).assignDriver(id, driver.id, driver.base_id, "asignado por el operador");
  if (!updated) return c.redirect("/admin/viajes?err=transicion");
  // Si el conductor estaba esperando en su base, sale de la cola con este viaje.
  const queue = new TaxiQueueRepo(db);
  const entry = await queue.activeEntryForDriver(driver.id);
  if (entry?.status === "waiting") await queue.assign(entry.id, id);
  const base = driver.base_id ? await new TaxiBasesRepo(db).get(driver.base_id) : null;
  await notifyCustomerAssigned(c.env, updated, driver, base);
  await notifyDriverAssigned(c.env, updated, driver, base);
  await audit(c, { action: "trip.assign", target: `trip:${id}`, targetLabel: `Viaje ${id}`, afterVal: `${driver.name ?? driver.id}` });
  return c.redirect("/admin/viajes");
});

adminApp.get("/viajes", async (c) => {
  if (!isTaxis(c)) return c.redirect("/admin/overview");
  const { renderViajes } = await import("./views/viajes");
  return c.html(await renderViajes(c.env, { filter: c.req.query("status"), err: c.req.query("err"), tv: c.req.query("tv") === "1" }));
});

// Feed liviano para el sonido/badge de la pantalla de Viajes.
adminApp.get("/viajes/feed", async (c) => {
  if (!isTaxis(c)) return c.json({ ids: [], latestAt: 0 });
  const { TaxiTripsRepo } = await import("../db/taxi");
  const active = await new TaxiTripsRepo(new Db(c.env.DB)).active();
  return c.json({
    ids: active.map((t) => t.id),
    latestAt: active.reduce((m, t) => Math.max(m, t.created_at), 0),
    count: active.length,
  });
});

adminApp.get("/cola", async (c) => {
  if (!isTaxis(c)) return c.redirect("/admin/overview");
  if (c.req.header("x-partial") === "1") {
    const { renderColaFragment } = await import("./views/cola");
    return c.html(await renderColaFragment(c.env));
  }
  const { renderCola } = await import("./views/cola");
  return c.html(await renderCola(c.env));
});

adminApp.post("/cola/:id/leave", async (c) => {
  if (!isTaxis(c)) return c.redirect("/admin/overview");
  const { TaxiQueueRepo } = await import("../db/taxi");
  const repo = new TaxiQueueRepo(new Db(c.env.DB));
  const entry = await repo.get(c.req.param("id"));
  if (entry) await repo.leave(entry.driver_id);
  await audit(c, { action: "taxi.queue.leave", target: `queue:${c.req.param("id")}` });
  return c.redirect("/admin/cola");
});

adminApp.post("/cola/:id/up", async (c) => {
  if (!isTaxis(c)) return c.redirect("/admin/overview");
  const { TaxiQueueRepo } = await import("../db/taxi");
  await new TaxiQueueRepo(new Db(c.env.DB)).moveUp(c.req.param("id"));
  await audit(c, { action: "taxi.queue.moveUp", target: `queue:${c.req.param("id")}` });
  return c.redirect("/admin/cola");
});

adminApp.get("/bases", async (c) => {
  if (!isTaxis(c)) return c.redirect("/admin/overview");
  const { renderBases } = await import("./views/bases-editor");
  return c.html(await renderBases(c.env, c.req.query("saved") === "1"));
});

/** Lee los campos de una base desde el form (zonas incluidas). */
async function readBaseForm(c: any): Promise<import("../db/taxi").TaxiBaseInput> {
  const { parseZonesInput } = await import("./views/bases-editor");
  const f = await c.req.formData();
  const num = (k: string): number | null => {
    const v = String(f.get(k) ?? "").trim();
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    name: String(f.get("name") ?? "").trim(),
    address: String(f.get("address") ?? "").trim() || null,
    lat: num("lat"),
    lng: num("lng"),
    zones: parseZonesInput(String(f.get("zones") ?? "")),
    baseFare: num("base_fare") ?? 0,
    etaMin: num("eta_min") ?? 10,
    isDefault: f.get("is_default") === "1",
  };
}

adminApp.post("/bases", async (c) => {
  if (!isTaxis(c)) return c.redirect("/admin/overview");
  const { TaxiBasesRepo } = await import("../db/taxi");
  const input = await readBaseForm(c);
  if (!input.name) return c.redirect("/admin/bases");
  const id = await new TaxiBasesRepo(new Db(c.env.DB)).create(input);
  await audit(c, { action: "taxi.base.create", target: `base:${id}`, targetLabel: input.name });
  return c.redirect("/admin/bases?saved=1");
});

adminApp.post("/bases/:id", async (c) => {
  if (!isTaxis(c)) return c.redirect("/admin/overview");
  const { TaxiBasesRepo } = await import("../db/taxi");
  const input = await readBaseForm(c);
  const id = c.req.param("id");
  await new TaxiBasesRepo(new Db(c.env.DB)).update(id, input);
  await audit(c, { action: "taxi.base.update", target: `base:${id}` });
  return c.redirect("/admin/bases?saved=1");
});

adminApp.post("/bases/:id/toggle", async (c) => {
  if (!isTaxis(c)) return c.redirect("/admin/overview");
  const { TaxiBasesRepo } = await import("../db/taxi");
  const repo = new TaxiBasesRepo(new Db(c.env.DB));
  const id = c.req.param("id");
  const b = await repo.get(id);
  if (b) await repo.update(id, { active: b.active === 0 });
  await audit(c, { action: "taxi.base.toggle", target: `base:${id}`, afterVal: b && b.active === 0 ? "activa" : "inactiva" });
  return c.redirect("/admin/bases");
});

adminApp.post("/bases/:id/delete", async (c) => {
  if (!isTaxis(c)) return c.redirect("/admin/overview");
  const { TaxiBasesRepo } = await import("../db/taxi");
  const id = c.req.param("id");
  await new TaxiBasesRepo(new Db(c.env.DB)).delete(id);
  await audit(c, { action: "taxi.base.delete", target: `base:${id}` });
  return c.redirect("/admin/bases");
});

adminApp.get("/conductores", async (c) => {
  if (!isTaxis(c)) return c.redirect("/admin/overview");
  const { renderConductores } = await import("./views/conductores-editor");
  return c.html(await renderConductores(c.env, c.req.query("saved") === "1"));
});

/** Lee los campos de un conductor desde el form. */
async function readDriverForm(c: any): Promise<Partial<import("../db/taxi").TaxiDriverInput>> {
  const f = await c.req.formData();
  const str = (k: string) => String(f.get(k) ?? "").trim() || null;
  const seatsRaw = String(f.get("seats") ?? "").trim();
  const seats = seatsRaw ? Number(seatsRaw) : null;
  return {
    code: str("code"),
    name: str("name"),
    phone: str("phone"),
    baseId: str("base_id"),
    vehicle: str("vehicle"),
    plate: str("plate"),
    seats: seats !== null && Number.isFinite(seats) ? seats : null,
  };
}

adminApp.post("/conductores", async (c) => {
  if (!isTaxis(c)) return c.redirect("/admin/overview");
  const { TaxiDriversRepo } = await import("../db/taxi");
  const input = await readDriverForm(c);
  if (!input.name) return c.redirect("/admin/conductores");
  const id = await new TaxiDriversRepo(new Db(c.env.DB)).create(input);
  await audit(c, { action: "taxi.driver.create", target: `driver:${id}`, targetLabel: input.name ?? "" });
  return c.redirect("/admin/conductores?saved=1");
});

adminApp.post("/conductores/:id", async (c) => {
  if (!isTaxis(c)) return c.redirect("/admin/overview");
  const { TaxiDriversRepo } = await import("../db/taxi");
  const input = await readDriverForm(c);
  const id = c.req.param("id");
  await new TaxiDriversRepo(new Db(c.env.DB)).update(id, input);
  await audit(c, { action: "taxi.driver.update", target: `driver:${id}` });
  return c.redirect("/admin/conductores?saved=1");
});

adminApp.post("/conductores/:id/toggle", async (c) => {
  if (!isTaxis(c)) return c.redirect("/admin/overview");
  const { TaxiDriversRepo } = await import("../db/taxi");
  const repo = new TaxiDriversRepo(new Db(c.env.DB));
  const id = c.req.param("id");
  const d = await repo.get(id);
  if (d) await repo.setActive(id, d.active === 0);
  await audit(c, { action: "taxi.driver.toggle", target: `driver:${id}`, afterVal: d && d.active === 0 ? "activo" : "inactivo" });
  return c.redirect("/admin/conductores");
});

adminApp.post("/conductores/:id/delete", async (c) => {
  if (!isTaxis(c)) return c.redirect("/admin/overview");
  const { TaxiDriversRepo } = await import("../db/taxi");
  const id = c.req.param("id");
  await new TaxiDriversRepo(new Db(c.env.DB)).delete(id);
  await audit(c, { action: "taxi.driver.delete", target: `driver:${id}` });
  return c.redirect("/admin/conductores");
});

// "Elegir conductor" DESDE EL CHAT: asigna (o crea) el viaje de esa conversación
// y le manda al cliente el conductor asignado. Refresca el hilo.
adminApp.post("/conversations/:id/assign-driver", async (c) => {
  if (!isTaxis(c)) return c.body(null, 404);
  const id = c.req.param("id");
  const { t } = await panelI18n(c.env);
  const form = await c.req.formData().catch(() => null);
  const driverId = String(form?.get("driver_id") ?? "").trim();
  if (!driverId) return c.html(`<span class="text-red-600">${t("msg.taxiPickDriver")}</span>`);
  const { TaxiTripsRepo, TaxiDriversRepo, TaxiQueueRepo, TaxiBasesRepo } = await import("../db/taxi");
  const { notifyCustomerAssigned, notifyDriverAssigned } = await import("../taxi/notify");
  const db = new Db(c.env.DB);
  const conv = await new ConversationsRepo(db).getById(id);
  if (!conv) return c.html(`<span class="text-red-600">${t("msg.conversationsNotFound")}</span>`);
  const driver = await new TaxiDriversRepo(db).get(driverId);
  if (!driver) return c.html(`<span class="text-red-600">${t("msg.taxiDriverNotFound")}</span>`);

  const trips = new TaxiTripsRepo(db);
  let tripId = (await trips.activeForConversation(id))?.id;
  if (!tripId) {
    tripId = await trips.create({
      conversationId: id,
      channel: conv.channel,
      channelUserId: conv.channel_user_id,
      customerName: conv.display_name ?? null,
      status: "solicitado",
    });
  }
  const updated = await trips.assignDriver(tripId, driver.id, driver.base_id, "asignado por el operador desde el chat");
  if (!updated) return c.html(`<span class="text-red-600">${t("msg.taxiTripNoAssign")}</span>`);

  const queue = new TaxiQueueRepo(db);
  const entry = await queue.activeEntryForDriver(driver.id);
  if (entry?.status === "waiting") await queue.assign(entry.id, tripId);
  const base = driver.base_id ? await new TaxiBasesRepo(db).get(driver.base_id) : null;
  await notifyCustomerAssigned(c.env, updated, driver, base);
  await notifyDriverAssigned(c.env, updated, driver, base);
  await new ConversationsRepo(db).setPausedUntil(id, Date.now() + TAKEOVER_MS);
  await audit(c, { action: "conversation.assign_driver", target: `conv:${id}`, afterVal: driver.name ?? driver.id });
  return c.html(await renderThreadLive(c.env, id));
});

// Resolve a support ticket.
adminApp.post("/tickets/:id/resolve", async (c) => {
  const form = await c.req.formData();
  const resolvedBy = String(form.get("resolved_by") ?? c.env.OWNER_EMAIL ?? "admin").trim() || "admin";
  const tickets = new TicketsRepo(new Db(c.env.DB));
  const id = c.req.param("id");
  const t = await tickets.getById(id).catch(() => null);
  await tickets.resolve(id, resolvedBy);
  // Resolver el ticket = ya no necesita atención humana → se quita la etiqueta.
  if (t?.conversation_id) {
    try {
      const { ConversationLabelsRepo, NEEDS_HUMAN_LABEL } = await import("../db/conversationLabels");
      await new ConversationLabelsRepo(new Db(c.env.DB)).remove(t.conversation_id, NEEDS_HUMAN_LABEL);
    } catch (e) {
      console.warn("[tickets] no se pudo quitar la etiqueta:", e);
    }
  }
  await audit(c, {
    action: "ticket.resolve",
    target: `ticket:${id}`,
    targetLabel: t?.summary ? `Ticket · ${t.summary.slice(0, 60)}` : `Ticket ${id}`,
    afterVal: `resuelto por ${resolvedBy}`,
  });
  return c.redirect("/admin/tickets");
});

// ── Cartera de cobros (nicho `cartera`) ────────────────────────────────────
// El panel vive en /admin/cartera (ver niches/cartera.ts → hooks.navExtra).
adminApp.get("/cartera", async (c) => {
  const { renderCartera } = await import("./views/cartera");
  return c.html(await renderCartera(c.env, c.req.query() as unknown as URLSearchParams));
});

/** "YYYY-MM-DD" → epoch ms (mediodía UTC, para evitar saltos por zona). */
function parseDay(s: string | null | undefined): number | null {
  const v = (s ?? "").trim();
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return Number.isFinite(t) ? t : null;
}

// Importar cartera: una línea por deudor, separada por coma o punto y coma.
// Formato: nombre, telefono, monto, vence(YYYY-MM-DD), referencia
adminApp.post("/cartera/import", async (c) => {
  const form = await c.req.formData();
  const csv = String(form.get("csv") ?? "").trim();
  const listName = String(form.get("list_name") ?? "").trim() || `Cartera ${new Date().toISOString().slice(0, 10)}`;
  if (!csv) return c.redirect("/admin/cartera");
  const { CollectionsRepo } = await import("../db/collections");
  const repo = new CollectionsRepo(new Db(c.env.DB));
  const listId = await repo.createList(listName);
  let imported = 0;
  let skipped = 0;
  for (const rawLine of csv.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const cols = line.split(/[;,\t]/).map((x) => x.trim());
    const [name, phone, amountRaw, dueRaw, ref, doc] = cols;
    const amount = Number((amountRaw ?? "").replace(/[^\d.]/g, ""));
    if (!name && !phone) {
      skipped++;
      continue;
    }
    const { id } = await repo.upsertDebtor({
      name: name || undefined,
      phone: phone || undefined,
      documentId: doc || undefined,
      externalRef: ref || undefined,
      listId,
    });
    if (Number.isFinite(amount) && amount > 0) {
      await repo.addAccount({ debtorId: id, amount, dueDate: parseDay(dueRaw), concept: "Deuda importada" });
    } else {
      skipped++;
    }
    await repo.ensureCase(id).catch(() => {});
    imported++;
  }
  await audit(c, {
    action: "cartera.import",
    target: `cartera:${listId}`,
    targetLabel: `Cartera · ${listName}`,
    afterVal: `${imported} deudores importados, ${skipped} sin monto/omitidos`,
  });
  return c.redirect(`/admin/cartera?import=${imported}`);
});

adminApp.post("/cartera/debtor/:id/account", async (c) => {
  const id = c.req.param("id");
  const form = await c.req.formData();
  const amount = Number(String(form.get("amount") ?? "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return c.redirect(`/admin/cartera?d=${encodeURIComponent(id)}`);
  const { CollectionsRepo } = await import("../db/collections");
  const repo = new CollectionsRepo(new Db(c.env.DB));
  const accountId = await repo.addAccount({
    debtorId: id,
    amount,
    dueDate: parseDay(String(form.get("due_date") ?? "")),
    concept: String(form.get("concept") ?? "").trim() || "Deuda",
  });
  await repo.ensureCase(id, accountId).catch(() => {});
  return c.redirect(`/admin/cartera?d=${encodeURIComponent(id)}`);
});

adminApp.post("/cartera/debtor/:id/payment", async (c) => {
  const id = c.req.param("id");
  const form = await c.req.formData();
  const accountId = String(form.get("account_id") ?? "").trim();
  const amount = Number(String(form.get("amount") ?? "").replace(/[^\d.]/g, ""));
  if (!accountId || !Number.isFinite(amount) || amount <= 0) return c.redirect(`/admin/cartera?d=${encodeURIComponent(id)}`);
  const { CollectionsRepo } = await import("../db/collections");
  const repo = new CollectionsRepo(new Db(c.env.DB));
  await repo.registerPayment(accountId, amount);
  const caseId = await repo.ensureCase(id, accountId).catch(() => null);
  await repo.logInteraction({
    caseId,
    debtorId: id,
    accountId,
    channel: "manual",
    direction: "in",
    kind: "pago",
    summary: `Pago registrado: ${amount}`,
    outcome: "pago",
  });
  return c.redirect(`/admin/cartera?d=${encodeURIComponent(id)}`);
});

adminApp.post("/cartera/debtor/:id/promise", async (c) => {
  const id = c.req.param("id");
  const form = await c.req.formData();
  const amount = Number(String(form.get("amount") ?? "").replace(/[^\d.]/g, ""));
  const { CollectionsRepo } = await import("../db/collections");
  const repo = new CollectionsRepo(new Db(c.env.DB));
  await repo.createPromise({
    debtorId: id,
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    promisedDate: parseDay(String(form.get("promised_date") ?? "")),
    notes: String(form.get("notes") ?? "").trim() || undefined,
  });
  const caseId = await repo.ensureCase(id).catch(() => null);
  if (caseId) await repo.setCaseStage(caseId, "promesa").catch(() => {});
  await repo.logInteraction({
    caseId,
    debtorId: id,
    channel: "manual",
    direction: "in",
    kind: "nota",
    summary: `Promesa de pago registrada: ${amount || "?"}`,
    outcome: "promesa",
  });
  return c.redirect(`/admin/cartera?d=${encodeURIComponent(id)}`);
});

adminApp.post("/cartera/debtor/:id/stage", async (c) => {
  const id = c.req.param("id");
  const form = await c.req.formData();
  const stage = String(form.get("stage") ?? "").trim() || "nuevo";
  const note = String(form.get("note") ?? "").trim();
  const { CollectionsRepo } = await import("../db/collections");
  const repo = new CollectionsRepo(new Db(c.env.DB));
  const caseId = await repo.ensureCase(id);
  await repo.setCaseStage(caseId, stage);
  if (note) {
    await repo.logInteraction({ caseId, debtorId: id, channel: "manual", direction: "out", kind: "nota", summary: note, outcome: "otro" });
  }
  return c.redirect(`/admin/cartera?d=${encodeURIComponent(id)}`);
});

// Crear/actualizar una regla de cobranza (tramo de mora × canal × plantilla).
adminApp.post("/cartera/reglas", async (c) => {
  const form = await c.req.formData();
  const { CollectionsRepo } = await import("../db/collections");
  const repo = new CollectionsRepo(new Db(c.env.DB));
  const maxRaw = String(form.get("max_days") ?? "").trim();
  const id = String(form.get("id") ?? "").trim() || undefined;
  await repo.upsertRule({
    id,
    name: String(form.get("name") ?? "").trim() || "Regla",
    minDaysOverdue: Number(form.get("min_days") ?? 0),
    maxDaysOverdue: maxRaw ? Number(maxRaw) : null,
    channel: String(form.get("channel") ?? "whatsapp"),
    template: String(form.get("template") ?? "").trim() || undefined,
    maxAttempts: Number(form.get("max_attempts") ?? 3),
    active: String(form.get("active") ?? "1") !== "0",
  });
  await audit(c, { action: "cartera.rule.save", target: `cartera_rule:${id ?? "new"}`, targetLabel: "Regla de cobranza" });
  return c.redirect("/admin/cartera");
});

adminApp.post("/cartera/reglas/:id/delete", async (c) => {
  const { CollectionsRepo } = await import("../db/collections");
  await new CollectionsRepo(new Db(c.env.DB)).deleteRule(c.req.param("id"));
  await audit(c, { action: "cartera.rule.delete", target: `cartera_rule:${c.req.param("id")}` });
  return c.redirect("/admin/cartera");
});

// Correr el motor de cobranza a mano (útil para probar reglas sin esperar el cron).
adminApp.post("/cartera/run", async (c) => {
  const { runCollections } = await import("../collections/engine");
  const r = await runCollections(c.env, { force: true }).catch((e) => {
    console.error("collections (manual):", e);
    return null;
  });
  await audit(c, {
    action: "cartera.run",
    target: "cartera",
    targetLabel: "Motor de cobranza",
    afterVal: r ? `enviados ${r.sent}, omitidos ${r.skipped}, fallos ${r.failed}` : "error",
  });
  return c.redirect(`/admin/cartera?run=${encodeURIComponent(r ? `enviados:${r.sent} omitidos:${r.skipped} fallos:${r.failed}` : "error")}`);
});

// Disparar una llamada de cobranza con voz IA (Vapi/Retell) desde la ficha.
adminApp.post("/cartera/debtor/:id/call", async (c) => {
  const id = c.req.param("id");
  const { startDebtorCall } = await import("../collections/voice");
  const r = await startDebtorCall(c.env, id);
  await audit(c, {
    action: "cartera.call",
    target: `debtor:${id}`,
    targetLabel: "Llamada de cobranza",
    afterVal: r.ok ? `iniciada (${r.provider})` : `error: ${r.error ?? "?"}`,
    result: r.ok ? "ok" : "error",
  });
  return c.redirect(`/admin/cartera?d=${encodeURIComponent(id)}&call=${encodeURIComponent(r.ok ? "ok" : r.error ?? "error")}`);
});

// Opt-out / no contactar (DNC) de un deudor.
adminApp.post("/cartera/debtor/:id/dnc", async (c) => {
  const id = c.req.param("id");
  const form = await c.req.formData();
  const on = String(form.get("on") ?? "1") === "1";
  const reason = String(form.get("reason") ?? "").trim() || undefined;
  const { CollectionsRepo } = await import("../db/collections");
  const repo = new CollectionsRepo(new Db(c.env.DB));
  const debtor = await repo.getDebtor(id).catch(() => null);
  await repo.setDnc(id, on, reason, debtor?.phone ?? null);
  const caseId = await repo.ensureCase(id).catch(() => null);
  if (caseId) {
    await repo
      .logInteraction({
        caseId,
        debtorId: id,
        channel: "manual",
        direction: "in",
        kind: "nota",
        summary: on ? `Opt-out: no contactar${reason ? ` — ${reason}` : ""}` : "Reactivado (vuelve a cobranza)",
        outcome: on ? "opt_out" : "reactivado",
      })
      .catch(() => {});
  }
  await audit(c, {
    action: "cartera.dnc",
    target: `debtor:${id}`,
    targetLabel: on ? "No contactar (DNC)" : "Reactivar",
    afterVal: reason ?? "",
  });
  return c.redirect(`/admin/cartera?d=${encodeURIComponent(id)}`);
});

// Ventana horaria de envío del motor de cobranza.
adminApp.post("/cartera/settings", async (c) => {
  const form = await c.req.formData();
  const repo = new SettingsRepo(new Db(c.env.DB));
  const from = Math.min(23, Math.max(0, Number(form.get("from_hour") ?? 8) || 0));
  const to = Math.min(24, Math.max(0, Number(form.get("to_hour") ?? 19) || 0));
  const tz = Number(form.get("tz_offset") ?? -360);
  await repo.set(SETTING_KEYS.collectionSendFromHour, String(from));
  await repo.set(SETTING_KEYS.collectionSendToHour, String(to));
  await repo.set(SETTING_KEYS.collectionTzOffsetMinutes, String(Number.isFinite(tz) ? tz : -360));
  await audit(c, { action: "cartera.settings", target: "cartera", afterVal: `${from}-${to} UTC${tz >= 0 ? "+" : ""}${tz / 60}` });
  return c.redirect("/admin/cartera");
});

// Exportar la cartera a CSV.
adminApp.get("/cartera/export.csv", async (c) => {
  const { CollectionsRepo } = await import("../db/collections");
  const rows = await new CollectionsRepo(new Db(c.env.DB)).listDebtors({ limit: 500 });
  const head = "nombre,telefono,documento,referencia,saldo,cuentas,vence,etapa\n";
  const csv = rows
    .map((d) =>
      [
        d.name ?? "",
        d.phone ?? "",
        d.document_id ?? "",
        d.external_ref ?? "",
        d.balance,
        d.accounts,
        d.next_due ? new Date(d.next_due).toISOString().slice(0, 10) : "",
        d.stage ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
  return new Response(head + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cartera-${Date.now()}.csv"`,
    },
  });
});

// --- Inbox actions (F1) -------------------------------------------------------

/** Owner takes over for this long after replying/pausing from the dashboard. */
const TAKEOVER_MS = 60 * 60 * 1000;

// Reply AS A HUMAN from the dashboard: sends through the conversation's channel
// adapter (Twilio/Telegram/Meta/ManyChat), persists the message as role=owner,
// and pauses the bot (owner takeover — same behavior as isOwnerMessage in the
// agent). Returns a status line for #send-status plus an out-of-band swap that
// refreshes #thread-live instantly. X-Sent: 1 tells the composer to reset.
adminApp.post("/conversations/:id/reply", async (c) => {
  const id = c.req.param("id");
  const { t } = await panelI18n(c.env);
  const form = await c.req.formData().catch(() => null);
  const text = String(form?.get("text") ?? "").trim();
  if (!text) return c.html(`<span class="text-stone-400">${t("msg.conversationsEmptyMessage")}</span>`);

  const db = new Db(c.env.DB);
  const convs = new ConversationsRepo(db);
  const conv = await convs.getById(id);
  if (!conv) return c.html(`<span class="text-red-600">${t("msg.conversationsNotFound")}</span>`);

  try {
    const adapter = pickAdapter(conv.channel as ChannelId);
    await adapter.sendReply(
      {
        channel: conv.channel as ChannelId,
        channelUserId: conv.channel_user_id,
        chunks: [text],
        interChunkDelayMs: 0,
      },
      c.env,
    );
  } catch (e) {
    // Nothing persisted on failure: the customer never got the message.
    const msg = e instanceof Error ? e.message : String(e);
    return c.html(`<span class="text-red-600">${t("msg.conversationsSendError", { error: escapeHtml(msg) })}</span>`);
  }

  const msgs = new MessagesRepo(db);
  await msgs.append(id, "owner", text);
  await convs.touchLastMessage(id);
  // Responder como humano = takeover INDEFINIDO: el bot no vuelve solo, ni a la
  // hora. El dueño lo devuelve explícitamente con "Devolver al bot".
  await convs.setPausedUntil(id, PAUSE_INDEFINITE);
  await audit(c, {
    action: "conversation.reply",
    target: `conv:${id}`,
    targetLabel: `Conversación · ${channelLabel(conv.channel)}`,
    afterVal: text.slice(0, 200),
  });

  c.header("X-Sent", "1");
  return c.html(
    `<span class="text-emerald-600">${t("msg.conversationsSent", { channel: escapeHtml(channelLabel(conv.channel)) })}</span>` +
      `<div id="thread-live" hx-swap-oob="innerHTML">${await renderThreadLive(c.env, id)}</div>`,
  );
});

// Pause the bot in this conversation without sending anything (owner wants the
// customer for themselves). Returns the refreshed thread fragment.
adminApp.post("/conversations/:id/pause", async (c) => {
  const id = c.req.param("id");
  const convs = new ConversationsRepo(new Db(c.env.DB));
  await convs.setPausedUntil(id, Date.now() + TAKEOVER_MS);
  await audit(c, { action: "conversation.pause", target: `conv:${id}`, targetLabel: `Conversación ${id}` });
  return c.html(await renderThreadLive(c.env, id));
});

// Pausa hasta que el dueño la reactive (sentinel lejano en paused_until).
adminApp.post("/conversations/:id/pause-forever", async (c) => {
  const id = c.req.param("id");
  const convs = new ConversationsRepo(new Db(c.env.DB));
  await convs.setPausedUntil(id, PAUSE_INDEFINITE);
  await audit(c, {
    action: "conversation.pause_indefinite",
    target: `conv:${id}`,
    targetLabel: `Conversación ${id}`,
  });
  return c.html(await renderThreadLive(c.env, id));
});

// Bloqueo del CONTACTO al bot (silencio total). Es distinto de la pausa: cubre
// respuestas, seguimientos, campañas y disparadores hasta que se desbloquee.
adminApp.post("/conversations/:id/block", async (c) => {
  const id = c.req.param("id");
  const { ContactBlocksRepo } = await import("../db/contactBlocks");
  const db = new Db(c.env.DB);
  const conv = await new ConversationsRepo(db).getById(id);
  if (!conv) return c.html(await renderThreadLive(c.env, id));
  await new ContactBlocksRepo(db).block({
    channel: conv.channel,
    channelUserId: conv.channel_user_id,
    displayName: conv.display_name,
    reason: "panel",
    createdBy: "panel",
  });
  await audit(c, {
    action: "conversation.block",
    target: `conv:${id}`,
    targetLabel: `Conversación · ${channelLabel(conv.channel)}`,
  });
  return c.html(await renderThreadLive(c.env, id));
});

adminApp.post("/conversations/:id/unblock", async (c) => {
  const id = c.req.param("id");
  const { ContactBlocksRepo } = await import("../db/contactBlocks");
  const db = new Db(c.env.DB);
  const conv = await new ConversationsRepo(db).getById(id);
  if (!conv) return c.html(await renderThreadLive(c.env, id));
  await new ContactBlocksRepo(db).unblock(conv.channel, conv.channel_user_id);
  await audit(c, {
    action: "conversation.unblock",
    target: `conv:${id}`,
    targetLabel: `Conversación · ${channelLabel(conv.channel)}`,
  });
  return c.html(await renderThreadLive(c.env, id));
});

// Etiqueta de "atención humana" en una conversación: la pone/quita el dueño a
// mano (además de la marca automática del bot al escalar). Refresca el hilo.
adminApp.post("/conversations/:id/label", async (c) => {
  const id = c.req.param("id");
  const { ConversationLabelsRepo, NEEDS_HUMAN_LABEL } = await import("../db/conversationLabels");
  const form = await c.req.formData().catch(() => null);
  const label = String(form?.get("label") ?? NEEDS_HUMAN_LABEL).trim() || NEEDS_HUMAN_LABEL;
  const action = String(form?.get("action") ?? "add");
  const repo = new ConversationLabelsRepo(new Db(c.env.DB));
  if (action === "remove") await repo.remove(id, label);
  else await repo.add(id, label, "panel");
  await audit(c, {
    action: "conversation.label",
    target: `conv:${id}`,
    targetLabel: `Conversación ${id}`,
    afterVal: `${action === "remove" ? "quita" : "pone"} etiqueta ${label}`,
  });
  return c.html(await renderThreadLive(c.env, id));
});

// Return a paused conversation back to the bot. Clears paused_until AND appends
// an owner-authored summary of the human handoff to the message history, so the
// bot resumes with context about what the owner already resolved.
adminApp.post("/conversations/:id/resume", async (c) => {
  const id = c.req.param("id");
  const convs = new ConversationsRepo(new Db(c.env.DB));
  await convs.setPausedUntil(id, null);
  // Insert a system-style owner note summarizing the human handoff so the bot
  // has context when it picks the conversation back up. The summary field is
  // optional, so tolerate a request with no form body (formData() throws on an
  // empty/no-content-type body).
  //
  // Devolver el bot NO depende de mandar el formulario: la barra lo hace en el
  // PRIMER clic. El cuadro que se abre después es opcional —sirve para contarle
  // al bot algo que pasó fuera del chat— y se puede cerrar sin enviar nada.
  //
  // Por eso, cuando la petición viene de HTMX y sin nota se responde vacío:
  // redibujar el hilo cerraría ese cuadro a media frase.
  //
  // Y la nota se guarda SOLO si de verdad se escribió algo: antes se metía una
  // de oficio y en el chat aparecía un mensaje que nadie había escrito.
  const form = await c.req.formData().catch(() => null);
  const summary = String(form?.get("summary") ?? "").trim();
  if (summary) {
    const msgs = new MessagesRepo(new Db(c.env.DB));
    await msgs.append(id, "owner", summary);
  }
  await audit(c, {
    action: "conversation.resume",
    target: `conv:${id}`,
    targetLabel: `Conversación ${id}`,
    afterVal: summary ? `nota: ${summary.slice(0, 160)}` : undefined,
  });
  if (c.req.header("HX-Request") && !summary) return c.body(null, 204);
  return c.redirect(`/admin/conversations?c=${encodeURIComponent(id)}`);
});

// --- Co-pilot (HTMX-driven suggestion) --------------------------------------

/** Escape untrusted text (LLM output) before interpolating into an HTML fragment. */
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!),
  );
}

// "Suggest Reply": call Anthropic with the recent conversation history + the
// business context and return ONE short message the owner can copy/paste (or
// send manually via WhatsApp). It does NOT send anything to the customer — it
// only returns an HTML fragment for HTMX to swap into the suggestion area.
//
// Auth: already enforced by the wildcard `adminAuth` middleware above (cookie
// session or Basic Auth), so there is no per-route auth check here.
adminApp.post("/conversations/:id/suggest", async (c) => {
  const msgs = new MessagesRepo(new Db(c.env.DB));
  const history = await msgs.lastN(c.req.param("id"), 20);
  const { model } = createModel(c.env, "fast", await loadLlmOverrides(c.env));
  const aiMessages = history.map((m) => ({
    role: (m.role === "tool" ? "user" : m.role === "owner" ? "assistant" : m.role) as
      | "user"
      | "assistant",
    content: m.content,
  }));
  aiMessages.push({
    role: "user",
    content:
      "Eres asistente del dueño. Sugiere UN solo mensaje corto en español que el dueño podría enviar al cliente para resolver la última consulta. NO incluyas preámbulo, solo la frase a copy/paste.",
  });
  const sys = systemPromptFromEnv(c.env, [], renderBusinessContext());
  const result = await generateText({
    model,
    system: sys,
    messages: aiMessages,
  });
  // HTMX swaps this into #suggestion-box; the "Usar" button fills the composer.
  return c.html(renderSuggestionBox(result.text));
});

// --- Fallback ---------------------------------------------------------------

adminApp.notFound(async (c) => {
  const { t } = await panelI18n(c.env);
  return c.html(
    await layout({
      title: t("msg.notFoundTitle"),
      activeTab: "overview",
      body: `<p class='text-stone-500'>${t("msg.notFoundBody")}</p>`,
    }),
    404,
  );
});
