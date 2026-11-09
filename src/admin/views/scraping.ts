// "Scraping" — registro de cada corrida de scraping (Web Sync / Decodo), sea del
// cron nocturno, del botón manual o del endpoint por token. Muestra el resumen
// (cuántos autos hay, cuántos entraron, salieron o cambiaron) y el detalle de
// cada corrida: autos nuevos (con link), vendidos y cambios campo a campo
// (precio, millas, condición, título, link, desglose). Solo lectura.
import type { Env } from "../../env";
import { layout } from "./layout";
import { panelI18n, type T, type MessageKey } from "../i18n";
import { Db } from "../../db/client";
import { SettingsRepo } from "../../db/settings";
import { loadVehicleStore, listStoredVehicles } from "../../kb/inventory";
import { ChangeReviewsRepo, type ChangeReview } from "../../db/changeReviews";
import { emptyState, alertBox, pill as uiPill, iconSubmit } from "./ui";
import { renderScrapeProviders } from "./scrapeProviders";
import {
  WebSyncLogRepo,
  type WebSyncChange,
  type WebSyncRun,
  type WebSyncTrigger,
} from "../../db/webSyncLog";

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!),
  );
}

function fmtWhen(at: number): string {
  return new Date(at).toLocaleString("es", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ago(t: T, ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60_000);
  if (min < 1) return t("scr.now");
  if (min < 60) return t("scr.agoMin", { min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("scr.agoH", { h });
  return t("scr.agoD", { d: Math.floor(h / 24) });
}

const TRIGGER_KEY: Record<WebSyncTrigger, MessageKey> = {
  cron: "scr.trigger.cron",
  manual: "scr.trigger.manual",
  api: "scr.trigger.api",
  rebuild: "scr.trigger.rebuild",
};

function triggerLabel(t: T, trig: string): string {
  const key = TRIGGER_KEY[trig as WebSyncTrigger];
  return key ? t(key) : trig;
}

function triggerBadge(t: T, trig: string): string {
  const kind = trig === "cron" ? "accent" : "dim";
  return uiPill(esc(triggerLabel(t, trig)), kind);
}

function num(n: number | undefined, color: string): string {
  const v = n ?? 0;
  return `<span style="font-family:var(--font-mono,monospace);font-size:12.5px;color:${v > 0 ? color : "var(--dim)"}">${v > 0 ? "+" + v.toLocaleString("es") : "0"}</span>`;
}

function ms(d: number | undefined): string {
  if (!d) return "—";
  return d < 1000 ? `${d} ms` : `${(d / 1000).toFixed(1)} s`;
}

export interface ScrapingQuery {
  run?: string;
  trigger?: string;
  before?: number;
  ok?: string;
  err?: string;
  /** Filtro de validación: pending | confirmed | rejected. */
  rev?: string;
}

const PAGE = 40;

export async function renderScraping(env: Env, q: ScrapingQuery = {}): Promise<string> {
  const { t } = await panelI18n(env);
  const db = new Db(env.DB);
  const repo = new WebSyncLogRepo(db);

  let runs: WebSyncRun[] = [];
  let total = 0;
  let stats = { runs: 0, added: 0, removed: 0, changed: 0, errors: 0 };
  let currentVehicles = 0;
  let settings: Record<string, string> = {};

  try {
    runs = await repo.listRuns({ limit: PAGE + 1, before: q.before, trigger: q.trigger });
    total = await repo.countRuns();
    stats = await repo.stats(Date.now() - 7 * 86_400_000);
    const store = await loadVehicleStore(db);
    currentVehicles = listStoredVehicles(store).length;
    settings = await new SettingsRepo(db).all();
  } catch (e) {
    console.warn("[scraping] no se pudo cargar el registro:", e);
  }

  const hasMore = runs.length > PAGE;
  if (hasMore) runs = runs.slice(0, PAGE);
  const oldestAt = runs.length ? runs[runs.length - 1].at : undefined;

  const selectedId = q.run ?? runs[0]?.id;
  let selected: WebSyncRun | null = runs.find((r) => r.id === selectedId) ?? null;
  if (!selected && selectedId) selected = await repo.getRun(selectedId).catch(() => null);
  let changes: WebSyncChange[] = [];
  if (selected) changes = await repo.listChanges(selected.id).catch(() => [] as WebSyncChange[]);

  // Validación: estado por cambio (confirmado/descartado) + filtro.
  let reviews = new Map<string, ChangeReview>();
  try {
    reviews = await new ChangeReviewsRepo(db).forChangeIds(changes.map((c) => c.id));
  } catch (e) {
    console.warn("[scraping] no se pudieron cargar las validaciones:", e);
  }
  const revFilter = q.rev === "confirmed" || q.rev === "rejected" || q.rev === "pending" ? q.rev : "";
  const reviewState = (id: string): "pending" | "confirmed" | "rejected" => reviews.get(id)?.status ?? "pending";
  const visibleChanges = revFilter ? changes.filter((c) => reviewState(c.id) === revFilter) : changes;

  const qs = (extra: Record<string, string | number | undefined>): string => {
    const p = new URLSearchParams();
    if (q.trigger) p.set("trigger", q.trigger);
    if (q.run) p.set("run", q.run);
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined || v === "") p.delete(k);
      else p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  const flash = q.ok
    ? `<div style="border:1px solid var(--ok);background:var(--ok-soft);color:var(--ok);padding:10px 14px;font-size:12.5px">${esc(q.ok)}</div>`
    : q.err
      ? `<div style="border:1px solid var(--bad);background:var(--bad-soft);color:var(--bad);padding:10px 14px;font-size:12.5px">${esc(q.err)}</div>`
      : "";

  const kpi = (label: string, value: string, sub: string, color = "var(--cream)") => `
    <div class="bg-panel border" style="padding:13px 15px;display:flex;flex-direction:column;gap:2px;min-width:130px;flex:1">
      <span class="text-[10.5px]" style="color:var(--dim);letter-spacing:.08em;text-transform:uppercase">${esc(label)}</span>
      <span class="font-display font-semibold" style="font-size:21px;color:${color}">${esc(value)}</span>
      <span class="text-[11px]" style="color:var(--muted)">${esc(sub)}</span>
    </div>`;

  const lastAt = runs[0]?.at;
  const kpis = `
    <div class="xscroll" style="display:flex;gap:10px;flex-wrap:wrap">
      ${kpi(t("scr.kpi.vehicles"), currentVehicles.toLocaleString("es"), t("scr.kpi.vehiclesSub"))}
      ${kpi(t("scr.kpi.lastRun"), lastAt ? ago(t, lastAt) : "—", lastAt ? fmtWhen(lastAt) : t("scr.kpi.noRuns"))}
      ${kpi(t("scr.kpi.added"), stats.added.toLocaleString("es"), t("scr.kpi.addedSub", { n: stats.runs }), "var(--ok)")}
      ${kpi(t("scr.kpi.removed"), stats.removed.toLocaleString("es"), t("scr.kpi.removedSub"), "var(--warn)")}
      ${kpi(t("scr.kpi.changed"), stats.changed.toLocaleString("es"), t("scr.kpi.changedSub"), "var(--accent2)")}
    </div>`;

  const triggerOptions = ["", "cron", "manual", "api", "rebuild"]
    .map(
      (trig) =>
        `<option value="${trig}"${q.trigger === trig ? " selected" : ""}>${trig === "" ? t("scr.triggerAll") : esc(triggerLabel(t, trig))}</option>`,
    )
    .join("");

  const toolbar = `
    <form method="GET" action="/admin/scraping" class="xscroll"
          style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;background:var(--panel);border:1px solid var(--line);padding:12px 14px">
      <label style="display:flex;flex-direction:column;gap:4px">
        <span class="text-[10.5px]" style="color:var(--dim);letter-spacing:.08em;text-transform:uppercase">${t("scr.filterTrigger")}</span>
        <select name="trigger" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:7px 10px;font-size:12px;outline:none">${triggerOptions}</select>
      </label>
      ${q.run ? `<input type="hidden" name="run" value="${esc(q.run)}">` : ""}
      <button type="submit" class="text-[12px] font-display font-semibold"
              style="border:1px solid var(--line);color:var(--cream);padding:8px 14px;cursor:pointer;background:none">${t("scr.filter")}</button>
      ${
        q.trigger
          ? `<a href="/admin/scraping" class="text-[11.5px]" style="color:var(--dim);padding:8px 4px">${t("scr.clear")}</a>`
          : ""
      }
      <a href="/admin/scraping/export.csv${qs({})}" class="text-[11.5px] font-display font-semibold"
         style="border:1px solid var(--line);color:var(--cream);padding:8px 12px;text-decoration:none">${t("scr.exportCsv")}</a>
      <button type="submit" formmethod="POST" formaction="/admin/scraping/run" class="text-[12px] font-display font-semibold"
              style="margin-left:auto;border:1px solid var(--accent);color:var(--accent);background:none;padding:8px 15px;cursor:pointer">${t("scr.scrapeNow")}</button>
      <button type="submit" formmethod="POST" formaction="/admin/scraping/fichas" class="text-[12px] font-display font-semibold"
              style="border:1px solid var(--line);color:var(--cream);background:none;padding:8px 15px;cursor:pointer">${t("scr.enrich")}</button>
    </form>`;

  const th = (label: string, extra = "") =>
    `<th style="text-align:left;padding:8px 9px;color:var(--dim);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--line);white-space:nowrap;${extra}">${label}</th>`;

  const runRows = runs.length
    ? runs
        .map((r) => {
          const isSel = r.id === selectedId;
          const err = r.errors > 0 ? `<span style="color:var(--bad)">${r.errors}</span>` : `<span style="color:var(--dim)">0</span>`;
          return `<tr style="border-bottom:1px solid var(--line);${isSel ? "background:var(--panel2)" : ""}">
            <td style="padding:9px;vertical-align:top"><span class="font-mono text-[10.5px]" style="color:var(--dim);white-space:nowrap">${esc(fmtWhen(r.at))}</span></td>
            <td style="padding:9px;vertical-align:top">${triggerBadge(t, r.trigger)}</td>
            <td style="padding:9px;vertical-align:top"><span class="font-mono text-[12px] text-cream">${r.vehiclesTotal.toLocaleString("es")}</span></td>
            <td style="padding:9px;vertical-align:top">${num(r.added, "var(--ok)")}</td>
            <td style="padding:9px;vertical-align:top">${num(r.removed, "var(--warn)")}</td>
            <td style="padding:9px;vertical-align:top">${num(r.changed, "var(--accent2)")}</td>
            <td style="padding:9px;vertical-align:top"><span class="font-mono text-[11.5px]">${err}</span></td>
            <td style="padding:9px;vertical-align:top"><span class="font-mono text-[11px]" style="color:var(--muted)">${esc(ms(r.durationMs))}</span></td>
            <td style="padding:9px;vertical-align:top">
              <a href="/admin/scraping${qs({ run: r.id })}" class="text-[11.5px]" style="color:${isSel ? "var(--accent)" : "var(--muted)"}">${isSel ? t("scr.viewing") : t("scr.view")}</a>
            </td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="9" style="text-align:center;color:var(--dim);padding:30px;font-size:13px">
         ${t("scr.runsEmpty")}
       </td></tr>`;

  const runTable = `
    <div class="bg-panel border xscroll" style="padding:6px 8px">
      <table style="width:100%;min-width:860px;border-collapse:collapse">
        <thead><tr>${th(t("scr.th.when"))}${th(t("scr.th.trigger"))}${th(t("scr.th.vehicles"))}${th(t("scr.th.added"))}${th(t("scr.th.removed"))}${th(t("scr.th.changed"))}${th(t("scr.th.errors"))}${th(t("scr.th.duration"))}${th("")}</tr></thead>
        <tbody>${runRows}</tbody>
      </table>
    </div>`;

  // ── Detalle de la corrida seleccionada ─────────────────────────────────────
  const added = visibleChanges.filter((c) => c.kind === "added");
  const removed = visibleChanges.filter((c) => c.kind === "removed");
  const changedRows = visibleChanges.filter((c) => c.kind === "changed");

  const carLink = (c: WebSyncChange, label: string) =>
    c.url
      ? `<a href="${esc(c.url)}" target="_blank" rel="noopener" style="color:var(--cream);text-decoration:none">${esc(label)}</a>`
      : `<span style="color:var(--cream)">${esc(label)}</span>`;

  const listBlock = (title: string, color: string, items: string[], emptyText: string) => `
    <div class="bg-panel border" style="padding:12px 14px;flex:1;min-width:260px">
      <h4 class="font-display font-semibold text-[12.5px]" style="color:${color};margin:0 0 8px">${esc(title)} <span style="color:var(--dim);font-weight:400">(${items.length})</span></h4>
      ${
        items.length
          ? `<div style="display:flex;flex-direction:column;gap:6px;max-height:340px;overflow:auto">${items.join("")}</div>`
          : `<p class="text-[11.5px]" style="color:var(--dim);margin:0">${esc(emptyText)}</p>`
      }
    </div>`;

  const addedItems = added.map(
    (c) =>
      `<div style="font-size:12px;border-left:2px solid var(--ok);padding-left:8px">
         ${carLink(c, c.title ?? t("scr.carFallback"))}
         ${c.vin ? `<span class="font-mono text-[10px]" style="color:var(--dim);display:block">VIN ${esc(c.vin)}</span>` : ""}
       </div>`,
  );
  const removedItems = removed.map(
    (c) =>
      `<div style="font-size:12px;border-left:2px solid var(--warn);padding-left:8px">
         <span style="color:var(--muted);text-decoration:line-through">${esc(c.title ?? t("scr.carFallback"))}</span>
         ${c.vin ? `<span class="font-mono text-[10px]" style="color:var(--dim);display:block">VIN ${esc(c.vin)}</span>` : ""}
       </div>`,
  );

  // Agrupar los cambios por auto (varias filas = varios campos del mismo auto).
  const changedByVehicle = new Map<string, { title: string; url?: string; vin?: string; fields: WebSyncChange[] }>();
  for (const c of changedRows) {
    const k = c.vehicleKey ?? c.title ?? c.id;
    const g = changedByVehicle.get(k) ?? { title: c.title ?? t("scr.carFallback"), url: c.url, vin: c.vin, fields: [] };
    g.fields.push(c);
    changedByVehicle.set(k, g);
  }
  const changedItems = [...changedByVehicle.values()].map((g) => {
    const fields = g.fields
      .map((f) => {
        const st = reviewState(f.id);
        const chip =
          st === "confirmed"
            ? uiPill(t("scr.chip.confirmed"), "ok")
            : st === "rejected"
              ? uiPill(t("scr.chip.rejected"), "bad")
              : uiPill(t("scr.chip.pending"), "dim");
        return `<div class="font-mono text-[10.5px]" style="color:var(--muted);display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="color:var(--dim)">${esc(f.field ?? "")}:</span>
            <span style="color:var(--dim);text-decoration:line-through">${esc(f.oldValue ?? t("scr.emptyValue"))}</span>
            → <span style="color:var(--accent2)">${esc(f.newValue ?? t("scr.emptyValue"))}</span>
            <span style="margin-left:auto;display:inline-flex;align-items:center;gap:4px">
              ${chip}
              <form method="POST" action="/admin/scraping/changes/${encodeURIComponent(f.id)}/review" style="display:inline-flex;gap:4px;margin:0">
                <input type="hidden" name="back" value="${esc(q.run ? `/admin/scraping?run=${encodeURIComponent(q.run)}` : "/admin/scraping")}">
                ${iconSubmit("check", "confirmed", t("scr.chip.confirmed"), "ok")}
                ${iconSubmit("x", "rejected", t("scr.chip.rejected"), "bad")}
                ${st !== "pending" ? iconSubmit("rotate-ccw", "pending", t("scr.chip.pending")) : ""}
              </form>
            </span>
          </div>`;
      })
      .join("");
    return `<div style="font-size:12px;border-left:2px solid var(--accent2);padding-left:8px;display:flex;flex-direction:column;gap:2px">
        ${g.url ? `<a href="${esc(g.url)}" target="_blank" rel="noopener" style="color:var(--cream);text-decoration:none">${esc(g.title)}</a>` : `<span style="color:var(--cream)">${esc(g.title)}</span>`}
        ${fields}
      </div>`;
  });

  const reviewPills = (() => {
    const count = (s: string) => changes.filter((c) => reviewState(c.id) === (s as never)).length;
    const pill = (key: string, label: string, n: number) => {
      const active = revFilter === key;
      const color = active ? "var(--accent)" : "var(--muted)";
      const href = `/admin/scraping${qs({ rev: key || undefined })}`;
      return `<a href="${href}" style="font-size:11px;color:${color};border:1px solid ${color};padding:3px 9px;text-decoration:none">${esc(label)} ${n}</a>`;
    };
    return `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        ${pill("", t("scr.review.all"), changes.length)}
        ${pill("pending", t("scr.review.pending"), count("pending"))}
        ${pill("confirmed", t("scr.review.confirmed"), count("confirmed"))}
        ${pill("rejected", t("scr.review.rejected"), count("rejected"))}
      </div>`;
  })();

  const detail = selected
    ? `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
        <h3 class="font-display font-semibold text-[14px] text-cream">${t("scr.detail.title")}</h3>
        <span class="font-mono text-[11px]" style="color:var(--dim)">${esc(fmtWhen(selected.at))} · ${esc(triggerLabel(t, selected.trigger))} · ${selected.vehiclesTotal.toLocaleString("es")} ${t("scr.detail.autos")} · ${esc(ms(selected.durationMs))}</span>
      </div>
      ${selected.url ? `<p class="font-mono text-[10.5px]" style="color:var(--dim);margin:0;word-break:break-all">${esc(selected.url)}</p>` : ""}
      ${selected.note ? `<p class="text-[11.5px]" style="color:var(--muted);margin:0">${esc(selected.note)}</p>` : ""}
      ${
        selected.errorMsg
          ? alertBox(`${t("scr.detail.error")} ${esc(selected.errorMsg)}`, "bad")
          : ""
      }
      ${
        !selected.errorMsg && changes.length === 0
          ? emptyState(`${selected.trigger === "rebuild" ? t("scr.noChangesRebuild") : t("scr.noChanges")}.`, "check-circle-2")
          : `${reviewPills}
             ${
               visibleChanges.length === 0
                 ? `<p class="text-[12px]" style="color:var(--muted);margin:0">${t("scr.filterEmpty")}</p>`
                 : `<div style="display:flex;gap:10px;flex-wrap:wrap">
                      ${listBlock(t("scr.list.added"), "var(--ok)", addedItems, t("scr.list.none"))}
                      ${listBlock(t("scr.list.removed"), "var(--warn)", removedItems, t("scr.list.none"))}
                      ${listBlock(t("scr.list.changed"), "var(--accent2)", changedItems, t("scr.list.none"))}
                    </div>`
             }`
      }
    </div>`
    : "";

  const more =
    hasMore && oldestAt
      ? `<div style="text-align:center;margin-top:6px">
           <a href="/admin/scraping${qs({ before: oldestAt })}" class="text-[12px] font-display font-semibold"
              style="border:1px solid var(--line);color:var(--cream);padding:9px 18px;text-decoration:none">${t("scr.loadMore")}</a>
         </div>`
      : "";

  const body = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <h2 class="font-display font-semibold text-[15px] text-cream">${t("scr.title")}</h2>
        <p class="text-muted text-[12.5px]">
          ${t("scr.subtitle", { runs: total.toLocaleString("es") })}
        </p>
        <a href="/admin/scraping/inventario" style="font-size:12px;color:var(--accent);text-decoration:none;margin-top:2px">${t("scr.seeInventory")}</a>
      </div>
      ${flash}
      ${renderScrapeProviders(env, settings, t, { compact: true })}
      ${kpis}
      ${toolbar}
      ${runTable}
      ${more}
      ${detail}
    </div>`;

  return layout({ title: t("scr.pageTitle"), activeTab: "scraping", body, env });
}

/** CSV del resumen de corridas (respeta el filtro — tope 500). */
export async function exportScrapingCsv(env: Env, q: ScrapingQuery = {}): Promise<string> {
  const repo = new WebSyncLogRepo(new Db(env.DB));
  const rows = await repo.listRuns({ before: q.before, trigger: q.trigger, limit: 500 }).catch(() => [] as WebSyncRun[]);
  const head = [
    "fecha",
    "disparador",
    "autos",
    "nuevos",
    "salieron",
    "cambios",
    "errores",
    "duracion_ms",
    "url",
    "nota",
    "error",
  ];
  const cell = (v: unknown) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [head.join(",")];
  for (const r of rows) {
    lines.push(
      [
        new Date(r.at).toISOString(),
        r.trigger,
        r.vehiclesTotal,
        r.added,
        r.removed,
        r.changed,
        r.errors,
        r.durationMs ?? "",
        r.url ?? "",
        r.note ?? "",
        r.errorMsg ?? "",
      ]
        .map(cell)
        .join(","),
    );
  }
  return lines.join("\n");
}
