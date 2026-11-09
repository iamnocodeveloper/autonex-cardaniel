// Tab "Mi Agente" — la radiografía del chatbot, estilo canvas de n8n.
//
// Server-rendered: nodos posicionados en absoluto + conectores SVG, con DATOS
// REALES (canales desde D1, config efectiva, contadores de tools desde
// messages.tool_calls). El flujo es fijo (no editable): es una radiografía
// honesta de cómo funciona el bot, no un editor. Cada nodo es clickeable y
// carga su panel de configuración vía HTMX; el canvas se refresca solo cada
// 15 s para que el "pulso" de actividad esté vivo.
import type { Env } from "../../env";
import { Db } from "../../db/client";
import { SettingsRepo, SETTING_KEYS } from "../../db/settings";
import { resolveAgentConfig, type AgentConfig } from "../../settings-loader";
import { buildTools } from "../../tools";
import { resolveProvider, modelIdFor } from "../../llm/provider";
import { channelLabel, configuredChannels } from "../../channels/labels";
import { layout } from "./layout";
import { renderPromptInsertBar } from "./prompt-tokens";
import { panelI18n, type T, type MessageKey } from "../i18n";

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!),
  );
}

function ago(t: T, ms: number | null | undefined): string {
  if (!ms) return t("ag.ago.never");
  const min = Math.floor((Date.now() - ms) / 60_000);
  if (min < 1) return t("ag.ago.now");
  if (min < 60) return t("ag.ago.min", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("ag.ago.hour", { n: h });
  return t("ag.ago.day", { n: Math.floor(h / 24) });
}

/** A node lights up when it saw activity within this window. */
const LIVE_MS = 5 * 60_000;

// --- Friendly metadata --------------------------------------------------------

interface ToolMeta {
  label: string;
  desc: string;
  /** lucide icon name for the canvas node + modal header. */
  icon: string;
  /** Turning this off is a bad idea — the panel warns about it. */
  critical?: boolean;
}

const TOOL_META: Record<string, { labelKey: MessageKey; descKey: MessageKey; icon: string; critical?: boolean }> = {
  searchKb: { labelKey: "ag.tool.searchKb.label", descKey: "ag.tool.searchKb.desc", icon: "book-open", critical: true },
  handoffHuman: { labelKey: "ag.tool.handoffHuman.label", descKey: "ag.tool.handoffHuman.desc", icon: "user-round", critical: true },
  pauseBot: { labelKey: "ag.tool.pauseBot.label", descKey: "ag.tool.pauseBot.desc", icon: "pause" },
  snoozeUser: { labelKey: "ag.tool.snoozeUser.label", descKey: "ag.tool.snoozeUser.desc", icon: "shield" },
  captureLead: { labelKey: "ag.tool.captureLead.label", descKey: "ag.tool.captureLead.desc", icon: "user-plus" },
  scheduleAppointment: { labelKey: "ag.tool.scheduleAppointment.label", descKey: "ag.tool.scheduleAppointment.desc", icon: "calendar" },
  catalogQuery: { labelKey: "ag.tool.catalogQuery.label", descKey: "ag.tool.catalogQuery.desc", icon: "package" },
};

function toolMeta(t: T, name: string): ToolMeta {
  const m = TOOL_META[name];
  if (!m) return { label: name, desc: t("ag.tool.custom.desc"), icon: "wrench" };
  return { label: t(m.labelKey), desc: t(m.descKey), icon: m.icon, critical: m.critical };
}

/** lucide icon per channel id — falls back to a generic radio icon. */
const CHANNEL_ICON: Record<string, string> = {
  twilio: "message-circle",
  whatsapp: "message-circle",
  telegram: "send",
  // OJO: lucide eliminó los íconos de MARCA (instagram/facebook/etc.) — usar
  // solo íconos del core o salen cuadros vacíos en el canvas.
  instagram: "camera",
  messenger: "message-square",
  manychat: "zap",
};

function channelIcon(channel: string): string {
  return CHANNEL_ICON[channel] ?? "radio";
}

// --- Data ----------------------------------------------------------------------

interface ChannelRow {
  channel: string;
  convs: number;
  last: number | null;
}

interface ToolUsageRow {
  tool: string;
  n: number;
  last: number;
}

interface AgenteData {
  channels: ChannelRow[];
  turns30d: number;
  lastAssistantAt: number | null;
  toolNames: string[];
  usage: Map<string, ToolUsageRow>;
  cfg: AgentConfig;
  disabled: string[];
  settings: Record<string, string>;
}

async function loadAgenteData(env: Env): Promise<AgenteData> {
  const db = new Db(env.DB);
  const thirtyDays = Date.now() - 30 * 86_400_000;

  const channels = await db.all<ChannelRow>(
    `SELECT channel, COUNT(*) as convs, MAX(last_message_at) as last
     FROM conversations GROUP BY channel ORDER BY convs DESC`,
  );
  // Every channel with credentials configured appears in the canvas, even at
  // zero traffic — the owner must SEE what their bot is connected to.
  for (const cfg of await configuredChannels(env)) {
    if (!channels.some((c) => c.channel === cfg.id)) {
      channels.push({ channel: cfg.id, convs: 0, last: null });
    }
  }
  if (channels.length === 0) {
    channels.push({ channel: "twilio", convs: 0, last: null });
  }

  const turns30d =
    (
      await db.first<{ n: number }>(
        "SELECT COUNT(*) as n FROM messages WHERE role = 'assistant' AND created_at > ?",
        [thirtyDays],
      )
    )?.n ?? 0;

  const lastAssistantAt =
    (
      await db.first<{ t: number | null }>(
        "SELECT MAX(created_at) as t FROM messages WHERE role = 'assistant'",
      )
    )?.t ?? null;

  const usageRows = await db
    .all<ToolUsageRow>(
      `SELECT json_extract(value, '$.toolName') as tool,
              COUNT(*) as n,
              MAX(messages.created_at) as last
       FROM messages, json_each(messages.tool_calls)
       WHERE messages.tool_calls IS NOT NULL AND messages.created_at > ?
       GROUP BY tool`,
      [thirtyDays],
    )
    .catch(() => [] as ToolUsageRow[]);
  const usage = new Map(usageRows.filter((r) => r.tool).map((r) => [r.tool, r]));

  const toolNames = Object.keys(await buildTools({ env, getConversationId: () => null }));
  const cfg = await resolveAgentConfig(env, toolNames);
  const disabled = toolNames.filter((n) => !cfg.enabledToolNames.includes(n));
  const settings = await new SettingsRepo(db).all();

  return { channels, turns30d, lastAssistantAt, toolNames, usage, cfg, disabled, settings };
}

function modelLabel(env: Env, cfg: AgentConfig): string {
  const provider = resolveProvider(env);
  if (cfg.modelOverride === "haiku") return modelIdFor(env, provider, "fast");
  if (cfg.modelOverride === "sonnet") return modelIdFor(env, provider, "smart");
  return `auto · ${modelIdFor(env, provider, "fast")} ⇄ ${modelIdFor(env, provider, "smart")}`;
}

// --- Canvas --------------------------------------------------------------------

interface NodeSpec {
  id: string;
  x: number;
  y: number;
  w: number;
  icon: string;
  title: string;
  caption: string;
  /** CSS color value (var(--token)) for the icon box, border + count badge. */
  accent: string;
  live: boolean;
  count?: string;
  off?: boolean;
  big?: boolean;
  /** Canal con tráfico: borde+fondo+chip verdes, imposible no verlo. */
  on?: boolean;
}

function nodeHtml(t: T, n: NodeSpec): string {
  return `
  <div class="node-card absolute cursor-pointer"
       style="left:${n.x}px;top:${n.y}px;width:${n.w}px;padding:11px 13px;${
         n.on
           ? "background:var(--panel2);border:1px solid var(--ok);box-shadow:0 0 0 1px var(--accent-soft);"
           : "background:var(--panel2);border:1px solid var(--linelit);"
       }${n.off ? "opacity:.55;" : ""}"
       hx-get="/admin/agente/node/${encodeURIComponent(n.id)}" hx-target="#modal-root" hx-swap="innerHTML"
       title="${t("ag.node.configure")}">
    <div class="flex items-center gap-2">
      <span class="w-[22px] h-[22px] flex-none flex items-center justify-center" style="border:1px solid ${n.accent};background:${n.on ? "var(--ok-soft)" : "var(--panel2)"}">
        <i data-lucide="${n.icon}" width="13" height="13" style="color:${n.accent}"></i>
      </span>
      <span class="font-display font-semibold text-cream whitespace-nowrap overflow-hidden text-ellipsis" style="font-size:${n.big ? "14px" : "12.5px"}">${esc(n.title)}</span>
      ${n.off ? `<span class="ml-auto text-[8.5px] tracking-[.1em]" style="color:var(--dim);border:1px solid var(--linelit);padding:0 4px">OFF</span>` : ""}
      ${n.on ? `<span class="ml-auto text-[8.5px] tracking-[.1em] font-semibold" style="color:var(--ok);border:1px solid var(--ok);padding:0 4px;background:var(--ok-soft)">${t("ag.node.active")}</span>` : ""}
    </div>
    <div class="text-[10.5px] mt-1 leading-snug" style="color:var(--muted)">${n.caption}</div>
    ${n.count ? `<div class="text-[9.5px] mt-1.5" style="color:var(--accent)">${esc(n.count)}</div>` : ""}
    ${n.live ? `<span class="absolute -top-1.5 -right-1.5 w-[11px] h-[11px] rounded-full" style="background:var(--ok);border:2px solid var(--panel);animation:pulse 1.8s ease-in-out infinite"></span>` : ""}
  </div>`;
}

function bezier(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(30, (x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function bezierDown(x1: number, y1: number, x2: number, y2: number): string {
  const dy = Math.max(30, (y2 - y1) / 2);
  return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
}

export async function renderAgenteCanvas(env: Env): Promise<string> {
  const { t } = await panelI18n(env);
  const d = await loadAgenteData(env);
  const now = Date.now();

  // --- geometry ---
  const CH_X = 16, CH_W = 150, CH_H = 60, CH_STEP = 84, TOP = 36;
  const nCh = d.channels.length;
  const stackH = nCh * CH_STEP - (CH_STEP - CH_H);
  const midY = TOP + stackH / 2; // vertical center of the main flow

  const BUF = { x: 230, w: 150, h: 64 };
  const BRAIN = { x: 440, w: 200, h: 96 };
  const REPLY = { x: 760, w: 170, h: 64 };
  const row2Y = Math.max(midY + BRAIN.h / 2 + 66, 250);
  const row3Y = row2Y + 118;
  const TOOL_W = 140, TOOL_STEP = 155, TOOL_X0 = 25;

  const width = Math.max(960, TOOL_X0 + d.toolNames.length * TOOL_STEP + 20);
  const height = row3Y + 100;

  const nodes: NodeSpec[] = [];
  const paths: string[] = [];

  // flujo de mensajes = acento naranja cuando hay actividad, gris/café cuando no.
  const FLOW_ON = "var(--accent)";
  const FLOW_OFF = "var(--linelit)";
  // recursos del agente (model/memory/tools) = conector punteado gris.
  const RES_ON = "var(--muted)";
  const RES_OFF = "var(--linelit)";

  // Channels → Buffer
  d.channels.forEach((ch, i) => {
    const y = TOP + i * CH_STEP;
    const live = !!ch.last && now - ch.last < LIVE_MS;
    nodes.push({
      id: `channel:${ch.channel}`,
      x: CH_X, y, w: CH_W,
      icon: channelIcon(ch.channel),
      title: channelLabel(ch.channel),
      caption: ch.convs === 0
        ? t("ag.node.channel.configured")
        : ch.convs === 1
          ? t("ag.node.channel.convsOne", { n: ch.convs })
          : t("ag.node.channel.convsOther", { n: ch.convs }),
      accent: ch.convs === 0 ? "var(--dim)" : "var(--ok)",
      live,
      on: ch.convs > 0,
    });
    paths.push(
      `<path d="${bezier(CH_X + CH_W, y + CH_H / 2, BUF.x, midY)}" fill="none" stroke="${live ? FLOW_ON : FLOW_OFF}" stroke-width="2"/>`,
    );
  });

  const brainLive = !!d.lastAssistantAt && now - d.lastAssistantAt < LIVE_MS;

  nodes.push({
    id: "buffer",
    x: BUF.x, y: midY - BUF.h / 2, w: BUF.w,
    icon: "layers",
    title: "Buffer",
    caption: t("ag.node.buffer.caption", { s: Math.round(d.cfg.bufferMs / 1000) }),
    accent: "var(--accent)",
    live: false,
  });
  paths.push(
    `<path d="${bezier(BUF.x + BUF.w, midY, BRAIN.x, midY)}" fill="none" stroke="${brainLive ? FLOW_ON : FLOW_OFF}" stroke-width="2"/>`,
  );

  nodes.push({
    id: "brain",
    x: BRAIN.x, y: midY - BRAIN.h / 2, w: BRAIN.w,
    icon: "cpu",
    title: d.cfg.botPaused ? t("ag.node.brain.paused") : t("ag.node.brain.title"),
    caption: d.settings[SETTING_KEYS.systemPromptOverride]?.trim()
      ? t("ag.node.brain.captionCustom")
      : t("ag.node.brain.captionAuto"),
    accent: "var(--accent)",
    live: brainLive,
    count: t("ag.node.brain.turns", { n: d.turns30d }),
    big: true,
  });
  paths.push(
    `<path d="${bezier(BRAIN.x + BRAIN.w, midY, REPLY.x, midY)}" fill="none" stroke="${brainLive ? FLOW_ON : FLOW_OFF}" stroke-width="2"/>`,
  );

  nodes.push({
    id: "reply",
    x: REPLY.x, y: midY - REPLY.h / 2, w: REPLY.w,
    icon: "message-square-reply",
    title: t("ag.node.reply.title"),
    caption: t("ag.node.reply.caption", { chunks: d.cfg.maxChunks, delay: (d.cfg.interChunkDelayMs / 1000).toFixed(1) }),
    accent: "var(--ok)",
    live: false,
  });

  // Row 2: model + memory hang below the brain (n8n-style dotted resources)
  const modelNode = { x: BRAIN.x - 110, y: row2Y, w: 170 };
  const memNode = { x: BRAIN.x + 130, y: row2Y, w: 170 };
  nodes.push({
    id: "model",
    x: modelNode.x, y: modelNode.y, w: modelNode.w,
    icon: "brain-circuit",
    title: t("ag.node.model.title"),
    caption: esc(modelLabel(env, d.cfg)),
    accent: "var(--violet)",
    live: false,
  });
  nodes.push({
    id: "memory",
    x: memNode.x, y: memNode.y, w: memNode.w,
    icon: "database",
    title: t("ag.node.memory.title"),
    caption: t("ag.node.memory.caption"),
    accent: "var(--violet)",
    live: false,
  });
  const brainBottom = midY + BRAIN.h / 2;
  paths.push(
    `<path d="${bezierDown(BRAIN.x + 60, brainBottom, modelNode.x + modelNode.w / 2, row2Y)}" fill="none" stroke="${RES_ON}" stroke-width="1.5" stroke-dasharray="4 4"/>`,
    `<path d="${bezierDown(BRAIN.x + 140, brainBottom, memNode.x + memNode.w / 2, row2Y)}" fill="none" stroke="${RES_ON}" stroke-width="1.5" stroke-dasharray="4 4"/>`,
  );

  // Row 3: tools
  d.toolNames.forEach((name, i) => {
    const x = TOOL_X0 + i * TOOL_STEP;
    const u = d.usage.get(name);
    const off = d.disabled.includes(name);
    const live = !off && !!u?.last && now - u.last < LIVE_MS;
    nodes.push({
      id: `tool:${name}`,
      x, y: row3Y, w: TOOL_W,
      icon: toolMeta(t, name).icon,
      title: name,
      caption: off ? t("ag.node.tool.off") : t("ag.node.tool.calls", { n: u?.n ?? 0 }),
      accent: off ? "var(--dim)" : "var(--accent-2)",
      live,
      off,
    });
    const fanX = BRAIN.x + 30 + (i * (BRAIN.w - 60)) / Math.max(1, d.toolNames.length - 1);
    paths.push(
      `<path d="${bezierDown(fanX, brainBottom, x + TOOL_W / 2, row3Y)}" fill="none" stroke="${off ? RES_OFF : RES_ON}" stroke-width="1.5" stroke-dasharray="4 4"/>`,
    );
  });

  return `
  <div class="overflow-x-auto border border-line bg-panel">
    <div class="relative" style="min-width:${width}px;height:${height}px;background:radial-gradient(circle,var(--line) 1px,transparent 1px) 0 0/22px 22px">
      <svg class="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">${paths.join("")}</svg>
      ${nodes.map((n) => nodeHtml(t, n)).join("")}
    </div>
  </div>`;
}

// --- Page ---------------------------------------------------------------------

export async function renderAgentePage(env: Env): Promise<string> {
  const { t } = await panelI18n(env);
  const canvas = await renderAgenteCanvas(env);
  const body = `
    <div class="flex flex-col gap-3.5">
      <div class="flex flex-wrap items-center gap-3.5">
        <p class="text-[12px] max-w-[520px] leading-relaxed" style="color:var(--muted)">${t("ag.intro")}</p>
        <div class="ml-auto flex items-center gap-4 text-[10.5px]" style="color:var(--dim)">
          <span class="flex items-center gap-1.5"><span class="inline-block w-4 h-0.5 align-middle" style="background:var(--accent)"></span>${t("ag.legend.flow")}</span>
          <span class="flex items-center gap-1.5"><span class="inline-block w-4 align-middle" style="border-top:1.5px dashed var(--muted)"></span>${t("ag.legend.resources")}</span>
          <span class="flex items-center gap-1.5"><span class="inline-block w-2 h-2 rounded-full align-middle" style="background:var(--ok)"></span>${t("ag.legend.activity")}</span>
        </div>
      </div>
      <div id="canvas-wrap" hx-get="/admin/agente/canvas" hx-trigger="every 15s, canvas-refresh from:body" hx-swap="innerHTML">
        ${canvas}
      </div>
      <p class="text-[10.5px]" style="color:var(--dim)">${t("ag.footer")}</p>
    </div>`;
  return layout({ title: t("ag.title"), activeTab: "agente", body, env });
}

// --- Node modal (pop-up, editable) ---------------------------------------------

/** OOB fragment that drops a self-dismissing toast in #toast-root. */
export function toastOob(msg: string): string {
  return `<div id="toast-root" hx-swap-oob="innerHTML"><div class="toast text-[12.5px] px-4 py-2.5">${esc(msg)}</div></div>`;
}

function savedBanner(t: T): string {
  return `<div class="px-3 py-2 text-[12.5px] mb-4" style="border:1px solid var(--ok);background:var(--ok-soft);color:var(--ok)">${t("ag.saved.banner")}</div>`;
}

function modalShell(t: T, icon: string, title: string, badge: string, inner: string, saved = false): string {
  return `
  <div class="modal-backdrop" onclick="if(event.target===this)this.remove()">
    <div class="modal-card w-full max-w-lg max-h-[85vh] overflow-y-auto">
      <div class="flex items-center gap-2.5 sticky top-0 z-10" style="padding:16px 18px;border-bottom:1px solid var(--line);background:var(--panel)">
        <span class="w-[26px] h-[26px] flex-none flex items-center justify-center" style="border:1px solid var(--accent);background:var(--accent-soft)">
          <i data-lucide="${icon}" width="15" height="15" style="color:var(--accent)"></i>
        </span>
        <span class="font-display font-bold text-[15px] text-cream">${title}</span>${badge}
        <button type="button" aria-label="${t("ag.modal.close")}"
                class="ml-auto cursor-pointer" style="color:var(--dim)"
                onclick="document.getElementById('modal-root').innerHTML=''">
          <i data-lucide="x" width="18" height="18"></i>
        </button>
      </div>
      <div class="p-[18px]">${saved ? savedBanner(t) : ""}${inner}</div>
    </div>
  </div>`;
}

/** Range slider with a live value display next to the label. */
function slider(opts: {
  name: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  hint: string;
}): string {
  const outId = `${opts.name}-out`;
  return `
  <div class="mb-5">
    <div class="flex items-baseline justify-between mb-1.5">
      <label for="${opts.name}" class="text-[12.5px] text-cream">${esc(opts.label)}</label>
      <span class="text-[12.5px] font-mono font-semibold" style="color:var(--accent)"><output id="${outId}">${opts.value}</output>${esc(opts.unit)}</span>
    </div>
    <input type="range" id="${opts.name}" name="${opts.name}" min="${opts.min}" max="${opts.max}" step="${opts.step}" value="${opts.value}"
           class="w-full" oninput="document.getElementById('${outId}').textContent=this.value">
    <p class="text-[10.5px] mt-1.5" style="color:var(--dim)">${esc(opts.hint)}</p>
  </div>`;
}

function saveForm(t: T, nodeId: string, inner: string): string {
  return `
  <form hx-post="/admin/agente/node/${encodeURIComponent(nodeId)}/save" hx-target="#modal-root" hx-swap="innerHTML">
    ${inner}
    <button type="submit" class="bigbtn font-display font-bold text-[12.5px] cursor-pointer" style="background:var(--accent);border:1px solid var(--accent);color:var(--on-accent);box-shadow:var(--shadow);padding:8px 16px">${t("common.save")}</button>
  </form>`;
}

export async function renderNodeModal(env: Env, nodeId: string, saved = false): Promise<string> {
  const { t } = await panelI18n(env);
  const d = await loadAgenteData(env);

  if (nodeId === "buffer") {
    return modalShell(t, "layers", t("ag.modal.buffer.title"), "", saveForm(t, "buffer", `
      <p class="text-[12.5px] mb-4 leading-relaxed" style="color:var(--muted)">${t("ag.modal.buffer.desc")}</p>
      ${slider({
        name: "buffer_seconds", label: t("ag.modal.buffer.sliderLabel"),
        min: 3, max: 30, step: 1, value: Math.round(d.cfg.bufferMs / 1000), unit: " s",
        hint: t("ag.modal.buffer.sliderHint"),
      })}`), saved);
  }

  if (nodeId === "reply") {
    return modalShell(t, "message-square-reply", t("ag.modal.reply.title"), "", saveForm(t, "reply", `
      <p class="text-[12.5px] mb-4 leading-relaxed" style="color:var(--muted)">${t("ag.modal.reply.desc")}</p>
      ${slider({
        name: "max_chunks", label: t("ag.modal.reply.maxLabel"),
        min: 1, max: 5, step: 1, value: d.cfg.maxChunks, unit: "",
        hint: t("ag.modal.reply.maxHint"),
      })}
      ${slider({
        name: "inter_chunk_delay_s", label: t("ag.modal.reply.delayLabel"),
        min: 0, max: 5, step: 0.25, value: +(d.cfg.interChunkDelayMs / 1000).toFixed(2), unit: " s",
        hint: t("ag.modal.reply.delayHint"),
      })}`), saved);
  }

  if (nodeId === "model") {
    const current = d.cfg.modelOverride;
    const card = (value: string, icon: string, label: string, desc: string): string => `
      <label class="relative block cursor-pointer">
        <input type="radio" name="model_override" value="${value}" class="peer sr-only" ${current === value ? "checked" : ""}>
        <span class="cfgcard block h-full border border-line bg-panel2 p-3 transition peer-checked:border-accent peer-checked:bg-accent-soft">
          <i data-lucide="${icon}" width="18" height="18" class="text-muted"></i>
          <span class="block font-display font-semibold text-[12.5px] text-cream mt-1.5">${label}</span>
          <span class="block text-[10px] text-dim mt-1 leading-snug">${desc}</span>
        </span>
      </label>`;
    return modalShell(t, "brain-circuit", t("ag.modal.model.title"), "", saveForm(t, "model", `
      <p class="text-[12.5px] mb-3" style="color:var(--muted)">${t("ag.modal.model.desc")} <span class="font-mono text-[11px]" style="color:var(--dim)">${esc(modelLabel(env, d.cfg))}</span></p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5">
        ${card("auto", "scale", t("ag.modal.model.cardAutoLabel"), t("ag.modal.model.cardAutoDesc"))}
        ${card("haiku", "feather", t("ag.modal.model.cardFastLabel"), t("ag.modal.model.cardFastDesc"))}
        ${card("sonnet", "brain", t("ag.modal.model.cardSmartLabel"), t("ag.modal.model.cardSmartDesc"))}
      </div>
      ${slider({
        name: "temperature", label: t("ag.modal.model.tempLabel"),
        min: 0, max: 1, step: 0.05, value: d.cfg.temperature ?? 1, unit: "",
        hint: t("ag.modal.model.tempHint"),
      })}`), saved);
  }

  if (nodeId === "brain") {
    const hasOverride = !!d.settings[SETTING_KEYS.systemPromptOverride]?.trim();
    const badge = d.cfg.botPaused
      ? `<span class="text-[9.5px]" style="color:var(--dim);border:1px solid var(--linelit);padding:1px 8px">${t("ag.modal.brain.badgePaused")}</span>`
      : `<span class="text-[9.5px]" style="color:var(--ok);border:1px solid var(--ok);padding:1px 8px">${t("ag.modal.brain.badgeActive")}</span>`;
    return modalShell(t, "cpu", t("ag.modal.brain.title"), badge, `
      <div class="text-[12.5px] space-y-1 mb-4" style="color:var(--muted)">
        <div><b class="text-cream">${t("ag.modal.brain.modelLabel")}</b> <span class="font-mono text-[11px]">${esc(modelLabel(env, d.cfg))}</span></div>
        <div><b class="text-cream">${t("ag.modal.brain.turnsLabel")}</b> ${d.turns30d}</div>
        <div><b class="text-cream">${t("ag.modal.brain.toolsLabel")}</b> ${t("ag.modal.brain.toolsCount", { enabled: d.cfg.enabledToolNames.length, total: d.toolNames.length })}</div>
      </div>

      <form hx-post="/admin/agente/node/brain/save" hx-target="#modal-root" hx-swap="innerHTML" class="mb-5">
        <input type="hidden" name="bot_paused" value="${d.cfg.botPaused ? "0" : "1"}">
        <button type="submit" class="${d.cfg.botPaused ? "bigbtn font-display font-bold" : "ghostbtn"} text-[12.5px] cursor-pointer inline-flex items-center gap-2"
                style="${d.cfg.botPaused
                  ? "background:var(--accent);border:1px solid var(--accent);color:var(--on-accent);box-shadow:var(--shadow);padding:9px 16px"
                  : "background:var(--panel2);border:1px solid var(--line);color:var(--muted);padding:9px 16px"}">
          <i data-lucide="${d.cfg.botPaused ? "play" : "pause"}" width="14" height="14"></i>
          ${d.cfg.botPaused ? t("ag.modal.brain.resume") : t("ag.modal.brain.pause")}
        </button>
      </form>

      <form hx-post="/admin/agente/node/brain/save" hx-target="#modal-root" hx-swap="innerHTML" class="mb-5">
        <div class="flex items-center justify-between mb-1.5">
          <label for="custom_instructions" class="text-[12.5px] font-medium text-cream">${t("ag.modal.brain.instructions")}</label>
          <span class="text-[9.5px] tracking-[.05em]" style="color:var(--ok);border:1px solid var(--ok);padding:1px 7px">${t("ag.modal.brain.appended")}</span>
        </div>
        <p class="text-[11px] mb-2 leading-relaxed" style="color:var(--dim)">${t("ag.modal.brain.instructionsDesc")}${hasOverride
          ? ` <span style="color:var(--accent-2)">${t("ag.modal.brain.instructionsWarn")}</span>`
          : ""}</p>
        <textarea id="custom_instructions" name="custom_instructions" rows="4"
                  placeholder="${t("ag.modal.brain.instructionsPlaceholder")}"
                  class="w-full font-mono text-[11px] p-3 outline-none resize-y"
                  style="background:var(--bg);border:1px solid var(--line);color:var(--cream)">${esc(d.settings[SETTING_KEYS.customInstructions] ?? "")}</textarea>
        <button type="submit" class="ghostbtn text-[12.5px] cursor-pointer mt-2" style="background:var(--panel2);border:1px solid var(--line);color:var(--muted);padding:8px 16px">${t("ag.modal.brain.saveInstructions")}</button>
      </form>

      <form hx-post="/admin/agente/node/brain/save" hx-target="#modal-root" hx-swap="innerHTML">
        <div class="flex items-center justify-between mb-1.5">
          <label for="system_prompt_override" class="text-[12.5px] font-medium text-cream">${t("ag.modal.brain.promptLabel")}</label>
          <span class="text-[9.5px] tracking-[.05em]" style="color:${hasOverride ? "var(--accent-2)" : "var(--info)"};border:1px solid ${hasOverride ? "var(--accent-2)" : "var(--info)"};padding:1px 7px">${hasOverride ? t("ag.modal.brain.promptManual") : t("ag.modal.brain.promptAuto")}</span>
        </div>
        <p class="text-[11px] mb-2 leading-relaxed" style="color:var(--dim)">${t("ag.modal.brain.promptDesc")} ${hasOverride
          ? t("ag.modal.brain.promptModeManual")
          : t("ag.modal.brain.promptModeAuto")}</p>
        <textarea id="system_prompt_override" name="system_prompt_override" rows="14" required
                  class="w-full font-mono text-[11px] p-3 outline-none resize-y"
                  style="background:var(--bg);border:1px solid var(--line);color:var(--cream)">${esc(d.cfg.systemPrompt)}</textarea>
        <div class="mt-2">${renderPromptInsertBar(t, "system_prompt_override", d.cfg.enabledToolNames)}</div>
        <div class="flex flex-wrap gap-2 mt-3">
          <button type="submit" class="bigbtn font-display font-bold text-[12.5px] cursor-pointer" style="background:var(--accent);border:1px solid var(--accent);color:var(--on-accent);box-shadow:var(--shadow);padding:8px 16px">${t("ag.modal.brain.saveManual")}</button>
          ${hasOverride ? `<button type="submit" name="action" value="reset" formnovalidate class="ghostbtn text-[12.5px] cursor-pointer" style="background:var(--panel2);border:1px solid var(--line);color:var(--muted);padding:8px 16px">${t("ag.modal.brain.backToAuto")}</button>` : ""}
        </div>
      </form>`, saved);
  }

  if (nodeId === "memory") {
    return modalShell(t, "database", t("ag.node.memory.title"), "", `
      <p class="text-[12.5px] leading-relaxed" style="color:var(--muted)">${t("ag.modal.memory.desc")}</p>`);
  }

  if (nodeId.startsWith("channel:")) {
    const name = nodeId.slice("channel:".length);
    const ch = d.channels.find((c) => c.channel === name);
    if (!ch) return modalShell(t, "radio", t("ag.modal.channel.title"), "", `<p class="text-[12.5px]" style="color:var(--dim)">${t("ag.modal.channel.empty")}</p>`);
    return modalShell(t, channelIcon(ch.channel), t("ag.modal.channel.named", { name: esc(channelLabel(ch.channel)) }), "", `
      <div class="text-[12.5px] space-y-1 mb-3" style="color:var(--muted)">
        <div><b class="text-cream">${t("ag.modal.channel.convsLabel")}</b> ${ch.convs}</div>
        <div><b class="text-cream">${t("ag.modal.channel.lastLabel")}</b> ${ago(t, ch.last)}</div>
      </div>
      <a href="/admin/conversations" class="text-[12.5px] hover:underline">${t("ag.modal.channel.view")}</a>`);
  }

  if (nodeId.startsWith("tool:")) {
    const name = nodeId.slice("tool:".length);
    if (!d.toolNames.includes(name)) {
      return modalShell(t, "wrench", "Tool", "", `<p class="text-[12.5px]" style="color:var(--dim)">${t("ag.modal.tool.notFound")}</p>`);
    }
    const meta = toolMeta(t, name);
    const u = d.usage.get(name);
    const off = d.disabled.includes(name);
    return modalShell(
      t,
      meta.icon,
      `${esc(meta.label)} <span class="font-mono text-[11px]" style="color:var(--dim)">(${esc(name)})</span>`,
      off
        ? `<span class="text-[9.5px]" style="color:var(--dim);border:1px solid var(--linelit);padding:1px 8px">${t("ag.modal.tool.off")}</span>`
        : `<span class="text-[9.5px]" style="color:var(--ok);border:1px solid var(--ok);padding:1px 8px">${t("ag.modal.tool.on")}</span>`,
      `
      <p class="text-[12.5px] mb-2 leading-relaxed" style="color:var(--muted)">${esc(meta.desc)}</p>
      <div class="text-[12.5px] space-y-1 mb-3" style="color:var(--muted)">
        <div><b class="text-cream">${t("ag.modal.tool.callsLabel")}</b> ${u?.n ?? 0}</div>
        <div><b class="text-cream">${t("ag.modal.tool.lastLabel")}</b> ${ago(t, u?.last)}</div>
      </div>
      ${meta.critical && !off ? `<div class="text-[11px] mb-3.5 flex items-start gap-2 leading-relaxed" style="color:var(--accent-2);border:1px solid var(--warn);background:var(--warn-soft);padding:10px"><i data-lucide="triangle-alert" width="14" height="14" class="flex-none mt-0.5"></i> ${t("ag.modal.tool.criticalWarn")}</div>` : ""}
      <form hx-post="/admin/agente/tools/${encodeURIComponent(name)}/toggle" hx-target="#modal-root" hx-swap="innerHTML" class="inline">
        <button class="${off ? "bigbtn font-display font-bold" : "ghostbtn"} text-[12.5px] cursor-pointer"
                style="${off
                  ? "background:var(--accent);border:1px solid var(--accent);color:var(--on-accent);box-shadow:var(--shadow);padding:9px 16px"
                  : "background:var(--panel2);border:1px solid var(--line);color:var(--muted);padding:9px 16px"}">
          ${off ? t("ag.modal.tool.enable") : t("ag.modal.tool.disable")}
        </button>
      </form>
      <p class="text-[10.5px] mt-2" style="color:var(--dim)">${t("ag.modal.tool.applies")}</p>`, saved);
  }

  return modalShell(t, "box", t("ag.modal.unknown.title"), "", `<p class="text-[12.5px]" style="color:var(--dim)">${t("ag.modal.unknown.text")}</p>`);
}

/**
 * Flip a tool in/out of the disabled_tools setting. Unknown names are rejected
 * (returns false) so the route can't write garbage into settings.
 */
export async function toggleTool(env: Env, name: string): Promise<boolean> {
  const known = Object.keys(await buildTools({ env, getConversationId: () => null }));
  if (!known.includes(name)) return false;

  const repo = new SettingsRepo(new Db(env.DB));
  const raw = (await repo.get(SETTING_KEYS.disabledTools)) ?? "";
  const disabled = new Set(
    raw.split(",").map((s) => s.trim()).filter(Boolean),
  );
  if (disabled.has(name)) disabled.delete(name);
  else disabled.add(name);
  await repo.set(SETTING_KEYS.disabledTools, [...disabled].join(","));
  return true;
}
