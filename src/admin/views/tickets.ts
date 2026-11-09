import type { Env } from "../../env";
import { Db } from "../../db/client";
import { TicketsRepo } from "../../db/tickets";
import { ConversationsRepo } from "../../db/conversations";
import { MessagesRepo } from "../../db/messages";
import { ConversationLabelsRepo, labelMeta } from "../../db/conversationLabels";
import { layout } from "./layout";
import { fmtDateTime } from "../format";
import { panelI18n, type T } from "../i18n";

const STATUS_PILL: Record<string, string> = {
  open: "var(--bad)",
  in_progress: "var(--info)",
};

function roleLabel(t: T, role: string | undefined): string {
  switch (role) {
    case "user":
      return t("tk.roleUser");
    case "assistant":
      return t("tk.roleAssistant");
    case "owner":
      return t("tk.roleOwner");
    case "system":
      return t("tk.roleSystem");
    default:
      return role ?? "";
  }
}

function esc(v: string | null | undefined): string {
  return (v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function renderTickets(env: Env): Promise<string> {
  const { t } = await panelI18n(env);
  const db = new Db(env.DB);
  const repo = new TicketsRepo(db);
  const open = await repo.listOpen();
  const convs = new ConversationsRepo(db);
  const msgs = new MessagesRepo(db);
  const labelsRepo = new ConversationLabelsRepo(db);

  // Etiquetas de todas las conversaciones con ticket, en una query.
  const labelMap = await labelsRepo
    .byConversationIds(open.map((tk) => tk.conversation_id ?? "").filter(Boolean))
    .catch(() => ({}) as Record<string, string[]>);

  const cards = await Promise.all(
    open.map(async (tk) => {
      const date = fmtDateTime(tk.created_at);
      const pillColor = STATUS_PILL[tk.status] ?? "var(--muted)";
      const conv = tk.conversation_id
        ? await convs.getById(tk.conversation_id).catch(() => null)
        : null;
      const labels = tk.conversation_id ? labelMap[tk.conversation_id] ?? [] : [];
      const chips = labels
        .map((l) => {
          const m = labelMeta(l);
          return `<span class="text-[10px]" style="color:${m.color};border:1px solid ${m.color};padding:1px 7px;letter-spacing:.04em;white-space:nowrap">${esc(m.name)}</span>`;
        })
        .join("");

      const quien = conv?.display_name || conv?.channel_user_id || "—";
      const canal = conv ? `${esc(conv.channel)} · ${esc(conv.channel_user_id)}` : t("tk.noConv");

      // Extracto del hilo (los últimos mensajes) — para no depender del
      // transcript guardado, que puede venir vacío.
      const last = tk.conversation_id
        ? await msgs.lastN(tk.conversation_id, 8).catch(() => [])
        : [];
      const hilo = last
        .map(
          (m) =>
            `<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--line)">` +
            `<span class="text-dim text-[10.5px]" style="flex:none;width:56px">${esc(roleLabel(t, m.role))}</span>` +
            `<span class="text-muted text-[11.5px]" style="white-space:pre-wrap">${esc(m.content.slice(0, 400))}</span></div>`,
        )
        .join("");

      return `<div class="tkcard bg-panel border border-line" style="padding:16px 18px;margin-bottom:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap">
            <span style="font-size:9px;letter-spacing:.05em;text-transform:uppercase;color:${pillColor};border:1px solid ${pillColor};padding:1px 6px;flex:none">${esc(tk.status.toUpperCase())}</span>
            <span class="font-display font-semibold text-[13px] text-cream truncate">${esc(tk.category)}</span>
            ${chips}
          </div>
          <span class="text-dim text-[11px]" style="flex:none">${date}</span>
        </div>

        <div style="margin:0 0 8px">
          <div class="text-cream text-[12.5px]" style="font-weight:600">${esc(quien)}</div>
          <div class="text-dim text-[10.5px] font-mono">${canal}</div>
        </div>

        <p class="text-muted text-[12.5px] leading-relaxed" style="margin:0 0 10px;white-space:pre-wrap">${esc(tk.summary)}</p>

        ${
          hilo
            ? `<details style="margin-bottom:10px">
                 <summary class="text-dim text-[11px]" style="cursor:pointer">${t("tk.viewConv", { n: last.length })}</summary>
                 <div style="margin-top:6px;border:1px solid var(--line);background:var(--bg);padding:8px 10px">${hilo}</div>
               </details>`
            : ""
        }

        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          ${
            tk.conversation_id
              ? `<a href="/admin/conversations?c=${encodeURIComponent(tk.conversation_id)}" class="text-accent" style="font-size:11.5px;text-decoration:none;border:1px solid var(--accent);padding:7px 13px">${t("tk.openConv")}</a>`
              : ""
          }
          <form method="POST" action="/admin/tickets/${tk.id}/resolve" style="display:flex;gap:8px;flex:1;min-width:260px">
            <input name="resolved_by" placeholder="${t("tk.emailPlaceholder")}" required
                   style="flex:1;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:9px 12px;font-size:12.5px;outline:none">
            <button class="bigbtn font-display font-bold text-[11.5px] cursor-pointer"
                    style="background:var(--accent);border:1px solid var(--accent);color:var(--on-accent);box-shadow:var(--shadow);padding:9px 16px">${t("tk.resolve")}</button>
          </form>
        </div>
      </div>`;
    }),
  );

  const body =
    open.length === 0
      ? `<div class="bg-panel border border-line" style="padding:40px 18px;text-align:center">
           <p class="text-dim text-[12.5px]">${t("tk.empty")}</p>
         </div>`
      : cards.join("");

  return layout({ title: t("tk.title"), activeTab: "tickets", body, env });
}
