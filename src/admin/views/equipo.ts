// "Equipo" — entrega el panel a tu gente sin darles tu contraseña: invitás con su
// correo y su rol, y entran con su propio acceso. (La tabla `admin_emails` ya
// existía; acá se gestiona. El login por persona llega en el siguiente paso.)
import type { Env } from "../../env";
import { Db } from "../../db/client";
import { AdminEmailsRepo, type AdminEmail } from "../../db/adminEmails";
import { layout } from "./layout";
import { panelI18n } from "../i18n";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

export async function renderEquipo(env: Env, msg?: string, isError?: boolean): Promise<string> {
  const { t } = await panelI18n(env);
  const repo = new AdminEmailsRepo(new Db(env.DB));
  const list = (await repo.list().catch(() => [])) as AdminEmail[];

  const banner = msg
    ? `<div style="border:1px solid ${isError ? "var(--bad)" : "var(--ok)"};color:${isError ? "var(--bad)" : "var(--ok)"};padding:10px 14px;font-size:12px;background:${isError ? "var(--bad-soft)" : "var(--ok-soft)"}">${esc(msg)}</div>`
    : "";

  const rows =
    list.length === 0
      ? `<div class="text-muted text-[12.5px]">${t("eq.empty")}</div>`
      : list
          .map(
            (m) => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--line);background:var(--panel2);padding:10px 12px">
          <div style="min-width:0">
            <div class="font-mono text-[12.5px] text-cream">${esc(m.email)}</div>
            <div class="text-muted text-[11px]">${m.role === "owner" ? t("eq.role.owner") : t("eq.role.staff")}</div>
          </div>
          <form method="POST" action="/admin/equipo/remove" style="margin:0">
            <input type="hidden" name="email" value="${esc(m.email)}">
            <button type="submit" class="text-[11px] font-display font-semibold cursor-pointer"
                    style="border:1px solid var(--bad);color:var(--bad);padding:6px 12px;background:none">${t("eq.remove")}</button>
          </form>
        </div>`,
          )
          .join("");

  const body = `
    <div style="display:flex;flex-direction:column;gap:18px;max-width:820px">
      ${banner}
      <div style="display:flex;flex-direction:column;gap:3px">
        <h2 class="font-display font-semibold text-[15px] text-cream">${t("eq.heading")}</h2>
        <p class="text-muted text-[12.5px]">${t("eq.subtitle")}</p>
      </div>

      <form method="POST" action="/admin/equipo/add" style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px;border:1px solid var(--line);background:var(--panel);padding:14px">
        <div style="display:flex;flex-direction:column;gap:5px;flex:1;min-width:220px">
          <label class="text-[11px] text-dim">${t("eq.emailLabel")}</label>
          <input type="email" name="email" required placeholder="${t("eq.emailPh")}"
                 style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:9px 11px;font-size:12.5px;outline:none">
        </div>
        <div style="display:flex;flex-direction:column;gap:5px">
          <label class="text-[11px] text-dim">${t("eq.roleLabel")}</label>
          <select name="role" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:9px 11px;font-size:12.5px;outline:none">
            <option value="staff">${t("eq.roleOpt.staff")}</option>
            <option value="owner">${t("eq.roleOpt.owner")}</option>
          </select>
        </div>
        <button type="submit" class="font-display font-semibold text-[12.5px] cursor-pointer"
                style="background:var(--accent);border:1px solid var(--accent);color:var(--on-accent);padding:10px 16px">${t("eq.add")}</button>
      </form>

      <div style="display:flex;flex-direction:column;gap:8px">
        <h3 class="font-display font-semibold text-[13px] text-cream">${t("eq.members")}</h3>
        ${rows}
      </div>
    </div>`;

  return layout({ title: t("eq.title"), activeTab: "equipo", body, env });
}
