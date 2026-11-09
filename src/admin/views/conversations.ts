// Bandeja de entrada (F1) — dos paneles estilo WhatsApp Web.
//
// Izquierda: lista de conversaciones (filtros + búsqueda), refrescada por HTMX
// cada 10 s. Derecha: el hilo seleccionado (?c=<id>) — cabecera de estado +
// mensajes, refrescado cada 5 s — y el composer para responder COMO HUMANO
// desde el dashboard (sale por el adapter del canal y pausa el bot).
//
// El hilo muestra lo que el bot HIZO, no solo lo que dijo: cada tool call es
// un chip, cada respuesta trae modelo + costo del turno.
//
// Truco de scroll: el contenedor de mensajes usa flex-col-reverse con los
// mensajes en orden DESC, así el scroll queda pegado abajo aun cuando el
// polling reemplaza el contenido.
import type { Env } from "../../env";
import { Db } from "../../db/client";
import { InsightsRepo } from "../../db/insights";
import { MessagesRepo, type MessageButton } from "../../db/messages";
import { ConversationLabelsRepo, loadLabelCatalog, labelMetaIn } from "../../db/conversationLabels";
import { QuotesRepo, type Quote } from "../../db/quotes";
import { SENTIMENT_BADGE } from "./insights";
import { costOfUsage, type ModelId } from "../../pricing";
import { channelLabel } from "../../channels/labels";
import { getNiche } from "../../niches";
import { layout } from "./layout";
import { fmtDateTime } from "../format";
import { panelI18n, makeT, type T } from "../i18n";
import { TELEGRAM_TOKEN_MASK } from "../../telegramFiles";

/** Tiempo relativo corto (ej. "hace 5 min", "hace 2 h", "hace 3 d"). */
function ago(t: T, ms: number | null | undefined): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return t("conv.agoNow");
  if (min < 60) return t("conv.agoMin", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("conv.agoHour", { n: h });
  const d = Math.floor(h / 24);
  return t("conv.agoDay", { n: d });
}

// Lead pill colors follow the design-system's own "Lead" example (accent) —
// see docs/design-system.md §3 Pill/badge.
function leadBadges(t: T): Record<string, { txt: string; color: string }> {
  return {
    new: { txt: t("conv.leadNew"), color: "var(--accent)" },
    contacted: { txt: t("conv.leadContacted"), color: "var(--info)" },
    sold: { txt: t("conv.leadSold"), color: "var(--ok)" },
    lost: { txt: t("conv.leadLost"), color: "var(--dim)" },
  };
}

// We reuse SENTIMENT_BADGE's `.txt` labels (insights.ts) but render inbox pills
// with inline token colors; both maps use the same semantics (frustrated→amber,
// angry→red) so the two views stay visually coherent.
const SENTIMENT_COLOR: Record<string, string> = {
  positive: "var(--ok)",
  neutral: "var(--dim)",
  frustrated: "var(--accent-2)",
  angry: "var(--bad)",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// Extensiones que se ofrecen para descargar en vez de solo abrir en una pestaña.
const DOWNLOADABLE_EXT = /\.(pdf|jpe?g|png|gif|webp|mp4|mov|mp3|wav|csv|xlsx?|docx?|zip)(?=[?#]|$)/i;

// [IMAGE_URL: ...] / [AUDIO_URL: ...] — marcadores que `agent.ts` deja en
// `messages.content` cuando el cliente manda una foto/audio (§ V Fase 2). Se
// quitan del texto visible y se convierten en una vista previa real.
const MEDIA_MARKER_RE = /\n?\[(IMAGE|AUDIO)_URL: (.+?)\]/g;

/** Separa el texto normal de las referencias de media que trae un mensaje. */
export function extractMedia(content: string): { text: string; images: string[]; audios: string[] } {
  const images: string[] = [];
  const audios: string[] = [];
  const text = content
    .replace(MEDIA_MARKER_RE, (_m, kind: string, ref: string) => {
      (kind === "IMAGE" ? images : audios).push(ref);
      return "";
    })
    .trim();
  return { text, images, audios };
}

/**
 * De la referencia guardada a un `src` seguro para el navegador. Telegram y
 * WAHA necesitan credenciales del servidor para volver a descargar el
 * archivo — pasan por el proxy de `src/admin/media.ts`, que nunca expone el
 * token/API key. El resto (WhatsApp Cloud ya firmado, Meta, Zernio) se sirve
 * directo: son CDNs del proveedor, sin credencial que proteger acá.
 */
export function mediaSrc(ref: string): string {
  if (ref.startsWith("waha:")) return `/admin/media/waha?u=${encodeURIComponent(ref.slice(5))}`;
  if (ref.includes(TELEGRAM_TOKEN_MASK)) return `/admin/media/telegram?u=${encodeURIComponent(ref)}`;
  return ref;
}

/**
 * Chips de los botones que se adjuntaron a una respuesta (§ V Fase 3). Los de
 * tipo `url` salen como link real (el dueño puede abrirlo); los `callback`
 * solo tienen sentido dentro del canal real (Telegram/Zernio), así que en el
 * panel se muestran informativos, no clicables.
 */
export function buttonChipHtml(buttons: MessageButton[], t: T = makeT("es")): string {
  if (!buttons.length) return "";
  const chips = buttons
    .map((b) =>
      b.kind === "url" && b.value
        ? `<a href="${escapeHtml(b.value)}" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:var(--accent-2);border:1px solid var(--linelit);background:var(--panel2);padding:4px 10px;border-radius:999px;text-decoration:none">${escapeHtml(b.label)} ↗</a>`
        : `<span title="${t("conv.quickReplyTitle")}" style="font-size:11px;color:var(--muted);border:1px dashed var(--linelit);background:var(--panel2);padding:4px 10px;border-radius:999px">${escapeHtml(b.label)}</span>`,
    )
    .join("");
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end">${chips}</div>`;
}

/** Miniaturas de imagen (click → abrir grande) + reproductores de audio. */
function mediaHtml(images: string[], audios: string[], t: T): string {
  if (images.length === 0 && audios.length === 0) return "";
  const imgs = images
    .map(
      (u) =>
        `<img src="${escapeHtml(mediaSrc(u))}" loading="lazy" alt="${t("conv.imageAlt")}" style="max-width:220px;max-height:220px;border-radius:8px;border:1px solid var(--line);cursor:pointer;display:block" onclick="window.open(this.src, '_blank')">`,
    )
    .join("");
  const auds = audios
    .map((u) => `<audio controls preload="metadata" style="max-width:260px" src="${escapeHtml(mediaSrc(u))}"></audio>`)
    .join("");
  return `<div style="display:flex;flex-direction:column;gap:6px">${imgs}${auds}</div>`;
}

/**
 * Envuelve URLs http(s) en `<a>` clicable (y `download` si termina en una
 * extensión conocida). Recibe texto YA escapado (`escapeHtml`) — el resultado
 * sigue siendo HTML seguro: solo agrega tags alrededor, nunca decodifica nada.
 */
export function linkify(escapedText: string): string {
  return escapedText.replace(/https?:\/\/[^\s<>]+/g, (match) => {
    // Puntuación de cierre de frase que casi nunca es parte de la URL.
    const trailMatch = match.match(/[.,;:!?)\]]+$/);
    const trail = trailMatch ? trailMatch[0] : "";
    const url = trail ? match.slice(0, -trail.length) : match;
    if (!url) return match;
    const downloadAttr = DOWNLOADABLE_EXT.test(url) ? " download" : "";
    return `<a href="${url}" target="_blank" rel="noopener noreferrer"${downloadAttr}>${url}</a>${trail}`;
  });
}

function modelShort(modelId: string): string {
  if (modelId.includes("haiku")) return "haiku";
  if (modelId.includes("sonnet")) return "sonnet";
  if (modelId.includes("opus")) return "opus";
  return modelId.length > 14 ? `${modelId.slice(0, 14)}…` : modelId;
}

function turnCost(m: {
  model_used: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
}): string {
  if (!m.model_used) return "";
  const cost = costOfUsage(m.model_used as ModelId, {
    input: m.input_tokens ?? 0,
    output: m.output_tokens ?? 0,
    cached: m.cached_input_tokens ?? 0,
  });
  return `$${cost.toFixed(cost < 0.01 ? 4 : 2)}`;
}

/** Short human summary of a tool call's input for the chip. */
function toolInputSummary(input: unknown): string {
  if (input && typeof input === "object") {
    const o = input as Record<string, unknown>;
    const pick = o.query ?? o.reason ?? o.summary ?? o.name ?? o.intent;
    if (typeof pick === "string") return pick;
    const json = JSON.stringify(o);
    return json.length > 42 ? `${json.slice(0, 42)}…` : json;
  }
  return String(input ?? "");
}

// Pill recipes (docs/design-system.md §3): text = border = the variant color.
const smallPill = (color: string) =>
  `font-size:9px;letter-spacing:.03em;color:${color};border:1px solid ${color};padding:1px 6px`;
const statusBadge = (color: string) =>
  `font-size:10px;letter-spacing:.03em;color:${color};border:1px solid ${color};padding:2px 8px`;

/** Two-letter avatar initials from a display name (or channel-id fallback). */
function initialsOf(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

/** WhatsApp gets info-blue, every other channel gets accent-2 amber — mirrors the mockup's WA/other split. */
function channelColor(channel: string): string {
  return channel === "twilio" || channel === "whatsapp" ? "var(--info)" : "var(--accent-2)";
}

interface InboxParams {
  search?: string;
  filter?: string;
  selectedId?: string;
  /** Filtro por canal (telegram | zernio | whatsapp | …). Vacío = todos. */
  channel?: string;
  /** Filtro por antigüedad del último mensaje: 1 | 7 | 30 días. 0/undefined = sin tope. */
  days?: number;
  /** Filtro por etiqueta (id del catálogo). Vacío = todas. */
  label?: string;
}

/** Lee los parámetros de la bandeja de una request (?q ?f ?c ?ch ?d ?label). */
export function inboxParamsFrom(q: (k: string) => string | undefined): InboxParams {
  const d = Number.parseInt(q("d") ?? "", 10);
  return {
    search: q("q") || undefined,
    filter: q("f") || undefined,
    selectedId: q("c") || undefined,
    channel: q("ch") || undefined,
    days: [1, 7, 30].includes(d) ? d : undefined,
    label: q("label") || undefined,
  };
}

/** Preserve the current filters/search when building inbox URLs. */
function inboxUrl(p: InboxParams, convId?: string): string {
  const qs = new URLSearchParams();
  if (convId) qs.set("c", convId);
  if (p.filter) qs.set("f", p.filter);
  if (p.search) qs.set("q", p.search);
  if (p.channel) qs.set("ch", p.channel);
  if (p.days) qs.set("d", String(p.days));
  if (p.label) qs.set("label", p.label);
  const s = qs.toString();
  return `/admin/conversations${s ? `?${s}` : ""}`;
}

// --- Left pane: conversation list --------------------------------------------

export async function renderInboxList(env: Env, p: InboxParams): Promise<string> {
  const { t } = await panelI18n(env);
  const leadBadge = leadBadges(t);
  const db = new Db(env.DB);
  const now = Date.now();

  const conds: string[] = [];
  const params: (string | number)[] = [];
  if (p.search) {
    // Nombre, id del canal, o el texto de cualquier mensaje del hilo.
    conds.push(
      "(c.display_name LIKE ? OR c.channel_user_id LIKE ? OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.content LIKE ?))",
    );
    params.push(`%${p.search}%`, `%${p.search}%`, `%${p.search}%`);
  }
  if (p.channel) {
    conds.push("c.channel = ?");
    params.push(p.channel);
  }
  if (p.days) {
    conds.push("c.last_message_at >= ?");
    params.push(now - p.days * 86_400_000);
  }
  if (p.label) {
    conds.push(
      "EXISTS (SELECT 1 FROM conversation_labels cl WHERE cl.conversation_id = c.id AND cl.label = ?)",
    );
    params.push(p.label);
  }
  if (p.filter === "leads") {
    conds.push("EXISTS (SELECT 1 FROM leads l WHERE l.conversation_id = c.id)");
  } else if (p.filter === "bloqueados") {
    conds.push(
      "EXISTS (SELECT 1 FROM contact_blocks b WHERE b.channel = c.channel AND b.channel_user_id = c.channel_user_id)",
    );
  } else if (p.filter === "atencion") {
    conds.push(
      "((c.paused_until IS NOT NULL AND c.paused_until > ?) OR EXISTS (SELECT 1 FROM tickets t WHERE t.conversation_id = c.id AND t.status != 'resolved'))",
    );
    params.push(now);
  } else if (p.filter === "molestos") {
    // Clasificación del Analista: revisar estas conversaciones = oro para mejorar.
    conds.push(
      "EXISTS (SELECT 1 FROM conversation_insights i WHERE i.conversation_id = c.id AND i.sentiment IN ('frustrated','angry'))",
    );
  } else if (p.filter === "contentos") {
    conds.push(
      "EXISTS (SELECT 1 FROM conversation_insights i WHERE i.conversation_id = c.id AND i.sentiment = 'positive')",
    );
  }
  const whereSql = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const rows = await db.all<any>(
    `SELECT c.*,
       (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_msg,
       (SELECT COUNT(*) FROM leads l WHERE l.conversation_id = c.id) as lead_count,
       (SELECT status FROM leads l WHERE l.conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as lead_status,
       (SELECT COUNT(*) FROM tickets t WHERE t.conversation_id = c.id AND t.status != 'resolved') as open_tickets,
       (SELECT COUNT(*) FROM conversation_labels cl WHERE cl.conversation_id = c.id AND cl.label = 'atencion_humana') as needs_human,
       (SELECT sentiment FROM conversation_insights i WHERE i.conversation_id = c.id) as ai_sentiment,
       (SELECT COUNT(*) FROM contact_blocks b WHERE b.channel = c.channel AND b.channel_user_id = c.channel_user_id) as is_blocked
     FROM conversations c
     ${whereSql}
     ORDER BY c.last_message_at DESC LIMIT 50`,
    params,
  );

  const [catalog, labelMap] = await Promise.all([
    loadLabelCatalog(env),
    new ConversationLabelsRepo(db)
      .byConversationIds(rows.map((r) => r.id))
      .catch(() => ({}) as Record<string, string[]>),
  ]);

  const items = rows
    .map((r) => {
      const paused = r.paused_until && r.paused_until > now;
      const blocked = r.is_blocked > 0;
      const badges: string[] = [];
      if (blocked) badges.push(`<span style="${smallPill("var(--bad)")}">${t("conv.blockedBadge")}</span>`);
      if (r.lead_count > 0) {
        const b = leadBadge[r.lead_status as string] ?? leadBadge.new;
        badges.push(`<span style="${smallPill(b.color)}">${b.txt}</span>`);
      }
      if (r.open_tickets > 0) badges.push(`<span style="${smallPill("var(--accent-2)")}">🔔</span>`);
      if (r.needs_human > 0) badges.push(`<span style="${smallPill("var(--bad)")}">${t("conv.needsHuman")}</span>`);
      // Etiquetas del usuario (además de la de sistema "atención humana").
      const rowLabels = (labelMap[r.id] ?? []).filter((l) => l !== "atencion_humana").slice(0, 3);
      for (const l of rowLabels) {
        const m = labelMetaIn(catalog, l);
        badges.push(`<span style="${smallPill(m.color)}">${escapeHtml(m.name)}</span>`);
      }
      if (paused && !blocked) badges.push(`<span style="${smallPill("var(--dim)")}">⏸</span>`);
      if (r.ai_sentiment === "frustrated" || r.ai_sentiment === "angry") {
        const s = SENTIMENT_BADGE[r.ai_sentiment as string];
        badges.push(`<span style="${smallPill(SENTIMENT_COLOR[r.ai_sentiment as string])}">${s.txt}</span>`);
      }
      const selected = r.id === p.selectedId;
      const name = escapeHtml(r.display_name ?? r.channel_user_id ?? "—");
      const preview = escapeHtml((r.last_msg ?? "").replace(/\s+/g, " ").slice(0, 60));
      const initials = initialsOf(r.display_name ?? r.channel_user_id ?? "?");
      const chanColor = channelColor(r.channel);

      return `
      <a href="${inboxUrl(p, r.id)}" class="convrow" style="display:flex;gap:11px;padding:12px 14px;border-bottom:1px solid var(--line);cursor:pointer;${selected ? "background:var(--panel2);border-left:2px solid var(--accent)" : "border-left:2px solid transparent"}">
        <div style="width:34px;height:34px;flex:none;background:var(--raise);border:1px solid var(--linelit);display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:700;color:var(--accent)">${initials}</div>
        <div style="min-width:0;flex:1">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:12.5px;font-weight:600;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;color:var(--cream)">${name}</span>
            <span style="font-size:9px;letter-spacing:.05em;color:${chanColor};border:1px solid ${chanColor};padding:0 5px;flex:none">${escapeHtml(channelLabel(r.channel))}</span>
            <span style="margin-left:auto;font-size:9.5px;color:var(--dim);white-space:nowrap">${ago(t, r.last_message_at)}</span>
          </div>
          <div style="font-size:11.5px;color:var(--muted);white-space:nowrap;text-overflow:ellipsis;overflow:hidden;margin-top:3px">${preview || "—"}</div>
          ${badges.length ? `<div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap">${badges.join("")}</div>` : ""}
        </div>
      </a>`;
    })
    .join("") ||
    `<div style="padding:32px 16px;text-align:center;font-size:12.5px;color:var(--dim)">${p.filter ? t("conv.noConvsFiltered") : t("conv.noConvs")}</div>`;

  return items;
}

// --- Right pane: live thread (header + messages, polled) ----------------------


/**
 * EL TELÉFONO DEL CLIENTE, SIEMPRE VISIBLE Y COPIABLE.
 *
 * En cuanto alguien le pone nombre a un contacto, el número desaparecía del
 * panel — y es lo ÚNICO con lo que el equipo puede contactar a esa persona
 * desde otro celular, o pasárselo a alguien que no tiene acceso al panel.
 *
 * Telegram no finge ser un teléfono: ahí se muestra el id tal cual, porque
 * escribir "+42" sería mentir.
 */
function esTelefono(canal: string | null | undefined): boolean {
  const c = (canal ?? "").toLowerCase();
  return c === "whatsapp" || c === "twilio" || c === "meta";
}

/** "51999888777" -> "+51 999 888 777": se lee, y se copia entero de un clic. */
function telefonoLegible(id: string): string {
  const d = (id ?? "").replace(/\D/g, "");
  if (d.length < 8) return id;
  return "+" + d.replace(/^(\d{1,3})(\d{3})(\d{3})(\d{3,})$/, "$1 $2 $3 $4");
}

function bloqueContacto(canal: string | null | undefined, idCanal: string, t: T): string {
  const tel = esTelefono(canal);
  const visible = tel ? telefonoLegible(idCanal) : idCanal;
  const crudo = tel ? "+" + (idCanal ?? "").replace(/\D/g, "") : idCanal;
  const enlace = tel
    ? `<a href="https://api.whatsapp.com/send?phone=${encodeURIComponent((idCanal ?? "").replace(/\D/g, ""))}" target="_blank" rel="noopener"
         title="${t("conv.openWhatsAppTitle")}" style="color:inherit;text-decoration:none;border-bottom:1px dotted currentColor">${escapeHtml(visible)}</a>`
    : escapeHtml(visible);
  return `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--dim)">
    ${enlace}
    <button type="button" title="${t("conv.copyTitle")}" aria-label="${t("conv.copyContactAria")}"
            onclick="navigator.clipboard.writeText('${crudo.replace(/'/g, "")}');this.textContent='✓';setTimeout(()=>this.textContent='⧉',1200)"
            style="background:none;border:none;color:inherit;cursor:pointer;font-size:11px;padding:0 2px;line-height:1">⧉</button>
  </span>`;
}

export async function renderThreadLive(env: Env, convId: string): Promise<string> {
  const { t } = await panelI18n(env);
  const db = new Db(env.DB);
  const conv = await db.first<any>("SELECT * FROM conversations WHERE id = ?", [convId]);
  if (!conv) return `<div style="padding:24px;font-size:12.5px;color:var(--dim)">${t("conv.notFound")}</div>`;

  const insight = await new InsightsRepo(db).getByConversation(convId);
  const msgs = await db.all<any>(
    "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 100",
    [convId],
  );
  // Botones adjuntos a las respuestas del bot (§ V Fase 3) — una sola pasada
  // para todo el hilo en vez de una consulta por mensaje.
  const buttonsByMsg = await new MessagesRepo(db).buttonsForMessages(msgs.map((m) => m.id));

  const now = Date.now();
  const paused = conv.paused_until && conv.paused_until > now;
  const blocked =
    ((await db.first<{ n: number }>(
      "SELECT COUNT(*) as n FROM contact_blocks WHERE channel = ? AND channel_user_id = ?",
      [conv.channel, conv.channel_user_id],
    ))?.n ?? 0) > 0;
  const openTicket =
    (await db.first<{ n: number }>(
      "SELECT COUNT(*) as n FROM tickets WHERE conversation_id = ? AND status != 'resolved'",
      [convId],
    ))?.n ?? 0;
  // Etiquetas de la conversación (catálogo del usuario + la de sistema
  // "atención humana"): chips con ✕ para quitar y un selector para añadir. El
  // endpoint /label es genérico (acepta cualquier id del catálogo).
  const [labelCatalog, assignedLabels] = await Promise.all([
    loadLabelCatalog(env),
    new ConversationLabelsRepo(db).forConversation(convId).catch(() => [] as string[]),
  ]);
  const labelChips = assignedLabels
    .map((l) => {
      const m = labelMetaIn(labelCatalog, l);
      const active = l === "atencion_humana";
      return `<form method="POST" action="/admin/conversations/${encodeURIComponent(convId)}/label" style="display:inline-flex">
        <input type="hidden" name="label" value="${escapeHtml(l)}">
        <input type="hidden" name="action" value="remove">
        <button type="submit" title="Quitar ${escapeHtml(m.name)}" style="font-size:11px;padding:5px 9px;cursor:pointer;border:1px solid ${
          active ? "var(--bad)" : m.color
        };color:${active ? "var(--bad)" : m.color};background:${active ? "var(--bad-soft)" : "var(--panel2)"}">${escapeHtml(
          m.name,
        )} ✕</button>
      </form>`;
    })
    .join("");
  const availableLabels = Object.values(labelCatalog).filter((m) => !assignedLabels.includes(m.id));
  const addLabelSelect = availableLabels.length
    ? `<form method="POST" action="/admin/conversations/${encodeURIComponent(convId)}/label" style="display:inline-flex">
        <input type="hidden" name="action" value="add">
        <select name="label" onchange="this.form.submit()" title="Añadir etiqueta" style="background:var(--panel2);border:1px dashed var(--linelit);color:var(--muted);font-size:11px;padding:5px 8px">
          <option value="">+ etiqueta</option>
          ${availableLabels.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join("")}
        </select>
      </form>`
    : "";
  const labelsBar = `<span style="display:inline-flex;flex-wrap:wrap;gap:5px;align-items:center">${labelChips}${addLabelSelect}</span>`;

  // Cotizaciones de esta conversación (nicho eventos y otros): tarjeta con el
  // borrador/enviada + botones Editar / Enviar-Reenviar / PDF.
  const quotes = await new QuotesRepo(db).byConversation(convId, 5).catch(() => [] as Quote[]);
  const quoteCard = quotes.length
    ? `<div style="display:flex;flex-direction:column;gap:6px;padding:10px 16px;border-bottom:1px solid var(--line);background:var(--panel2)">
        ${quotes
          .map(
            (q) => `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px">
          <span style="color:var(--accent)">📄</span>
          <span class="text-cream" style="font-weight:600">${escapeHtml(q.number ?? "Cotización")}</span>
          <span class="text-muted">${escapeHtml(q.client_name ?? "")}</span>
          <span class="text-cream">$${(Math.round(q.total * 100) / 100).toLocaleString("en-US")}</span>
          <span style="font-size:10px;color:${q.status === "accepted" ? "var(--ok)" : q.status === "draft" ? "var(--warn)" : "var(--info)"};border:1px solid currentColor;padding:1px 7px">${q.status === "draft" ? "Borrador" : q.status === "sent" ? "Enviada" : q.status === "accepted" ? "Aceptada" : q.status === "rejected" ? "Rechazada" : "Vencida"}</span>
          <a href="/admin/cotizaciones/${encodeURIComponent(q.id)}" class="text-accent" style="font-size:11px;text-decoration:none">Editar</a>
          <a href="/admin/cotizaciones/${encodeURIComponent(q.id)}/pdf" target="_blank" class="text-accent" style="font-size:11px;text-decoration:none">PDF ↗</a>
          <form method="POST" action="/admin/cotizaciones/${encodeURIComponent(q.id)}/send" style="display:inline">
            <button type="submit" style="font-size:11px;background:var(--ok);color:var(--on-accent);border:none;padding:4px 10px;cursor:pointer;border-radius:3px">${q.sent_count > 0 ? "Reenviar" : "Enviar"}</button>
          </form>
        </div>`,
          )
          .join("")}
      </div>`
    : "";

  // Header: identity + live state + takeover controls.
  const statusColor = blocked ? "var(--bad)" : paused ? "var(--accent-2)" : "var(--ok)";
  const statusPill = `<span style="${statusBadge(statusColor)}">${
    blocked ? t("conv.blocked") : paused ? t("conv.botPaused") : t("conv.botActive")
  }</span>`;

  // "NEUTRAL" NO SE MUESTRA. El analizador clasifica cómo quedó el cliente en
  // cuatro casillas, y "neutral" es la de "no detecté nada": es la enorme
  // mayoría de las conversaciones. Una etiqueta que sale casi siempre y no dice
  // nada solo roba sitio en la barra y le quita fuerza a las que sí importan.
  //
  // Sin etiqueta = todo normal. Cuando aparezca una, significa algo.
  // Las alertas del dueño no cambian: nunca dependieron de "neutral", y la
  // lista de conversaciones ya filtraba así (solo frustrated/angry).
  const sentBadge =
    insight?.sentiment &&
    insight.sentiment !== "neutral" &&
    SENTIMENT_BADGE[insight.sentiment]
      ? `<span style="${statusBadge(SENTIMENT_COLOR[insight.sentiment])}">${SENTIMENT_BADGE[insight.sentiment].txt}</span>`
      : "";

  const chipBtn = (action: string, label: string, color: string, confirm?: string) =>
    `<button hx-post="/admin/conversations/${encodeURIComponent(convId)}/${action}" hx-target="#thread-live" hx-swap="innerHTML"${
      confirm ? ` hx-confirm="${escapeHtml(confirm)}"` : ""
    } class="chip" style="font-size:11px;color:${color};background:var(--panel2);border:1px solid ${color};padding:6px 11px;cursor:pointer">${label}</button>`;

  const blockBtn = chipBtn("block", t("conv.block"), "var(--bad)", t("conv.blockConfirm"));
  const unblockBtn = chipBtn("unblock", t("conv.unblock"), "var(--ok)");
  const pauseForeverBtn = chipBtn("pause-forever", t("conv.pauseForever"), "var(--accent-2)");

  const controls = blocked
    ? `<div style="margin-left:auto;display:flex;gap:6px;align-items:center">${unblockBtn}</div>`
    : paused
      ? `
    <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
      <details style="position:relative">
        <summary class="chip"
                 hx-post="/admin/conversations/${encodeURIComponent(convId)}/resume"
                 hx-swap="none"
                 title="${t("conv.returnBotTitle")}"
                 style="cursor:pointer;list-style:none;font-size:11px;color:var(--accent-2);background:var(--panel2);border:1px solid var(--linelit);padding:6px 11px;display:inline-flex;align-items:center;gap:6px">${t("conv.returnBot")}</summary>
        <form method="POST" action="/admin/conversations/${encodeURIComponent(convId)}/resume"
              style="position:absolute;right:0;z-index:10;margin-top:8px;width:280px;background:var(--panel);border:1px solid var(--linelit);box-shadow:var(--shadow);padding:12px">
          <p style="font-size:11px;color:var(--muted);margin:0 0 8px">${t("conv.resumeHint")}</p>
          <textarea name="summary" rows="3" required placeholder="${t("conv.resumePlaceholder")}"
                    style="width:100%;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:8px 10px;font-size:12px;outline:none;resize:vertical;margin-bottom:8px"></textarea>
          <button class="bigbtn" style="width:100%;background:var(--accent);border:1px solid var(--accent);color:var(--on-accent);box-shadow:var(--shadow);padding:9px;font-size:12px;font-weight:700;font-family:'Sora';cursor:pointer">${t("conv.sendToBot")}</button>
        </form>
      </details>
      ${blockBtn}
    </div>`
      : `
    <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
      <button hx-post="/admin/conversations/${encodeURIComponent(convId)}/pause" hx-target="#thread-live" hx-swap="innerHTML"
              class="chip" style="font-size:11px;color:var(--muted);background:var(--panel2);border:1px solid var(--linelit);padding:6px 11px;cursor:pointer">
        ${t("conv.pauseBot")}
      </button>
      ${pauseForeverBtn}
      ${blockBtn}
    </div>`;

  // Nicho taxis: selector "Elegir conductor" en la cabecera del hilo. Al elegir,
  // se asigna el viaje (o se crea si no existe) y se le avisa al cliente.
  let taxiControls = "";
  if (getNiche(env).hooks?.taxiEngine) {
    try {
      const { TaxiDriversRepo, TaxiTripsRepo } = await import("../../db/taxi");
      const drivers = (await new TaxiDriversRepo(db).list()).filter((d) => d.active === 1);
      const trip = await new TaxiTripsRepo(db).activeForConversation(convId);
      const options = drivers
        .map((d) => {
          const l = [d.name ?? t("conv.driverNoName"), d.code, d.plate].filter(Boolean).join(" · ");
          return `<option value="${d.id}"${trip?.driver_id === d.id ? " selected" : ""}>${escapeHtml(l)}</option>`;
        })
        .join("");
      taxiControls = `<form hx-post="/admin/conversations/${encodeURIComponent(convId)}/assign-driver" hx-target="#thread-live" hx-swap="innerHTML" style="display:inline-flex;align-items:center;gap:6px">
        <select name="driver_id" required title="${t("conv.assignDriverTitle")}"
                style="background:var(--bg);border:1px solid var(--linelit);color:var(--cream);padding:6px 9px;font-size:11.5px;max-width:190px">
          <option value="">${t("conv.chooseDriver")}</option>
          ${options}
        </select>
        <button class="chip" type="submit" style="cursor:pointer;font-size:11px;color:var(--accent-2);background:var(--panel2);border:1px solid var(--linelit);padding:6px 11px">${t("conv.assignTaxi")}</button>
      </form>`;
    } catch {
      // Sin repos de taxis (instalación vieja) → sin selector.
    }
  }

  const header = `
  <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--panel)">
    <span style="font-family:'Sora';font-weight:600;font-size:14px;color:var(--cream)">${escapeHtml(conv.display_name || t("conv.noName"))}</span>
    ${bloqueContacto(conv.channel, conv.channel_user_id, t)}
    <span style="${smallPill("var(--info)")}">${escapeHtml(channelLabel(conv.channel))}</span>
    ${statusPill}
    ${sentBadge}
    ${openTicket > 0 ? `<span style="${statusBadge("var(--accent-2)")}">${t("conv.ticketOpen")}</span>` : ""}
    ${labelsBar}
    ${taxiControls}
    ${controls}
  </div>`;

  // Messages, DESC in the DOM + column-reverse = pinned to bottom.
  const bubbles = msgs
    .map((m) => {
      const time = fmtDateTime(m.created_at, {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      });

      // Tool chips (what the bot DID this turn) render above the bubble; in a
      // reversed column that means AFTER it in the DOM.
      let chips = "";
      if (m.tool_calls) {
        try {
          const calls = JSON.parse(m.tool_calls) as { toolName: string; input?: unknown }[];
          chips = calls
            .map(
              (tc) => `
            <div style="align-self:flex-end;display:inline-flex;align-items:center;gap:6px;font-size:10.5px;color:var(--dim);border:1px dashed var(--linelit);padding:3px 10px;margin-bottom:2px">→ <span style="color:var(--accent);font-weight:600">${escapeHtml(tc.toolName ?? "?")}</span> «${escapeHtml(toolInputSummary(tc.input))}»</div>`,
            )
            .join("");
        } catch { /* legacy/malformed tool_calls JSON — skip chips */ }
      }

      if (m.role === "user") {
        const { text, images, audios } = extractMedia(m.content);
        return `
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;max-width:78%">
          ${mediaHtml(images, audios, t)}
          <div style="background:var(--panel2);border:1px solid var(--line);padding:9px 13px;font-size:12.5px;line-height:1.5;white-space:pre-wrap;color:var(--cream)">${linkify(escapeHtml(text))}</div>
          <span style="font-size:9.5px;color:var(--dim)">${time}</span>
        </div>`;
      }

      const isOwner = m.role === "owner";
      const cost = turnCost(m);
      const meta = isOwner
        ? `${t("conv.you")} · ${time}`
        : [m.model_used ? modelShort(m.model_used) : null, cost || null, time].filter(Boolean).join(" · ");
      const bubbleBg = isOwner
        ? "background:var(--warn-soft);border:1px solid var(--warn)"
        : "background:var(--accent-soft);border:1px solid var(--linelit)";
      return `
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;max-width:78%;margin-left:auto">
        ${chips}
        <div style="${bubbleBg};padding:9px 13px;font-size:12.5px;line-height:1.5;white-space:pre-wrap;color:var(--cream)">${linkify(escapeHtml(m.content))}</div>
        ${buttonChipHtml(buttonsByMsg.get(m.id) ?? [], t)}
        <span style="font-size:9.5px;color:var(--dim)">${meta}</span>
      </div>`;
    })
    .join("");

  return `
  ${header}
  ${quoteCard}
  <div id="msgscroll" style="flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column-reverse;gap:12px;padding:16px;background:var(--bg)">
    ${bubbles || `<div style="text-align:center;font-size:12.5px;color:var(--dim);padding:32px 0">${t("conv.noMessages")}</div>`}
  </div>`;
}

// --- Composer (static per selection — NOT inside the polled fragment) ---------

function renderComposer(convId: string, t: T): string {
  const id = encodeURIComponent(convId);
  return `
  <div class="composer" style="border-top:1px solid var(--line);background:var(--panel);padding:12px;padding-bottom:max(12px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:8px">
    <div id="suggestion-box"></div>
    <form hx-post="/admin/conversations/${id}/reply" hx-target="#send-status" hx-swap="innerHTML"
          hx-on::after-request="if(event.detail.xhr.getResponseHeader('X-Sent')==='1')this.reset()"
          style="display:flex;align-items:flex-end;gap:9px">
      <textarea name="text" id="reply-text" rows="2" required
                placeholder="${t("conv.replyPlaceholder")}"
                style="flex:1;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;resize:none;outline:none"></textarea>
      <button type="button" hx-post="/admin/conversations/${id}/suggest" hx-target="#suggestion-box" hx-swap="innerHTML"
              class="chip" style="background:var(--panel2);border:1px solid var(--linelit);color:var(--accent-2);padding:11px 13px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:6px" title="${t("conv.suggestTitle")}">
        <i data-lucide="sparkles" width="13" height="13"></i> ${t("conv.suggest")}
      </button>
      <button type="submit" class="bigbtn" style="background:var(--accent);border:1px solid var(--accent);color:var(--on-accent);box-shadow:var(--shadow);padding:11px 18px;font-size:12.5px;font-weight:700;font-family:'Sora';cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:6px">
        ${t("conv.send")} <i data-lucide="send" width="14" height="14"></i>
      </button>
    </form>
    <div id="send-status" style="font-size:11px;min-height:1rem;color:var(--muted)"></div>
  </div>`;
}

/** Fragment returned by /suggest — suggestion + a "use it" button that fills the textarea. */
export function renderSuggestionBox(text: string, t: T = makeT("es")): string {
  return `
  <div style="border:1px solid var(--accent-2);background:var(--warn-soft);padding:10px 12px;font-size:12.5px;display:flex;align-items:flex-start;gap:10px">
    <div style="flex:1">
      <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent-2);margin-bottom:3px">${t("conv.copilotSuggestion")}</div>
      <div class="sugg-text" style="white-space:pre-wrap;color:var(--cream)">${escapeHtml(text)}</div>
    </div>
    <button type="button"
            onclick="document.getElementById('reply-text').value=this.parentElement.querySelector('.sugg-text').textContent;document.getElementById('suggestion-box').innerHTML=''"
            class="chip" style="font-size:11px;background:var(--accent-2);color:var(--on-accent);font-weight:700;border:1px solid var(--accent-2);padding:5px 10px;white-space:nowrap;cursor:pointer">${t("conv.use")}</button>
  </div>`;
}

// --- Full page -----------------------------------------------------------------

export async function renderInbox(env: Env, p: InboxParams): Promise<string> {
  const { t } = await panelI18n(env);
  const db = new Db(env.DB);
  const now = Date.now();

  const totalConvs = (await db.first<{ n: number }>("SELECT COUNT(*) as n FROM conversations"))?.n ?? 0;
  const totalLeads = (await db.first<{ n: number }>("SELECT COUNT(*) as n FROM leads"))?.n ?? 0;
  const nMolestos =
    (await db.first<{ n: number }>(
      "SELECT COUNT(*) as n FROM conversation_insights WHERE sentiment IN ('frustrated','angry')",
    ))?.n ?? 0;
  const nContentos =
    (await db.first<{ n: number }>(
      "SELECT COUNT(*) as n FROM conversation_insights WHERE sentiment = 'positive'",
    ))?.n ?? 0;
  const needAttention =
    (await db.first<{ n: number }>(
      `SELECT COUNT(*) as n FROM conversations c
       WHERE (c.paused_until IS NOT NULL AND c.paused_until > ?)
          OR EXISTS (SELECT 1 FROM tickets t WHERE t.conversation_id = c.id AND t.status != 'resolved')`,
      [now],
    ))?.n ?? 0;
  const nBlocked =
    (await db.first<{ n: number }>("SELECT COUNT(*) as n FROM contact_blocks"))?.n ?? 0;

  const filterPill = (href: string, label: string, active: boolean, color: string) =>
    `<a href="${href}" class="chip" style="font-size:11px;letter-spacing:.05em;padding:5px 12px;white-space:nowrap;border:1px solid ${color};${
      active ? `background:${color};color:var(--on-accent);font-weight:700` : `color:${color}`
    }">${label}</a>`;
  // Los pills conservan canal + fecha + búsqueda; solo cambian el filtro rápido.
  const pillUrl = (f?: string) => inboxUrl({ ...p, filter: f }, p.selectedId);
  const dayUrl = (d?: number) => inboxUrl({ ...p, days: d }, p.selectedId);

  // Canales presentes (para el selector). DISTINCT sobre lo que hay.
  const chanRows = await db.all<{ channel: string }>(
    "SELECT DISTINCT channel FROM conversations WHERE channel IS NOT NULL AND channel != '' ORDER BY channel",
  );
  // Etiquetas del catálogo (para el filtro por etiqueta).
  const labelCatalog = await loadLabelCatalog(env).catch(() => ({}));
  const labelOptions = Object.values(labelCatalog);
  const dayChip = (label: string, d?: number) =>
    filterPill(dayUrl(d), label, (p.days ?? 0) === (d ?? 0), "var(--linelit)");

  const list = await renderInboxList(env, p);

  const pollParams = new URLSearchParams();
  if (p.filter) pollParams.set("f", p.filter);
  if (p.search) pollParams.set("q", p.search);
  if (p.selectedId) pollParams.set("c", p.selectedId);
  if (p.channel) pollParams.set("ch", p.channel);
  if (p.days) pollParams.set("d", String(p.days));
  if (p.label) pollParams.set("label", p.label);
  const listPollUrl = `/admin/conversations/list-fragment?${pollParams.toString()}`;

  let rightPane: string;
  if (p.selectedId) {
    const thread = await renderThreadLive(env, p.selectedId);
    rightPane = `
      <div id="thread-live" class="flex flex-col flex-1 min-h-0"
           hx-get="/admin/conversations/thread/${encodeURIComponent(p.selectedId)}"
           hx-trigger="every 5s[window.puedeRefrescar('msgscroll')]" hx-swap="innerHTML">
        ${thread}
      </div>
      ${renderComposer(p.selectedId, t)}`;
  } else {
    rightPane = `
      <div class="flex-1 flex items-center justify-center" style="font-size:12.5px;color:var(--dim);background:var(--bg)">
        ${t("conv.selectPrompt")}
      </div>`;
  }

  const body = `
   <div class="inbox" data-view="${p.selectedId ? "thread" : "list"}">
    <div class="inbox-filters flex flex-wrap items-center gap-2" style="margin-bottom:10px">
      ${filterPill(pillUrl(), `${t("conv.filterAll")} · ${totalConvs}`, !p.filter, "var(--accent)")}
      ${filterPill(pillUrl("leads"), `${t("conv.filterLeads")} · ${totalLeads}`, p.filter === "leads", "var(--accent)")}
      ${filterPill(pillUrl("atencion"), `${t("conv.filterAttention")} · ${needAttention}`, p.filter === "atencion", "var(--bad)")}
      ${filterPill(pillUrl("bloqueados"), `${t("conv.filterBlocked")} · ${nBlocked}`, p.filter === "bloqueados", "var(--bad)")}
      ${filterPill(pillUrl("molestos"), `${t("conv.filterAngry")} · ${nMolestos}`, p.filter === "molestos", "var(--bad)")}
      ${filterPill(pillUrl("contentos"), `${t("conv.filterHappy")} · ${nContentos}`, p.filter === "contentos", "var(--ok)")}
      <form method="GET" action="/admin/conversations" class="ml-auto" style="display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line);padding:7px 12px;min-width:200px">
        <i data-lucide="search" width="14" height="14" style="color:var(--dim)"></i>
        ${p.filter ? `<input type="hidden" name="f" value="${escapeHtml(p.filter)}">` : ""}
        ${p.selectedId ? `<input type="hidden" name="c" value="${escapeHtml(p.selectedId)}">` : ""}
        ${p.channel ? `<input type="hidden" name="ch" value="${escapeHtml(p.channel)}">` : ""}
        ${p.days ? `<input type="hidden" name="d" value="${p.days}">` : ""}
        ${p.label ? `<input type="hidden" name="label" value="${escapeHtml(p.label)}">` : ""}
        <input name="q" value="${escapeHtml(p.search ?? "")}" placeholder="${t("conv.searchPlaceholder")}"
               style="flex:1;background:transparent;border:none;color:var(--cream);font-size:12px;outline:none">
      </form>
    </div>
    ${
      chanRows.length > 1
        ? `<div class="inbox-filters flex flex-wrap items-center gap-2" style="margin-bottom:14px">
      <select onchange="if(this.value)window.location=this.value" style="background:var(--panel);border:1px solid var(--line);color:var(--cream);font-size:11.5px;padding:6px 10px;outline:none">
        <option value="${escapeHtml(inboxUrl({ ...p, channel: undefined }, p.selectedId))}" ${p.channel ? "" : "selected"}>${t("conv.allChannels")}</option>
        ${chanRows
          .map(
            (r) =>
              `<option value="${escapeHtml(inboxUrl({ ...p, channel: r.channel }, p.selectedId))}" ${p.channel === r.channel ? "selected" : ""}>${escapeHtml(channelLabel(r.channel))}</option>`,
          )
          .join("")}
      </select>
      ${dayChip(t("conv.anyDate"))}
      ${dayChip(t("conv.day24"), 1)}
      ${dayChip(t("conv.day7"), 7)}
      ${dayChip(t("conv.day30"), 30)}
      ${p.channel || p.days || p.search ? `<a href="${inboxUrl({ selectedId: p.selectedId })}" class="chip" style="font-size:11px;padding:5px 10px;color:var(--dim);border:1px solid var(--line)">${t("conv.clear")}</a>` : ""}
    </div>`
        : `<div class="inbox-filters flex flex-wrap items-center gap-2" style="margin-bottom:14px">
      ${dayChip(t("conv.anyDate"))}${dayChip(t("conv.day24"), 1)}${dayChip(t("conv.day7"), 7)}${dayChip(t("conv.day30"), 30)}
      ${p.days || p.search ? `<a href="${inboxUrl({ selectedId: p.selectedId })}" class="chip" style="font-size:11px;padding:5px 10px;color:var(--dim);border:1px solid var(--line)">${t("conv.clear")}</a>` : ""}
    </div>`
    }
    ${
      labelOptions.length
        ? `<div class="inbox-filters flex flex-wrap items-center gap-2" style="margin-bottom:14px">
      <select onchange="if(this.value)window.location=this.value" title="Filtrar por etiqueta" style="background:var(--panel);border:1px solid var(--line);color:var(--cream);font-size:11.5px;padding:6px 10px;outline:none">
        <option value="${escapeHtml(inboxUrl({ ...p, label: undefined }, p.selectedId))}" ${p.label ? "" : "selected"}>Todas las etiquetas</option>
        ${labelOptions
          .map(
            (m) =>
              `<option value="${escapeHtml(inboxUrl({ ...p, label: m.id }, p.selectedId))}" ${p.label === m.id ? "selected" : ""}>${escapeHtml(m.name)}</option>`,
          )
          .join("")}
      </select>
    </div>`
        : ""
    }

    <div class="inbox-grid grid grid-cols-1 md:grid-cols-[320px_1fr] overflow-hidden" style="border:1px solid var(--line);background:var(--panel);height:calc(100vh - 200px);min-height:480px">
      <div class="inbox-list border-r border-line flex flex-col" style="min-height:0">
        <div id="conv-list" class="overflow-y-auto flex-1"
             hx-get="${listPollUrl}" hx-trigger="every 10s[window.puedeRefrescar('conv-list')]" hx-swap="innerHTML">
          ${list}
        </div>
      </div>
      <div class="inbox-pane flex flex-col" style="min-height:0;background:var(--bg)">
        ${
          p.selectedId
            ? `<a href="${inboxUrl({ filter: p.filter, search: p.search })}" class="inbox-back" style="align-items:center;gap:7px;padding:11px 14px;border-bottom:1px solid var(--line);background:var(--panel);font-size:12.5px;font-weight:600;color:var(--accent)"><i data-lucide="arrow-left" width="15" height="15"></i> ${t("conv.title")}</a>`
            : ""
        }
        ${rightPane}
      </div>
    </div>
   </div>`;

  return layout({ title: t("conv.title"), activeTab: "conversations", body, env });
}
