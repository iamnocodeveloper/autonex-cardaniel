// "Licencia" — activa Pro pegando un código KOONI-PRO-... (validación local HMAC).
import type { Env } from "../../env";
import { layout } from "./layout";
import { Db } from "../../db/client";
import { SettingsRepo, SETTING_KEYS } from "../../db/settings";
import { inspectLicense } from "../../license";
import { FREE_LIMITS } from "../../limits";
import { isInstallUnlimited } from "../../config";
import { readOverlay } from "../../licenseSync";
import { panelI18n } from "../i18n";

const fecha = (ms: number) => new Date(ms).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

export async function renderLicencia(env: Env, msg?: string, isError?: boolean): Promise<string> {
  const { t } = await panelI18n(env);
  const repo = new SettingsRepo(new Db(env.DB));
  const code = (await repo.get(SETTING_KEYS.proLicense).catch(() => null)) ?? "";
  const ins = code ? inspectLicense(code, env) : null;
  const payload = ins && (ins.state === "active" || ins.state === "grace") ? ins.payload : null;
  const isPro = payload !== null;
  // Instalación fuera del esquema de licencias: no depende de código ni de
  // plan. Se muestra como todo desbloqueado para que nadie pegue un código.
  const unlimited = isInstallUnlimited(env);
  // Estado que dejó el backend de licencias (super admin): plan, módulos,
  // límites y marca. Si existe, es la fuente en vivo; el código de abajo es el
  // respaldo offline.
  const overlay = await readOverlay(env);

  const banner = msg
    ? `<div style="border:1px solid ${isError ? "var(--bad)" : "var(--ok)"};color:${isError ? "var(--bad)" : "var(--ok)"};padding:10px 14px;font-size:12px;background:${isError ? "var(--bad-soft)" : "var(--ok-soft)"}">${esc(msg)}</div>`
    : "";

  // Detalle de vigencia según el estado del código.
  let vigencia = "";
  if (unlimited) {
    vigencia = t("lic.unlimited.state");
  } else if (ins?.state === "active") {
    if (!ins.expiresAt) vigencia = t("lic.forever");
    else if ((ins.daysLeft ?? 0) <= 0) vigencia = t("lic.monthlyExpiresToday", { date: fecha(ins.expiresAt) });
    else vigencia = t("lic.monthlyExpiresInDays", { n: String(ins.daysLeft), days: ins.daysLeft === 1 ? t("lic.day") : t("lic.days"), date: fecha(ins.expiresAt) });
  } else if (ins?.state === "grace") {
    const left = 7 + (ins.daysLeft ?? 0); // daysLeft es negativo tras vencer
    vigencia = t("lic.grace", { date: fecha(ins.expiresAt!), n: Math.max(0, left), days: left === 1 ? t("lic.day") : t("lic.days") });
  } else if (ins?.state === "expired") {
    vigencia = t("lic.expired", { date: fecha(ins.expiresAt!) });
  }

  const soon = ins?.state === "active" && ins.daysLeft !== null && ins.daysLeft <= 7;

  const statusCard =
    ins?.state === "grace"
      ? `<div class="bg-panel border" style="padding:18px 20px;border-color:var(--bad);display:flex;flex-direction:column;gap:8px">
           <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">
             <span style="font-size:10px;letter-spacing:.14em;color:var(--bad);border:1px solid var(--bad);background:var(--bad-soft);padding:3px 10px;font-weight:700">${t("lic.badge.grace")}</span>
             <span class="text-dim text-[11px] font-mono">${esc(vigencia)}</span>
           </div>
           <p class="text-muted text-[12px]" style="margin:0">${t("lic.grace.help")}</p>
         </div>`
      : isPro || unlimited
        ? `<div class="bg-panel border" style="padding:18px 20px;border-color:${soon ? "var(--warn)" : "var(--ok)"};display:flex;flex-direction:column;gap:8px">
           <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">
             <span style="font-size:10px;letter-spacing:.14em;color:var(--ok);border:1px solid var(--ok);background:var(--ok-soft);padding:3px 10px;font-weight:700">${unlimited ? t("lic.badge.unlimited") : t("lic.badge.pro")}</span>
             <span class="text-dim text-[11px] font-mono">${esc(vigencia)}</span>
           </div>
           <p class="text-muted text-[12px]" style="margin:0">${unlimited ? t("lic.unlimited.help") : t("lic.pro.help", { soon: soon ? t("lic.pro.soon") : "" })}</p>
         </div>`
        : `<div class="bg-panel border" style="padding:18px 20px;display:flex;flex-direction:column;gap:8px">
           <div style="display:flex;align-items:center;gap:9px">
             <span style="font-size:10px;letter-spacing:.14em;color:var(--dim);border:1px solid var(--line);padding:3px 10px;font-weight:600">${t("lic.badge.free")}</span>
             ${ins?.state === "expired" ? `<span class="text-dim text-[11px] font-mono">${esc(vigencia)}</span>` : ""}
           </div>
           <p class="text-muted text-[12px]" style="margin:0">${ins?.state === "expired" ? t("lic.expired.help") : t("lic.free.help")}</p>
         </div>`;

  const limitsList = [
    [t("lic.limit.contacts"), `${FREE_LIMITS.maxContacts}`],
    [t("lic.limit.messages"), `${FREE_LIMITS.maxMessagesPerMonth}`],
    [t("lic.limit.channels"), `${FREE_LIMITS.maxChannels}`],
    [t("lic.limit.rules"), `${FREE_LIMITS.maxRules}`],
    [t("lic.limit.autoDms"), `${FREE_LIMITS.maxAutoDmsPerMonth}`],
    [t("lic.limit.links"), `${FREE_LIMITS.maxTrackedLinks}`],
    [t("lic.limit.zernio"), `${FREE_LIMITS.maxZernioAccounts}`],
    [t("lic.limit.logs"), t("lic.limit.logsValue", { n: String(FREE_LIMITS.logRetentionDays) })],
  ]
    .map(([k, v]) => `<div style="display:flex;justify-content:space-between;border:1px solid var(--line);background:var(--panel2);padding:7px 10px;font-size:12px"><span class="text-muted">${esc(k)}</span><span class="font-mono text-cream">${esc(v)}</span></div>`)
    .join("");

  // El código de licencia y la tabla de límites del plan gratis no aplican a
  // una instalación fuera del esquema de licencias (INSTALL_UNLIMITED=1).
  const codeCard = unlimited
    ? ""
    : `<div class="bg-panel border" style="padding:18px 20px;display:flex;flex-direction:column;gap:14px">
        <h3 class="font-display font-semibold text-[13.5px] text-cream">${isPro ? t("lic.code.active") : t("lic.code.activate")}</h3>
        ${code ? `<div class="font-mono text-[11px]" style="border:1px solid var(--line);background:var(--bg);padding:10px 12px;color:var(--accent2);word-break:break-all">${esc(code)}</div>` : ""}
        <form method="POST" action="/admin/licencia" style="display:flex;flex-direction:column;gap:10px">
          <input type="text" name="code" placeholder="KOONI-PRO-..." style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none;width:100%">
          <div style="display:flex;gap:8px">
            <button type="submit" style="background:var(--accent);color:var(--on-accent);font-weight:700;border:none;padding:10px 18px;font-size:12.5px;cursor:pointer">${isPro ? t("lic.code.replace") : t("lic.code.activateBtn")}</button>
            ${isPro ? `<button type="submit" name="clear" value="1" style="background:none;border:1px solid var(--bad);color:var(--bad);padding:10px 18px;font-size:12.5px;cursor:pointer">${t("lic.code.remove")}</button>` : ""}
          </div>
        </form>
      </div>`;

  const limitsCard = unlimited
    ? ""
    : `<div class="bg-panel border" style="padding:18px 20px;display:flex;flex-direction:column;gap:10px">
        <h3 class="font-display font-semibold text-[13.5px] text-cream">${t("lic.limits.title")}</h3>
        <div style="display:flex;flex-direction:column;gap:6px">${limitsList}</div>
        <p class="text-dim text-[11px]" style="margin:0">${t("lic.limits.help")}</p>
      </div>`;

  const body = `
    <div style="display:flex;flex-direction:column;gap:18px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <h2 class="font-display font-semibold text-[15px] text-cream">${t("lic.heading")}</h2>
        <p class="text-muted text-[12.5px]">${t("lic.subtitle")}</p>
      </div>
      ${banner}
      ${statusCard}
      ${
        overlay
          ? `<div class="bg-panel border" style="padding:16px 20px;display:flex;flex-direction:column;gap:10px">
               <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">
                 <span style="font-size:10px;letter-spacing:.14em;color:var(--accent);border:1px solid var(--accent);background:var(--accent-soft);padding:3px 10px;font-weight:700">${t("lic.overlay.badge")}</span>
                 <span class="text-dim text-[11px] font-mono">${t("lic.overlay.info", { plan: esc(overlay.plan), state: esc(overlay.estado), modules: (overlay.modules ?? []).length })}</span>
               </div>
               <p class="text-muted text-[12px]" style="margin:0">${t("lic.overlay.lastSync", { date: overlay.syncedAt ? esc(new Date(overlay.syncedAt).toLocaleString("es-MX")) : "—" })}</p>
               <form method="POST" action="/admin/licencia/sync" style="margin:0">
                 <button type="submit" style="background:none;border:1px solid var(--line);color:var(--cream);padding:9px 14px;font-size:12.5px;cursor:pointer">${t("lic.overlay.sync")}</button>
               </form>
             </div>`
          : `<div class="bg-panel border" style="padding:16px 20px;display:flex;flex-direction:column;gap:10px">
               <p class="text-muted text-[12px]" style="margin:0">${t("lic.overlay.none")}</p>
               <form method="POST" action="/admin/licencia/sync" style="margin:0">
                 <button type="submit" style="background:none;border:1px solid var(--line);color:var(--cream);padding:9px 14px;font-size:12.5px;cursor:pointer">${t("lic.overlay.sync")}</button>
               </form>
             </div>`
      }
      ${codeCard}
      ${limitsCard}
    </div>`;

  return layout({ title: t("lic.title"), activeTab: "licencia", body, env });
}
