// Menú "Extras" (Kooni+) — cuadrícula de funciones de pago que el dueño
// enciende/apaga. Cada tarjeta muestra: emoji, nombre, descripción, dónde actúa
// (bot / panel) y su estado: ACTIVO (toggle on + módulo pago desbloqueado),
// DESACTIVADO (toggle off), o 🔒 BLOQUEADO (módulo no incluido en la licencia).
import type { Env } from "../../env";
import { Db } from "../../db/client";
import { SettingsRepo, SETTING_KEYS } from "../../db/settings";
import { EXTRA_FEATURES, extrasState, HABILIDADES } from "../../features";
import { layout } from "./layout";
import { panelI18n } from "../i18n";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

export async function renderExtras(env: Env, saved = false, report?: string): Promise<string> {
  const { t } = await panelI18n(env);
  const settings = await new SettingsRepo(new Db(env.DB)).all();
  const state = await extrasState(env, settings);

  const savedBanner = saved
    ? `<div style="border:1px solid var(--ok);background:var(--ok-soft);color:var(--ok);padding:10px 14px;font-size:12.5px;font-weight:600">${t("extras.saved")}</div>`
    : "";

  let reportBanner = "";
  if (report?.startsWith("ok:")) {
    const ch = report.slice(3).split("+").join(" + ");
    reportBanner = `<div style="border:1px solid var(--ok);background:var(--ok-soft);color:var(--ok);padding:9px 12px;font-size:12px;font-weight:600">${t("extras.reportOk", { channels: esc(ch) })}</div>`;
  } else if (report?.startsWith("err:")) {
    const msg = report.slice(4).slice(0, 180);
    reportBanner = `<div style="border:1px solid var(--bad);background:var(--bad-soft);color:var(--bad);padding:9px 12px;font-size:12px;font-weight:600">✕ ${esc(msg)}</div>`;
  }

  const actuaBadge = (a: string) => {
    const txt = a === "bot" ? t("extras.actua.bot") : a === "panel" ? t("extras.actua.panel") : t("extras.actua.both");
    return `<span class="text-[9px] tracking-wide border px-1.5" style="color:var(--dim);border-color:var(--line)">${txt}</span>`;
  };

  const SELECT_STYLE =
    "background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:8px 10px;font-size:12px;outline:none;width:100%";

  const cards = EXTRA_FEATURES.map((f) => {
    const st = state[f.id];
    const on = st.on && st.unlocked;
    const statusBadge = !st.unlocked
      ? `<span class="text-[9px] tracking-wide border px-1.5" style="color:var(--accent2);border-color:var(--accent2)">${t("extras.locked")}</span>`
      : on
        ? `<span class="text-[9px] tracking-wide border px-1.5" style="color:var(--ok);border-color:var(--ok)">${t("extras.active")}</span>`
        : `<span class="text-[9px] tracking-wide border px-1.5" style="color:var(--dim);border-color:var(--line)">${t("extras.inactive")}</span>`;
    const toggle = st.unlocked
      ? `<label style="display:flex;align-items:center;gap:9px;cursor:pointer;flex:none">
           <input type="checkbox" name="${esc(f.toggleKey)}" value="1" ${on ? "checked" : ""} style="accent-color:var(--accent);width:16px;height:16px">
           <span class="text-[11.5px] text-muted">${on ? t("extras.on") : t("extras.off")}</span>
         </label>`
      : `<span class="text-[11px] text-accent2" style="flex:none">${t("extras.requiresLicense")} <a href="/admin/licencia" style="color:var(--accent2)">${t("extras.license")}</a></span>`;

    // El Reporte nocturno tiene config extra: canal (Telegram/correo) y botón
    // de prueba (POST a /admin/config/report-test, vive fuera de este form).
    let extra = "";
    if (f.kind === "reporte" && st.unlocked) {
      const channel = settings[SETTING_KEYS.nightlyReportChannel] ?? "telegram";
      const opts = [
        { v: "telegram", l: "Telegram" },
        { v: "email", l: t("extras.report.email") },
        { v: "both", l: t("extras.report.both") },
      ]
        .map((o) => `<option value="${o.v}" ${channel === o.v ? "selected" : ""}>${o.l}</option>`)
        .join("");
      extra = `
        <div style="display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;margin-top:4px">
          <div style="display:flex;flex-direction:column;gap:4px;max-width:220px">
            <label class="text-[11px] text-dim" for="${esc(SETTING_KEYS.nightlyReportChannel)}">${t("extras.report.channelLabel")}</label>
            <select id="${esc(SETTING_KEYS.nightlyReportChannel)}" name="${esc(SETTING_KEYS.nightlyReportChannel)}" style="${SELECT_STYLE}">${opts}</select>
          </div>
          <button type="submit" form="report-test-form"
                  class="text-[11.5px] font-display font-semibold cursor-pointer"
                  style="border:1px solid var(--line);color:var(--cream);padding:8px 12px;background:var(--panel2);white-space:nowrap">${t("extras.report.testBtn")}</button>
        </div>`;
    }

    // Campos de config de la función (links de reseñas/pago, mensajes de
    // seguimiento, etc.). `kind` decide el control: checkbox | textarea | text.
    if ((f.config ?? []).length > 0 && st.unlocked) {
      const fields = (f.config ?? [])
        .map((c) => {
          const val = settings[c.key] ?? "";
          const help = `<span class="text-[10.5px] text-dim">${esc(c.help)}</span>`;
          if (c.kind === "checkbox") {
            return `<div style="display:flex;flex-direction:column;gap:2px;max-width:520px">
              <label style="display:flex;align-items:center;gap:9px;font-size:12.5px;color:var(--cream);cursor:pointer">
                <input type="checkbox" id="${esc(c.key)}" name="${esc(c.key)}" value="1" ${val === "1" ? "checked" : ""}
                       style="accent-color:var(--accent);width:16px;height:16px">
                <span>${esc(c.label)}</span>
              </label>
              ${help}
            </div>`;
          }
          if (c.kind === "textarea") {
            return `<div style="display:flex;flex-direction:column;gap:4px;max-width:520px">
              <label class="text-[11px] text-dim" for="${esc(c.key)}">${esc(c.label)}</label>
              <textarea id="${esc(c.key)}" name="${esc(c.key)}" rows="2" placeholder="${esc(c.placeholder)}"
                        style="${SELECT_STYLE};resize:vertical;font-family:inherit">${esc(val)}</textarea>
              ${help}
            </div>`;
          }
          return `<div style="display:flex;flex-direction:column;gap:4px;max-width:420px">
              <label class="text-[11px] text-dim" for="${esc(c.key)}">${esc(c.label)}</label>
              <input type="text" id="${esc(c.key)}" name="${esc(c.key)}" value="${esc(val)}"
                     placeholder="${esc(c.placeholder)}" style="${SELECT_STYLE}">
              ${help}
            </div>`;
        })
        .join("");
      extra += `<div style="display:flex;flex-direction:column;gap:8px;margin-top:2px">${fields}</div>`;
    }

    return `
      <div class="bg-panel border border-line" style="padding:18px;display:flex;flex-direction:column;gap:12px;${!st.unlocked ? "opacity:.82" : ""}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
          <div style="display:flex;align-items:center;gap:10px;min-width:0">
            <span style="font-size:22px;flex:none">${f.emoji}</span>
            <div style="min-width:0">
              <div class="font-display font-semibold text-[14px] text-cream">${esc(f.nombre)}</div>
              <div style="display:flex;gap:6px;margin-top:5px;flex-wrap:wrap">
                ${statusBadge}
                ${actuaBadge(f.actuaEn)}
                <span class="text-[9px] tracking-wide border px-1.5" style="color:var(--dim);border-color:var(--line)">${f.tipo === "pago_unico" ? t("extras.singlePayment") : t("extras.membership")}</span>
              </div>
            </div>
          </div>
          ${toggle}
        </div>
        <p class="text-muted text-[12px] leading-relaxed" style="margin:0">${esc(f.descripcion)}</p>
        ${extra}
        ${f.id === "reporte" ? reportBanner : ""}
      </div>`;
  }).join("");

  const habilidadCards = HABILIDADES.map(
    (h) => `
      <div class="bg-panel border border-line" style="padding:14px;display:flex;gap:10px;align-items:flex-start">
        <span style="font-size:20px;flex:none">${h.emoji}</span>
        <div style="min-width:0">
          <div class="font-display font-semibold text-[13px] text-cream">${esc(h.nombre)}</div>
          <p class="text-muted text-[11.5px]" style="margin:3px 0 0">${esc(h.descripcion)}</p>
        </div>
      </div>`,
  ).join("");

  const body = `
    <div style="display:flex;flex-direction:column;gap:18px;max-width:1080px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <h2 class="font-display font-semibold text-[15px] text-cream">${t("extras.included.title")}</h2>
        <p class="text-muted text-[12.5px]">${t("extras.included.help")}</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">${habilidadCards}</div>

      <form method="POST" action="/admin/extras" style="display:flex;flex-direction:column;gap:18px;margin-top:10px">
        ${savedBanner}
        <div style="display:flex;flex-direction:column;gap:2px">
          <h2 class="font-display font-semibold text-[15px] text-cream">${t("extras.paid.title")}</h2>
          <p class="text-muted text-[12.5px]">${t("extras.paid.help")}</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">${cards}</div>
        <button type="submit" class="bigbtn font-display font-bold text-[13px] cursor-pointer"
                style="width:fit-content;background:var(--accent);border:1px solid var(--accent);color:var(--on-accent);box-shadow:var(--shadow);padding:13px 24px;display:flex;align-items:center;gap:9px">
          <i data-lucide="check" width="16" height="16"></i> ${t("extras.save")}
        </button>
      </form>
    </div>
    <!-- Form del botón "Enviar prueba ahora" del Reporte nocturno: vive FUERA del
         form principal (HTML no permite forms anidados); el botón lo referencia
         con form="report-test-form". -->
    <form id="report-test-form" method="POST" action="/admin/config/report-test" style="display:none"></form>`;

  return layout({ title: t("extras.title"), activeTab: "extras", body, env });
}
