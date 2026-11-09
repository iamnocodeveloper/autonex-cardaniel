// Pro dashboard "Config" tab — a VISUAL CONTROL PANEL for a non-technical owner
// (e.g. a barbershop owner). No raw numbers, no "pick 1-10": every technical
// setting is a group of 2-3 selectable cards (radio + inline SVG icon + short
// label + one-line plain-Spanish description). Text settings are plain inputs /
// textareas with clear labels (no jargon). The form POSTs to /admin/config.
import type { Env } from "../../env";
import { SETTING_KEYS } from "../../db/settings";
import { renderBusinessContext } from "../../businessContext";
import { renderPromptInsertBar } from "./prompt-tokens";
import { CURATED_MODELS } from "../../llm/provider";
import { COMMON_TIMEZONES, DEFAULT_BUSINESS_TZ } from "../../timezone";
import {
  CONTROL_LIST,
  valueToLevel,
  type ControlDef,
} from "../control-levels";
import { layout } from "./layout";
import { panelI18n, type T } from "../i18n";
import { renderScrapeProviders } from "./scrapeProviders";

/** Escape untrusted text before interpolating it into an HTML attribute/body. */
function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!),
  );
}

// Brand accent = --accent (Kooni 2026 theme). The selected card
// lights up accent; the hidden radio drives the highlight via Tailwind's `peer`
// utilities so the whole card is clickable (it's a <label>).
const CARD_BASE =
  "peer-checked:border-accent peer-checked:bg-accent-soft " +
  "peer-checked:[&_.card-icon]:text-accent peer-checked:[&_.card-label]:text-accent " +
  "cfgcard flex flex-col gap-1 h-full border border-line bg-panel2 p-4 cursor-pointer";

/** Render one card group (radio cards) for a level-based control. */
function renderCardGroup(control: ControlDef, settings: Record<string, string>, t: T): string {
  const currentLevel = valueToLevel(control.key, settings[control.key]);
  const cards = control.options
    .map((opt) => {
      const id = `${control.key}__${opt.value}`;
      const checked = opt.label === currentLevel ? "checked" : "";
      return `
        <div class="relative">
          <input type="radio" id="${esc(id)}" name="${esc(control.key)}" value="${esc(opt.value)}"
                 class="peer sr-only absolute" ${checked}>
          <label for="${esc(id)}" class="${CARD_BASE}">
            <span class="card-icon text-dim">${opt.svg}</span>
            <span class="card-label font-display font-semibold text-[12.5px] text-cream">${esc(t(opt.labelKey!))}</span>
            <span class="text-dim text-[11px] leading-snug">${esc(t(opt.descKey!))}</span>
          </label>
        </div>`;
    })
    .join("");
  return `
    <fieldset style="display:flex;flex-direction:column;gap:8px">
      <legend class="font-display font-semibold text-[13.5px] text-cream">${esc(t(control.titleKey!))}</legend>
      <p class="text-muted text-[12px]">${esc(t(control.helpKey!))}</p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">${cards}</div>
    </fieldset>`;
}

const INPUT_STYLE =
  "background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none;width:100%";

/** Render a labeled single-line text field. */
function renderTextField(opts: {
  name: string;
  label: string;
  help: string;
  value: string;
  placeholder?: string;
}): string {
  return `
    <div style="display:flex;flex-direction:column;gap:6px">
      <label for="${esc(opts.name)}" class="font-display font-semibold text-[12.5px] text-cream">${esc(opts.label)}</label>
      <p class="text-dim text-[11px]">${esc(opts.help)}</p>
      <input type="text" id="${esc(opts.name)}" name="${esc(opts.name)}"
             value="${esc(opts.value)}" placeholder="${esc(opts.placeholder ?? "")}"
             style="${INPUT_STYLE}">
    </div>`;
}

/** Render a labeled multi-line textarea. `extra` se inserta tras el textarea
 *  (p. ej. la barra de etiquetas del prompt manual). */
function renderTextArea(opts: {
  name: string;
  label: string;
  help: string;
  value: string;
  placeholder?: string;
  rows?: number;
  extra?: string;
}): string {
  return `
    <div style="display:flex;flex-direction:column;gap:6px">
      <label for="${esc(opts.name)}" class="font-display font-semibold text-[12.5px] text-cream">${esc(opts.label)}</label>
      <p class="text-dim text-[11px]">${esc(opts.help)}</p>
      <textarea id="${esc(opts.name)}" name="${esc(opts.name)}" rows="${opts.rows ?? 4}"
                placeholder="${esc(opts.placeholder ?? "")}"
                style="${INPUT_STYLE};resize:vertical">${esc(opts.value)}</textarea>
      ${opts.extra ?? ""}
    </div>`;
}

const SELECT_STYLE =
  "background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none;width:100%";

/**
 * Sección "Scraping (Decodo)": la API key que usa Web Sync / inventario. Se
 * guarda en settings (D1) y, si está vacía, cae al secret del worker. Nunca se
 * muestra el valor: solo el origen y los últimos 4 caracteres.
 */
function renderDecodoSection(env: Env, settings: Record<string, string>, t: T): string {
  const settingVal = (settings[SETTING_KEYS.decodoAuth] ?? "").trim();
  const envVal = (env.DECODO_AUTH ?? "").trim();
  const source = settingVal ? "panel" : envVal ? "worker (secret)" : "";
  const configured = Boolean(source);
  const tail = (settingVal || envVal).slice(-4);
  // Proveedor de scraping + estado de la key de AIsa (propia, heredada del LLM o
  // del secret del worker).
  const provider = (settings[SETTING_KEYS.scrapeProvider] ?? "auto").trim() || "auto";
  const aisaSetting = (settings[SETTING_KEYS.aisaApiKey] ?? "").trim();
  const aisaLlm = (settings[SETTING_KEYS.llmApiKey] ?? "").trim();
  const aisaEnv = (env.AISA_API_KEY ?? "").trim();
  const aisaOk = Boolean(aisaSetting || aisaLlm || aisaEnv);
  const aisaOrigin = aisaSetting ? "panel" : aisaLlm ? "LLM" : aisaEnv ? "worker (secret)" : "";
  const aisaTail = (aisaSetting || aisaLlm || aisaEnv).slice(-4);
  return `
    <div class="bg-panel border border-line" style="padding:20px;display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <h3 class="font-display font-semibold text-[13.5px] text-cream">${t("cfg.decodo.title")}</h3>
        <p class="text-dim text-[11.5px]" style="margin:0">${t("cfg.decodo.help")}</p>
      </div>

      <div style="display:flex;flex-direction:column;gap:6px;max-width:520px">
        <label class="text-dim text-[11px]" for="${SETTING_KEYS.scrapeProvider}">${t("cfg.scrape.providerLabel")}</label>
        <select id="${SETTING_KEYS.scrapeProvider}" name="${SETTING_KEYS.scrapeProvider}" style="${INPUT_STYLE}">
          <option value="auto" ${provider === "auto" ? "selected" : ""}>${t("cfg.scrape.opt.auto")}</option>
          <option value="aisa" ${provider === "aisa" ? "selected" : ""}>${t("cfg.scrape.opt.aisa")}</option>
          <option value="decodo" ${provider === "decodo" ? "selected" : ""}>${t("cfg.scrape.opt.decodo")}</option>
        </select>
        <p class="text-dim text-[11px]" style="margin:0">${t("cfg.scrape.help")}</p>
      </div>

      <div style="display:flex;flex-direction:column;gap:6px;max-width:520px">
        <label class="text-dim text-[11px]" for="${SETTING_KEYS.aisaApiKey}">${t("cfg.scrape.aisaKeyLabel")}</label>
        <input type="password" id="${SETTING_KEYS.aisaApiKey}" name="${SETTING_KEYS.aisaApiKey}" value="" autocomplete="off"
               placeholder="${aisaSetting ? t("cfg.decodo.phKeep") : t("cfg.scrape.phAisa")}" style="${INPUT_STYLE}">
        <div class="text-[11px]">${
          aisaOk
            ? `<span style="color:var(--ok)">● ${t("cfg.scrape.aisaOk")}</span> <span class="text-dim">${t("cfg.scrape.aisaOrigin", { src: esc(aisaOrigin), tail: esc(aisaTail) })}</span>`
            : `<span class="text-dim">○ ${t("cfg.scrape.aisaMissing")}</span>`
        }</div>
        ${aisaSetting ? `<label class="text-dim text-[11.5px]" style="display:flex;gap:7px;align-items:center;cursor:pointer"><input type="checkbox" name="aisa_clear" value="1"> ${t("cfg.scrape.clear")}</label>` : ""}
      </div>

      <div style="display:flex;flex-direction:column;gap:6px;max-width:520px;border-top:1px solid var(--line);padding-top:13px">
        <label class="text-dim text-[11px]" for="decodo_auth">${t("cfg.decodo.apiKeyLabel")}</label>
        <div class="text-[11.5px]">${
          configured
            ? `<span style="color:var(--ok)">● ${t("cfg.decodo.configured")}</span> <span class="text-dim">${t("cfg.decodo.source", { src: esc(source), tail: esc(tail) })}</span>`
            : `<span class="text-dim">○ ${t("cfg.decodo.notConfigured")}</span>`
        }</div>
        <input type="password" id="${SETTING_KEYS.decodoAuth}" name="${SETTING_KEYS.decodoAuth}" value="" autocomplete="off"
               placeholder="${configured ? t("cfg.decodo.phKeep") : t("cfg.decodo.phUserPass")}" style="${INPUT_STYLE}">
      </div>
      <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
        ${
          !settingVal && envVal
            ? `<button type="submit" formaction="/admin/config/decodo-import" class="text-[11.5px] cursor-pointer" style="border:1px solid var(--accent);color:var(--accent);background:none;padding:8px 13px">${t("cfg.decodo.useWorker")}</button>`
            : ""
        }
        ${
          settingVal
            ? `<label class="text-dim text-[11.5px]" style="display:flex;gap:7px;align-items:center;cursor:pointer"><input type="checkbox" name="decodo_clear" value="1"> ${t("cfg.decodo.clear")}</label>`
            : ""
        }
      </div>
      <div class="text-[11.5px]" style="border-top:1px solid var(--line);padding-top:11px">
        <a href="/admin/scraping" style="color:var(--accent);text-decoration:none">${t("cfg.decodo.viewLog")} →</a>
        <span class="text-dim">${t("cfg.decodo.viewLogHint")}</span>
      </div>
    </div>`;
}

/** Sección "Modelo de IA": proveedor + API key propia + modelo concreto. */
function renderLlmSection(settings: Record<string, string>, t: T, llmTest?: string): string {
  const provider = settings[SETTING_KEYS.llmProvider] ?? "";
  const model = settings[SETTING_KEYS.llmModel] ?? "";
  const hasKey = (settings[SETTING_KEYS.llmApiKey] ?? "").trim() !== "";
  const keyTail = hasKey ? (settings[SETTING_KEYS.llmApiKey] ?? "").trim().slice(-4) : "";

  const providerOpts = [
    { v: "", l: t("cfg.llm.providerAuto") },
    { v: "anthropic", l: t("cfg.llm.optClaude") },
    { v: "openai", l: t("cfg.llm.optOpenai") },
    { v: "aisa", l: t("cfg.llm.optAisa") },
    { v: "xai", l: t("cfg.llm.optXai") },
    { v: "minimax", l: t("cfg.llm.optMinimax") },
    { v: "google", l: t("cfg.llm.optGoogle") },
  ]
    .map((o) => `<option value="${o.v}" ${provider === o.v ? "selected" : ""}>${o.l}</option>`)
    .join("");

  const anthropicOpts = CURATED_MODELS.filter((m) => m.provider === "anthropic")
    .map((m) => `<option value="${esc(m.id)}" ${model === m.id ? "selected" : ""}>${esc(m.label)}</option>`)
    .join("");
  const openaiOpts = CURATED_MODELS.filter((m) => m.provider === "openai")
    .map((m) => `<option value="${esc(m.id)}" ${model === m.id ? "selected" : ""}>${esc(m.label)}</option>`)
    .join("");
  const xaiOpts = CURATED_MODELS.filter((m) => m.provider === "xai")
    .map((m) => `<option value="${esc(m.id)}" ${model === m.id ? "selected" : ""}>${esc(m.label)}</option>`)
    .join("");
  const minimaxOpts = CURATED_MODELS.filter((m) => m.provider === "minimax")
    .map((m) => `<option value="${esc(m.id)}" ${model === m.id ? "selected" : ""}>${esc(m.label)}</option>`)
    .join("");
  const googleOpts = CURATED_MODELS.filter((m) => m.provider === "google")
    .map((m) => `<option value="${esc(m.id)}" ${model === m.id ? "selected" : ""}>${esc(m.label)}</option>`)
    .join("");

  let testBanner = "";
  if (llmTest?.startsWith("ok:")) {
    testBanner = `<div style="border:1px solid var(--ok);background:var(--ok-soft);color:var(--ok);padding:9px 12px;font-size:12px;font-weight:600">${t("cfg.llm.testOk", { model: esc(llmTest.slice(3)) })}</div>`;
  } else if (llmTest?.startsWith("err:")) {
    testBanner = `<div style="border:1px solid var(--bad);background:var(--bad-soft);color:var(--bad);padding:9px 12px;font-size:12px;font-weight:600">${t("cfg.llm.testErr", { msg: esc(llmTest.slice(4, 200)) })}</div>`;
  }

  return `
    <div class="bg-panel border border-line" style="padding:20px;display:flex;flex-direction:column;gap:18px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <h3 class="font-display font-semibold text-[13.5px] text-cream">${t("cfg.llm.title")}</h3>
        <p class="text-dim text-[12px]">${t("cfg.llm.help")}</p>
      </div>
      ${testBanner}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div style="display:flex;flex-direction:column;gap:6px">
          <label class="font-display font-semibold text-[12.5px] text-cream">${t("cfg.llm.provider")}</label>
          <select name="${SETTING_KEYS.llmProvider}" style="${SELECT_STYLE}">${providerOpts}</select>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <label class="font-display font-semibold text-[12.5px] text-cream">${t("cfg.llm.model")}</label>
          <select name="${SETTING_KEYS.llmModel}" style="${SELECT_STYLE}">
            <option value="" ${model === "" ? "selected" : ""}>${t("cfg.llm.modelAuto")}</option>
            <optgroup label="${t("cfg.llm.optClaude")}">${anthropicOpts}</optgroup>
            <optgroup label="${t("cfg.llm.optOpenai")}">${openaiOpts}</optgroup>
            <optgroup label="${t("cfg.llm.optXai")}">${xaiOpts}</optgroup>
            <optgroup label="${t("cfg.llm.optMinimax")}">${minimaxOpts}</optgroup>
            <optgroup label="${t("cfg.llm.optGoogle")}">${googleOpts}</optgroup>
          </select>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <label class="font-display font-semibold text-[12.5px] text-cream">${t("cfg.llm.baseUrlLabel")}</label>
        <p class="text-dim text-[11px]">${t("cfg.llm.baseUrlHelp")}</p>
        <input type="text" name="${SETTING_KEYS.llmApiBaseUrl}" value="${esc(settings[SETTING_KEYS.llmApiBaseUrl] ?? "")}"
               placeholder="https://api.aisa.one/v1" style="${INPUT_STYLE}">
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <label class="font-display font-semibold text-[12.5px] text-cream">${t("cfg.llm.keyLabel")}</label>
        <p class="text-dim text-[11px]">${hasKey ? t("cfg.llm.keyHelpSaved", { tail: esc(keyTail) }) : t("cfg.llm.keyHelpEmpty")}</p>
        <input type="password" name="${SETTING_KEYS.llmApiKey}" value="" autocomplete="off"
               placeholder="${hasKey ? t("cfg.llm.phMask") : t("cfg.llm.phKey")}" style="${INPUT_STYLE}">
        ${hasKey ? `<label class="text-dim text-[11.5px]" style="display:flex;align-items:center;gap:7px;cursor:pointer"><input type="checkbox" name="llm_api_key_clear" value="1"> ${t("cfg.llm.clearKey")}</label>` : ""}
      </div>
      <a href="/admin/config/llm-test" class="text-[12px] font-display font-semibold"
         style="width:fit-content;border:1px solid var(--line);color:var(--cream);padding:9px 14px;text-decoration:none">${t("cfg.llm.testLink")}</a>
    </div>`;
}

/**
 * Zona horaria del NEGOCIO: es la que usan el reloj del bot (para "hoy",
 * "mañana"), la agenda de citas y el guardia de fechas pasadas. Un select de
 * zonas comunes evita typos que romperían los horarios; una zona inválida se
 * ignora y cae al default.
 */
function renderTimezoneSection(settings: Record<string, string>, t: T): string {
  const current = settings[SETTING_KEYS.businessTimezone] ?? "";
  const opts = [
    { v: "", l: t("cfg.tz.default", { tz: DEFAULT_BUSINESS_TZ }) },
    ...COMMON_TIMEZONES.map((tz) => ({ v: tz, l: tz })),
  ]
    .map((o) => `<option value="${esc(o.v)}" ${current === o.v ? "selected" : ""}>${esc(o.l)}</option>`)
    .join("");

  return `
    <div class="bg-panel border border-line" style="padding:20px;display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <h3 class="font-display font-semibold text-[13.5px] text-cream">${t("cfg.tz.title")}</h3>
        <p class="text-dim text-[12px]">${t("cfg.tz.help")}</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <label class="font-display font-semibold text-[12.5px] text-cream">${t("cfg.tz.label")}</label>
        <select name="${SETTING_KEYS.businessTimezone}" style="${SELECT_STYLE}">${opts}</select>
      </div>
    </div>`;
}

/**
 * Sección "Modelo de análisis (scraping)": permite que el análisis del
 * inventario scrapeado use un modelo DISTINTO al del chat — típicamente uno
 * bueno y caro (Claude Opus) mientras el chat sigue barato (gpt-4o-mini).
 *
 * Todo vacío = hereda la configuración del bot (misma API, mismo modelo). Para
 * usar OTRO proveedor hay que dar su API key: heredar la del chat daría 401.
 */
function renderAnalysisLlmSection(settings: Record<string, string>, t: T): string {
  const provider = settings[SETTING_KEYS.analysisLlmProvider] ?? "";
  const model = settings[SETTING_KEYS.analysisLlmModel] ?? "";
  const hasKey = (settings[SETTING_KEYS.analysisLlmApiKey] ?? "").trim() !== "";
  const keyTail = hasKey ? (settings[SETTING_KEYS.analysisLlmApiKey] ?? "").trim().slice(-4) : "";

  const providerOpts = [
    { v: "", l: t("cfg.llm.providerSameBot") },
    { v: "anthropic", l: t("cfg.llm.optClaude") },
    { v: "openai", l: t("cfg.llm.optOpenai") },
    { v: "aisa", l: t("cfg.llm.optAisa") },
    { v: "xai", l: t("cfg.llm.optXai") },
    { v: "minimax", l: t("cfg.llm.optMinimax") },
    { v: "google", l: t("cfg.llm.optGoogle") },
  ]
    .map((o) => `<option value="${o.v}" ${provider === o.v ? "selected" : ""}>${o.l}</option>`)
    .join("");

  const groupOpts = (prov: string) =>
    CURATED_MODELS.filter((m) => m.provider === prov)
      .map((m) => `<option value="${esc(m.id)}" ${model === m.id ? "selected" : ""}>${esc(m.label)}</option>`)
      .join("");

  return `
    <div class="bg-panel border border-line" style="padding:20px;display:flex;flex-direction:column;gap:18px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <h3 class="font-display font-semibold text-[13.5px] text-cream">${t("cfg.analysis.title")}</h3>
        <p class="text-dim text-[12px]">${t("cfg.analysis.help")}</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div style="display:flex;flex-direction:column;gap:6px">
          <label class="font-display font-semibold text-[12.5px] text-cream">${t("cfg.llm.provider")}</label>
          <select name="${SETTING_KEYS.analysisLlmProvider}" style="${SELECT_STYLE}">${providerOpts}</select>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <label class="font-display font-semibold text-[12.5px] text-cream">${t("cfg.llm.model")}</label>
          <select name="${SETTING_KEYS.analysisLlmModel}" style="${SELECT_STYLE}">
            <option value="" ${model === "" ? "selected" : ""}>${t("cfg.analysis.sameBot")}</option>
            <optgroup label="${t("cfg.llm.optClaude")}">${groupOpts("anthropic")}</optgroup>
            <optgroup label="${t("cfg.llm.optOpenai")}">${groupOpts("openai")}</optgroup>
            <optgroup label="${t("cfg.llm.optXai")}">${groupOpts("xai")}</optgroup>
            <optgroup label="${t("cfg.llm.optMinimax")}">${groupOpts("minimax")}</optgroup>
            <optgroup label="${t("cfg.llm.optGoogle")}">${groupOpts("google")}</optgroup>
          </select>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <label class="font-display font-semibold text-[12.5px] text-cream">${t("cfg.analysis.baseUrlLabel")}</label>
        <p class="text-dim text-[11px]">${t("cfg.analysis.baseUrlHelp")}</p>
        <input type="text" name="${SETTING_KEYS.analysisLlmApiBaseUrl}" value="${esc(settings[SETTING_KEYS.analysisLlmApiBaseUrl] ?? "")}"
               placeholder="https://api.aisa.one/v1" style="${INPUT_STYLE}">
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <label class="font-display font-semibold text-[12.5px] text-cream">${t("cfg.analysis.keyLabel")}</label>
        <p class="text-dim text-[11px]">${hasKey ? t("cfg.analysis.keyHelpSaved", { tail: esc(keyTail) }) : t("cfg.analysis.keyHelpEmpty")}</p>
        <input type="password" name="${SETTING_KEYS.analysisLlmApiKey}" value="" autocomplete="off"
               placeholder="${hasKey ? t("cfg.llm.phMask") : t("cfg.llm.phKey")}" style="${INPUT_STYLE}">
        ${hasKey ? `<label class="text-dim text-[11.5px]" style="display:flex;align-items:center;gap:7px;cursor:pointer"><input type="checkbox" name="analysis_llm_api_key_clear" value="1"> ${t("cfg.analysis.clearKey")}</label>` : ""}
      </div>
    </div>`;
}

/**
 * Render the Config tab. Receives the current settings overlay (Record from
 * SettingsRepo.all()). `saved` shows the "Guardado ✓" confirmation banner after
 * a redirect from POST /admin/config?saved=1.
 */
export async function renderConfig(
  env: Env,
  settings: Record<string, string>,
  saved = false,
  llmTest?: string,
  toolNames: string[] = [],
): Promise<string> {
  const { t } = await panelI18n(env);
  const cardGroups = CONTROL_LIST.map((c) => renderCardGroup(c, settings, t)).join("");

  // Herramientas activas (excluye las desactivadas en el panel): son las que el
  // modelo puede llamar, así que son las que se ofrecen para insertar.
  const disabledTools = new Set(
    (settings[SETTING_KEYS.disabledTools] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const enabledToolNames = toolNames.filter((n) => !disabledTools.has(n));

  // Este campo escribe la MISMA llave que "Prompt del agente" de Mi Agente →
  // Flujo, donde el textarea viene precargado con el prompt efectivo. Aquí llega
  // vacío, así que hay que decir de frente que lo que se escriba sustituye al
  // prompt completo — no se suma a él.
  const hasPromptOverride = (settings[SETTING_KEYS.systemPromptOverride] ?? "").trim() !== "";

  const savedBanner = saved
    ? `<div style="border:1px solid var(--ok);background:var(--ok-soft);color:var(--ok);padding:10px 14px;font-size:12.5px;font-weight:600">${t("cfg.saved")}</div>`
    : "";

  // Historial del prompt: las últimas versiones, con "volver".
  let promptHistory = "";
  try {
    const list = JSON.parse(settings[SETTING_KEYS.promptVersions] ?? "[]") as { at: number; system: string; instructions: string }[];
    if (Array.isArray(list) && list.length) {
      promptHistory = `
        <div class="bg-panel border border-line" style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">
          <div class="font-display font-semibold text-[12.5px] text-cream">${t("cfg.history.title")}</div>
          <p class="text-muted text-[11.5px]" style="margin:0">${t("cfg.history.help", { n: list.length })}</p>
          ${list.map((v) => `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--line);padding:8px 10px">
              <span class="text-muted text-[11.5px] font-mono">${esc(new Date(v.at).toLocaleString("es-MX"))}</span>
              <button type="submit" form="prompt-restore-form" name="at" value="${v.at}"
                      class="text-[11.5px] font-display font-semibold cursor-pointer"
                      style="border:1px solid var(--line);color:var(--cream);padding:6px 12px;background:var(--panel2)">${t("cfg.history.restore")}</button>
            </div>`).join("")}
        </div>`;
    }
  } catch { /* sin historial */ }

  const body = `
    <form id="prompt-restore-form" method="POST" action="/admin/prompt/restore" style="display:none"></form>
    <form method="POST" action="/admin/config" style="display:flex;flex-direction:column;gap:28px">
      ${savedBanner}
      ${promptHistory}

      <div style="display:flex;flex-direction:column;gap:2px">
        <h2 class="font-display font-semibold text-[15px] text-cream">${t("cfg.heading", { name: esc(env.BUSINESS_NAME) })}</h2>
        <p class="text-muted text-[12.5px]">${t("cfg.subtitle")}</p>
      </div>

      <!-- Card-based controls (tono, velocidad, estilo, cerebro, estado) -->
      <div class="bg-panel border border-line" style="padding:20px;display:flex;flex-direction:column;gap:22px">
        ${cardGroups}
      </div>

      <!-- Zona horaria del negocio (reloj del bot + agenda) -->
      ${renderTimezoneSection(settings, t)}

      <!-- Modelo de IA (BYO provider/key/model) -->
      ${renderLlmSection(settings, t, llmTest)}

      <!-- Modelo de análisis (scraping) — separado del chat -->
      ${renderAnalysisLlmSection(settings, t)}

      <!-- Scraping web: qué hace Decodo y qué hace AIsa (mapa visual) -->
      ${renderScrapeProviders(env, settings, t)}

      <!-- Scraping web: llaves y modo -->
      ${renderDecodoSection(env, settings, t)}

      <!-- Free-text settings -->
      <div class="bg-panel border border-line" style="padding:20px;display:flex;flex-direction:column;gap:18px">
        ${renderTextField({
          name: SETTING_KEYS.botName,
          label: t("cfg.botName.label"),
          help: t("cfg.botName.help"),
          value: settings[SETTING_KEYS.botName] ?? "",
          placeholder: env.BOT_NAME ?? t("cfg.botName.ph"),
        })}

        <div style="display:flex;flex-direction:column;gap:6px;max-width:420px">
          <label class="font-display font-semibold text-[12.5px] text-cream" for="${SETTING_KEYS.agentPersona}">${t("cfg.persona.label")}</label>
          <p class="text-dim text-[11px]">${t("cfg.persona.help")}</p>
          <select id="${SETTING_KEYS.agentPersona}" name="${SETTING_KEYS.agentPersona}" style="${SELECT_STYLE}">
            <option value="" ${(settings[SETTING_KEYS.agentPersona] ?? "") !== "dueño" ? "selected" : ""}>${t("cfg.persona.business")}</option>
            <option value="dueño" ${settings[SETTING_KEYS.agentPersona] === "dueño" ? "selected" : ""}>${t("cfg.persona.you")}</option>
          </select>
        </div>

        ${renderTextArea({
          name: SETTING_KEYS.businessContext,
          label: t("cfg.business.label"),
          help: t("cfg.business.help"),
          // Pre-llenado: si el panel aún no tiene override, muestra lo que el
          // onboarding cargó en member/config.local (renderBusinessContext) para
          // que el miembro VEA y edite sus horarios aquí desde el día 1.
          value: settings[SETTING_KEYS.businessContext] || renderBusinessContext(),
          placeholder: t("cfg.business.ph"),
          rows: 6,
        })}

        ${renderTextArea({
          name: SETTING_KEYS.systemPromptOverride,
          label: t("cfg.prompt.label"),
          help: hasPromptOverride
            ? t("cfg.prompt.helpManual")
            : t("cfg.prompt.helpDefault"),
          value: settings[SETTING_KEYS.systemPromptOverride] ?? "",
          placeholder:
            t("cfg.prompt.ph"),
          rows: 4,
          extra: renderPromptInsertBar(t, SETTING_KEYS.systemPromptOverride, enabledToolNames),
        })}

        ${renderTextField({
          name: SETTING_KEYS.escalationKeywords,
          label: t("cfg.escalation.label"),
          help: t("cfg.escalation.help"),
          value: settings[SETTING_KEYS.escalationKeywords] ?? "",
          placeholder: t("cfg.escalation.ph"),
        })}
      </div>

      <!-- Botones y multimedia (Fase A) -->
      <div class="bg-panel border border-line" style="padding:20px;display:flex;flex-direction:column;gap:18px">
        <div style="display:flex;flex-direction:column;gap:2px">
          <h3 class="font-display font-semibold text-[14px] text-cream">${t("cfg.media.title")}</h3>
          <p class="text-muted text-[12px]">${t("cfg.media.help")}</p>
        </div>

        <label style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--muted);cursor:pointer">
          <input type="checkbox" name="${SETTING_KEYS.allowMultimedia}" value="1"
                 ${settings[SETTING_KEYS.allowMultimedia] === "1" ? "checked" : ""}
                 style="accent-color:var(--accent);width:auto">
          ${t("cfg.media.allow")}
          <span class="text-dim text-[11px]">${t("cfg.media.allowHint")}</span>
        </label>

        ${renderTextArea({
          name: SETTING_KEYS.menuButtons,
          label: t("cfg.menu.label"),
          help: t("cfg.menu.help"),
          value: settings[SETTING_KEYS.menuButtons] ?? "",
          placeholder: t("cfg.menu.ph"),
          rows: 3,
        })}

        ${renderTextArea({
          name: SETTING_KEYS.resourceLibrary,
          label: t("cfg.resources.label"),
          help: t("cfg.resources.help"),
          value: settings[SETTING_KEYS.resourceLibrary] ?? "",
          placeholder: t("cfg.resources.ph"),
          rows: 4,
        })}

        <a href="/admin/recursos" class="text-accent text-[12px]">${t("rec.title")} →</a>
      </div>

      <button type="submit" class="bigbtn font-display font-bold text-[13px] cursor-pointer"
              style="width:fit-content;background:var(--accent);border:1px solid var(--accent);color:var(--on-accent);box-shadow:var(--shadow);padding:13px 24px;display:flex;align-items:center;gap:9px">
        <i data-lucide="check" width="16" height="16"></i> ${t("cfg.saveChanges")}
      </button>
    </form>`;

  return layout({ title: t("cfg.title"), activeTab: "config", body, env });
}
