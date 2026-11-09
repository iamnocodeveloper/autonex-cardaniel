// Tab "✦ Mejoras" — la cola del flywheel (F5). El sistema detecta huecos de
// conocimiento y lecciones de los takeovers del dueño, redacta la mejora y la
// propone AQUÍ con su evidencia. Nada se aplica sin el clic del dueño (modo
// manual). Aplicar un kb_entry crea+indexa el doc, aplicar una lección la mete
// al prompt generado como <lecciones_aprendidas>.
import type { Env } from "../../env";
import { Db } from "../../db/client";
import { SuggestionsRepo, type Suggestion } from "../../db/suggestions";
import { SettingsRepo, SETTING_KEYS } from "../../db/settings";
import { getLessons, MAX_LESSONS } from "../../flywheel/detect";
import { layout } from "./layout";
import { panelI18n, type T } from "../i18n";

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!),
  );
}

function ago(t: T, ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60_000);
  if (min < 1) return t("mej.now");
  if (min < 60) return t("mej.agoMin", { min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("mej.agoH", { h });
  return t("mej.agoD", { d: Math.floor(h / 24) });
}

// Pill color per kind — accent2 (amber) is the "AI/insights" token.
function kindBadge(t: T, kind: string): { txt: string; color: string } {
  const map: Record<string, { txt: string; color: string }> = {
    kb_entry: { txt: t("mej.kind.kb"), color: "var(--info)" },
    leccion: { txt: t("mej.kind.lesson"), color: "var(--accent-2)" },
  };
  return map[kind] ?? { txt: kind, color: "var(--muted)" };
}

function statusBadge(t: T, status: string): { txt: string; color: string } {
  const map: Record<string, { txt: string; color: string }> = {
    applied: { txt: t("mej.status.applied"), color: "var(--ok)" },
    dismissed: { txt: t("mej.status.dismissed"), color: "var(--dim)" },
  };
  return map[status] ?? { txt: status, color: "var(--dim)" };
}

function pill(txt: string, color: string): string {
  return `<span style="font-size:9px;letter-spacing:.03em;color:${color};border:1px solid ${color};padding:1px 6px;white-space:nowrap">${txt}</span>`;
}

function suggestionCard(t: T, s: Suggestion): string {
  const kind = kindBadge(t, s.kind);
  let preview = "";
  try {
    const p = JSON.parse(s.payload);
    if (s.kind === "kb_entry" && p.content) {
      preview = `
      <details style="margin-top:8px">
        <summary class="text-[11.5px]" style="color:var(--accent-2);cursor:pointer;list-style:none">${t("mej.previewToggle")}</summary>
        <div class="text-[12.5px] leading-relaxed" style="margin-top:8px;background:var(--panel2);border:1px solid var(--line);padding:12px;white-space:pre-wrap">${esc(String(p.content))}</div>
      </details>`;
    }
  } catch { /* payload preview is best-effort */ }

  return `
  <div class="card bg-panel border border-line" style="padding:18px">
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:6px">
      ${pill(kind.txt, kind.color)}
      <span class="text-dim text-[11px]">${ago(t, s.created_at)}</span>
    </div>
    <div class="font-display font-semibold text-[13.5px] text-cream" style="margin-bottom:4px">${esc(s.title)}</div>
    ${s.evidence ? `<div class="text-muted text-[12px]">${t("mej.evidenceLabel")} ${esc(s.evidence)}</div>` : ""}
    ${preview}
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px">
      <form method="POST" action="/admin/mejoras/${encodeURIComponent(s.id)}/apply">
        <button class="bigbtn font-display font-bold text-[11.5px] cursor-pointer"
                style="background:var(--accent);border:1px solid var(--accent);color:var(--on-accent);box-shadow:var(--shadow);padding:8px 16px">${t("mej.apply")}</button>
      </form>
      <form method="POST" action="/admin/mejoras/${encodeURIComponent(s.id)}/dismiss">
        <button class="ghostbtn cursor-pointer"
                style="background:var(--panel);border:1px solid var(--line);color:var(--muted);padding:8px 16px;font-size:11.5px;transition:all .12s ease">${t("mej.dismiss")}</button>
      </form>
    </div>
  </div>`;
}

export async function renderMejoras(
  env: Env,
  flash?: { found?: string; applied?: boolean; dismissed?: boolean },
): Promise<string> {
  const { t } = await panelI18n(env);
  const db = new Db(env.DB);
  const repo = new SuggestionsRepo(db);
  const [proposed, handled, lessons, autonomyRaw] = await Promise.all([
    repo.listProposed(),
    repo.listHandled(8),
    getLessons(env),
    new SettingsRepo(db).get(SETTING_KEYS.autonomyLevel),
  ]);
  const copilot = autonomyRaw === "copilot";

  const banner = flash?.found !== undefined
    ? `<div style="border:1px solid var(--ok);background:var(--ok-soft);color:var(--ok);padding:10px 14px;font-size:12.5px;margin-bottom:16px">${t(flash.found === "1" ? "mej.searchDoneOne" : "mej.searchDoneMany", { n: esc(flash.found) })}</div>`
    : flash?.applied
      ? `<div style="border:1px solid var(--ok);background:var(--ok-soft);color:var(--ok);padding:10px 14px;font-size:12.5px;margin-bottom:16px">${t("mej.applied")}</div>`
      : flash?.dismissed
        ? `<div style="border:1px solid var(--line);background:var(--panel2);color:var(--muted);padding:10px 14px;font-size:12.5px;margin-bottom:16px">${t("mej.dismissed")}</div>`
        : "";

  const proposedList = proposed.length
    ? proposed.map((s) => suggestionCard(t, s)).join("")
    : `<div class="bg-panel border border-line text-dim text-[12.5px]" style="padding:32px;text-align:center">
         ${t("mej.none")}
       </div>`;

  const lessonRows = lessons.length
    ? lessons
        .map(
          (l) => `
      <div style="display:flex;align-items:start;gap:8px;border-top:1px solid var(--line);padding:8px 0" class="first:border-t-0">
        <span class="text-[12.5px] text-muted" style="flex:1">🎓 ${esc(l)}</span>
        <form method="POST" action="/admin/mejoras/lessons/remove">
          <input type="hidden" name="lesson" value="${esc(l)}">
          <button class="text-dim text-[11px] cursor-pointer" style="background:none;border:none" title="${t("mej.removeLesson")}">✕</button>
        </form>
      </div>`,
        )
        .join("")
    : `<p class="text-dim text-[12px]">${t("mej.noLessons")}</p>`;

  const historyRows = handled.length
    ? handled
        .map((s) => {
          const st = statusBadge(t, s.status);
          const kind = kindBadge(t, s.kind);
          return `
      <div style="display:flex;align-items:center;gap:8px;border-top:1px solid var(--line);padding:8px 0;font-size:12.5px" class="first:border-t-0">
        ${pill(kind.txt, kind.color)}
        <span class="text-muted truncate" style="flex:1">${esc(s.title)}</span>
        ${pill(st.txt, st.color)}
      </div>`;
        })
        .join("")
    : `<p class="text-dim text-[12px]">${t("mej.noHistory")}</p>`;

  const body = `
    ${banner}
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-bottom:16px">
      <div>
        <h2 class="font-display font-semibold text-[15px] text-cream">${t("mej.title")}</h2>
        <p class="text-muted text-[12.5px]" style="margin-top:2px">${
          copilot
            ? t("mej.subCopilot")
            : t("mej.subManual")
        }</p>
      </div>
      <form method="POST" action="/admin/mejoras/run" style="margin-left:auto">
        <button class="bigbtn font-display font-bold text-[12.5px] cursor-pointer"
                style="background:var(--accent);border:1px solid var(--accent);color:var(--on-accent);box-shadow:var(--shadow);padding:9px 16px;display:flex;align-items:center;gap:8px;white-space:nowrap">
          <i data-lucide="sparkles" width="14" height="14"></i> ${t("mej.searchNow")}
        </button>
      </form>
    </div>

    <div class="bg-panel border border-line" style="padding:14px 18px;margin-bottom:16px;display:flex;flex-wrap:wrap;align-items:center;gap:12px">
      <div style="flex:1;min-width:220px">
        <div class="font-display font-semibold text-[13px] text-cream" style="display:flex;align-items:center;gap:8px">
          <i data-lucide="moon" width="13" height="13"></i> ${t("mej.nightMode")}
          ${copilot ? pill(t("mej.pillCopilot"), "var(--ok)") : pill(t("mej.pillManual"), "var(--dim)")}
        </div>
        <p class="text-dim text-[11.5px]" style="margin-top:4px">
          ${t("mej.copilotDesc")}
        </p>
      </div>
      <form method="POST" action="/admin/mejoras/autonomy">
        <input type="hidden" name="level" value="${copilot ? "manual" : "copilot"}">
        <button class="ghostbtn cursor-pointer" style="background:${copilot ? "var(--panel)" : "var(--accent)"};border:1px solid ${copilot ? "var(--line)" : "var(--accent)"};color:${copilot ? "var(--muted)" : "var(--on-accent)"};padding:9px 16px;font-size:11.5px;font-weight:${copilot ? "400" : "700"};white-space:nowrap">
          ${copilot ? t("mej.backToManual") : t("mej.enableCopilot")}
        </button>
      </form>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:24px">${proposedList}</div>

    <div style="display:grid;grid-template-columns:1fr;gap:16px" class="md:grid-cols-2">
      <div class="bg-panel border border-line" style="padding:18px">
        <div class="font-display font-semibold text-[13.5px] text-cream" style="margin-bottom:8px">${t("mej.lessonsTitle")} <span class="text-dim" style="font-weight:400;font-size:11px">(${lessons.length}/${MAX_LESSONS})</span></div>
        <p class="text-dim text-[11.5px]" style="margin-bottom:12px">${t("mej.lessonsSub")}</p>
        ${lessonRows}
      </div>
      <div class="bg-panel border border-line" style="padding:18px">
        <div class="font-display font-semibold text-[13.5px] text-cream" style="margin-bottom:8px">${t("mej.history")}</div>
        ${historyRows}
      </div>
    </div>`;

  return layout({ title: t("mej.pageTitle"), activeTab: "mejoras", body, env });
}
