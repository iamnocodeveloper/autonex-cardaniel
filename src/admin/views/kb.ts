// Tab "Conocimiento" — la KB editable desde el dashboard (F4).
//
// El dueño escribe documentos (horarios, políticas, FAQ, promos) y quedan
// indexados en Vectorize AL GUARDAR: el bot los usa vía searchKb desde el
// siguiente mensaje. Los fragmentos precargados del repo conviven con estos.
import type { Env } from "../../env";
import { Db } from "../../db/client";
import { KbDocsRepo, FIXTURE_CHUNKS, MAX_DOC_CHARS, chunkContent, type KbDoc } from "../../kb/docs";
import { KB_MIN_SCORE_DEFAULT, resolveKbMinScore } from "../../kb/query";
import { layout } from "./layout";
import { panelI18n, makeT, type T } from "../i18n";

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!),
  );
}

function ago(t: T, ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60_000);
  if (min < 1) return t("kb.ago.now");
  if (min < 60) return t("kb.ago.min", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("kb.ago.hour", { n: h });
  return t("kb.ago.day", { n: Math.floor(h / 24) });
}

/** Callout banner. `tone` picks the token: ok=verde (éxito), bad=rojo (error), neutral=gris (info). */
function banner(tone: "ok" | "bad" | "neutral", text: string): string {
  const color = tone === "ok" ? "var(--ok)" : tone === "bad" ? "var(--bad)" : "var(--dim)";
  const bg = tone === "ok" ? "var(--ok-soft)" : tone === "bad" ? "var(--bad-soft)" : "var(--panel2)";
  return `<div style="border:1px solid ${color};background:${bg};color:${tone === "neutral" ? "var(--muted)" : color};padding:10px 14px;font-size:12.5px;margin-bottom:16px">${text}</div>`;
}

export async function renderKbList(
  env: Env,
  flash?: { saved?: boolean; deleted?: boolean; reindexed?: string; websync?: string; minscore?: string },
): Promise<string> {
  const { t } = await panelI18n(env);
  const docs = await new KbDocsRepo(new Db(env.DB)).list();

  // Web sync está disponible en todos los planes (solo pide DECODO_AUTH).
  const webSyncOn = true;
  const minScore = await resolveKbMinScore(env);

  const bannerHtml = flash?.saved
    ? banner("ok", t("kb.flash.saved"))
    : flash?.deleted
      ? banner("neutral", t("kb.flash.deleted"))
      : flash?.reindexed
        ? banner("ok", t("kb.flash.reindexed", { n: esc(flash.reindexed) }))
        : flash?.websync
          ? banner("ok", t("kb.flash.websync", { n: esc(flash.websync) }))
          : flash?.minscore
            ? banner("ok", t("kb.flash.minscore", { n: esc(flash.minscore) }))
            : "";

  const rows = docs.length
    ? docs
        .map((d) => {
          const chunks = chunkContent(d.content).length;
          return `
      <div class="kbrow" style="display:flex;align-items:center;gap:12px;padding:13px 18px;border-top:1px solid var(--line);transition:background .12s ease">
        <div style="min-width:0;flex:1">
          <a href="/admin/kb/${encodeURIComponent(d.id)}/edit" class="font-display font-semibold text-[13px] text-cream" style="display:block">${esc(d.title)}</a>
          <div class="text-dim text-[11.5px]" style="margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.content.replace(/\s+/g, " ").slice(0, 90))}</div>
        </div>
        <div class="text-dim text-[10.5px]" style="text-align:right;white-space:nowrap;flex:none">
          <div>${t("kb.row.chars", { n: d.content.length.toLocaleString("es-MX") })} · ${chunks === 1 ? t("kb.row.chunksOne", { n: chunks }) : t("kb.row.chunksOther", { n: chunks })}</div>
          <div>${ago(t, d.updated_at)}</div>
        </div>
        <a href="/admin/kb/${encodeURIComponent(d.id)}/edit" class="kbedit" style="border:1px solid var(--line);color:var(--muted);padding:5px 12px;font-size:11px;white-space:nowrap;transition:all .12s ease;flex:none">${t("kb.row.edit")}</a>
      </div>`;
        })
        .join("")
    : `<div class="text-dim text-[12.5px]" style="padding:40px 18px;text-align:center">
         ${t("kb.empty")}
       </div>`;

  const body = `
    ${bannerHtml}
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-bottom:16px">
      <div>
        <h2 class="font-display font-semibold text-[15px] text-cream">${t("kb.head.title")}</h2>
        <p class="text-muted text-[12.5px]" style="margin-top:2px">${t("kb.head.subtitle")}</p>
      </div>
      <a href="/admin/kb/new" class="bigbtn font-display font-bold text-[12.5px] cursor-pointer"
         style="margin-left:auto;background:var(--accent);border:1px solid var(--accent);color:var(--on-accent);box-shadow:var(--shadow);padding:9px 16px;display:flex;align-items:center;gap:8px;white-space:nowrap">
        <i data-lucide="plus" width="14" height="14"></i> ${t("kb.doc.new")}
      </a>
    </div>

    <div class="bg-panel border border-line" style="margin-bottom:16px;overflow:hidden">
      ${rows}
    </div>

    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-bottom:16px" class="text-dim text-[11.5px]">
      <span>${t("kb.fixtures", { n: FIXTURE_CHUNKS.length })}</span>
      <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
        ${
          webSyncOn
            ? `<form method="POST" action="/admin/kb/web-sync">
                 <button class="ghostbtn cursor-pointer" title="${t("kb.websync.title")}" style="display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line);color:var(--muted);padding:8px 14px;font-size:11.5px;transition:all .12s ease">
                   <i data-lucide="globe" width="13" height="13"></i> ${t("kb.websync.button")}
                 </button>
               </form>`
            : ""
        }
        <form method="POST" action="/admin/kb/reindex">
          <button class="ghostbtn cursor-pointer" style="display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line);color:var(--muted);padding:8px 14px;font-size:11.5px;transition:all .12s ease">
            <i data-lucide="refresh-cw" width="13" height="13"></i> ${t("kb.reindex.button")}
          </button>
        </form>
      </div>
    </div>

    <div class="bg-panel border border-line" style="padding:16px">
      <h3 class="font-display font-semibold text-[13px] text-cream">${t("kb.search.title")}</h3>
      <p class="text-dim text-[11.5px]" style="margin:2px 0 10px">${t("kb.search.desc", { thr: minScore.toFixed(2) })}</p>
      <input type="search" name="q" placeholder="${t("kb.search.placeholder")}"
             hx-get="/admin/kb/search" hx-trigger="keyup changed delay:400ms, search"
             hx-target="#kb-search-out" hx-swap="innerHTML"
             style="width:100%;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none">
      <div id="kb-search-out" style="margin-top:12px"></div>
      <form method="POST" action="/admin/kb/min-score" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;align-items:center;gap:8px">
        <label for="kb_min_score" class="text-dim text-[11px]">${t("kb.search.thresholdLabel")}</label>
        <input type="number" id="kb_min_score" name="kb_min_score" min="0" max="1" step="0.01"
               value="${minScore.toFixed(2)}"
               style="width:80px;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:12px;outline:none">
        <button type="submit" class="ghostbtn cursor-pointer" style="background:var(--panel);border:1px solid var(--line);color:var(--muted);padding:6px 12px;font-size:11px">${t("common.save")}</button>
        <span class="text-dim text-[10.5px]">${t("kb.search.defaultHint", { d: KB_MIN_SCORE_DEFAULT.toFixed(2) })}</span>
      </form>
    </div>`;

  return layout({ title: t("kb.title"), activeTab: "kb", body, env });
}

/** Fragmento HTMX: resultados de "probar búsqueda" en /admin/kb. */
export function renderKbSearchResults(
  query: string,
  res: import("../../kb/query").KbQueryResult | null,
  minScore: number = KB_MIN_SCORE_DEFAULT,
  t: T = makeT("es"),
): string {
  if (!query || query.length < 2) return "";
  if (!res || "error" in res) {
    return `<div class="text-dim text-[11.5px]">${t("kb.search.error")}</div>`;
  }
  if (res.results.length === 0) {
    return `<div style="border:1px solid var(--line);background:var(--panel2);padding:10px 12px;font-size:12px;color:var(--muted)">
      ${t("kb.search.empty")}
    </div>`;
  }
  const top = res.results[0]?.score ?? 0;
  const verdict =
    top >= minScore
      ? `<span style="color:var(--ok)">${t("kb.search.verdictOk", { score: top.toFixed(2), thr: minScore.toFixed(2) })}</span>`
      : `<span style="color:var(--bad)">${t("kb.search.verdictBad", { score: top.toFixed(2), thr: minScore.toFixed(2) })}</span>`;
  const rows = res.results
    .map((r) => {
      const c = r.score >= minScore ? "var(--ok)" : r.score >= minScore * 0.8 ? "var(--accent-2)" : "var(--dim)";
      return `<div style="border-top:1px solid var(--line);padding:9px 0">
        <div style="display:flex;gap:10px;align-items:baseline">
          <span style="font-family:'IBM Plex Mono';font-size:12px;font-weight:700;color:${c};flex:none">${r.score.toFixed(2)}</span>
          <span class="text-cream text-[12px] font-semibold">${esc(r.title || t("kb.untitled"))}</span>
        </div>
        <div class="text-dim text-[11px]" style="margin-top:3px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(r.content.replace(/\s+/g, " ").slice(0, 180))}</div>
      </div>`;
    })
    .join("");
  return `<div style="font-size:11.5px;margin-bottom:6px">${verdict}</div>
    <div style="border:1px solid var(--line);background:var(--bg);padding:2px 12px 8px">${rows}</div>`;
}

export async function renderKbEditor(doc: KbDoc | null, env: Env): Promise<string> {
  const { t } = await panelI18n(env);
  const isNew = doc === null;
  const body = `
    <div style="margin-bottom:16px">
      <a href="/admin/kb" style="font-size:12.5px;display:inline-flex;align-items:center;gap:6px">
        <i data-lucide="arrow-left" width="14" height="14"></i> ${t("kb.editor.back")}
      </a>
    </div>
    <form method="POST" action="/admin/kb/save" class="bg-panel border border-line" style="padding:22px;display:flex;flex-direction:column;gap:18px">
      <h2 class="font-display font-semibold text-[15px] text-cream">${isNew ? t("kb.editor.new") : t("kb.editor.edit")}</h2>
      ${isNew ? "" : `<input type="hidden" name="id" value="${esc(doc.id)}">`}

      <div style="display:flex;flex-direction:column;gap:6px">
        <label for="title" class="font-display font-semibold text-[12.5px] text-cream">${t("kb.editor.titleLabel")}</label>
        <p class="text-dim text-[11px]">${t("kb.editor.titleHint")}</p>
        <input type="text" id="title" name="title" required maxlength="200"
               value="${esc(doc?.title ?? "")}" placeholder="${t("kb.editor.titlePlaceholder")}"
               style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none">
      </div>

      <div style="display:flex;flex-direction:column;gap:6px">
        <label for="content" class="font-display font-semibold text-[12.5px] text-cream">${t("kb.editor.contentLabel")}</label>
        <p class="text-dim text-[11px]">${t("kb.editor.contentHint", { n: MAX_DOC_CHARS.toLocaleString("es-MX") })}</p>
        <textarea id="content" name="content" rows="14" required maxlength="${MAX_DOC_CHARS}"
                  placeholder="${t("kb.editor.contentPlaceholder")}"
                  style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none;resize:vertical">${esc(doc?.content ?? "")}</textarea>
      </div>

      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px">
        <button type="submit" class="bigbtn font-display font-bold text-[12.5px] cursor-pointer"
                style="background:var(--accent);border:1px solid var(--accent);color:var(--on-accent);box-shadow:var(--shadow);padding:11px 20px">${t("kb.editor.save")}</button>
        ${isNew ? "" : `
        <details style="margin-left:auto">
          <summary class="text-bad text-[12px]" style="cursor:pointer;list-style:none">${t("kb.editor.delete")}</summary>
          <span style="display:inline-flex;align-items:center;gap:10px;margin-top:8px">
            <span class="text-dim text-[11px]">${t("kb.editor.deleteConfirm")}</span>
            <button type="submit" formaction="/admin/kb/${encodeURIComponent(doc.id)}/delete" formnovalidate
                    style="background:transparent;border:1px solid var(--bad);color:var(--bad);padding:6px 12px;font-size:11px;cursor:pointer">${t("kb.editor.deleteYes")}</button>
          </span>
        </details>`}
      </div>
    </form>`;

  return layout({ title: isNew ? t("kb.editor.newTitle") : t("kb.editor.editTitle"), activeTab: "kb", body, env });
}
