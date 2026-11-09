// Página PÚBLICA de seguimiento de un pedido (/t/:code). La abre el CLIENTE
// desde el botón "Ver seguimiento" que mandan los avisos del pedido
// (src/orders/notify.ts y src/tools/tomarPedido.ts). No requiere sesión: el
// `track_code` de 6 caracteres ES el token. HTML autocontenido (no usa el layout
// del panel) para que funcione en cualquier dispositivo sin assets externos.
import type { Env } from "../../env";
import { Db } from "../../db/client";
import {
  OrdersRepo,
  ORDER_FLOW,
  ORDER_STATUS_LABEL,
  type Order,
  type OrderStatus,
} from "../../db/orders";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

function money(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? `$${r}` : `$${r.toFixed(2)}`;
}

function fmtDateTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function shell(env: Env, title: string, inner: string): string {
  const accent = (env.BRAND_PRIMARY || "#e05fd8").trim();
  const accentSoft = `color-mix(in srgb, ${accent} 14%, transparent)`;
  const name = (env.BUSINESS_NAME || env.BOT_NAME || "Kooni").trim();
  const logo = env.BRAND_LOGO_URL ? `<img src="${esc(env.BRAND_LOGO_URL)}" alt="" style="max-height:40px;border-radius:var(--r-sm)">` : "";
  return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#0f0e17">
<title>${esc(title)} · ${esc(name)}</title>
<style>
  :root{
    --bg:#0f0e17; --panel:#181624; --panel2:#221d33; --line:#332c48; --linelit:#463c63;
    --cream:#ece9f5; --muted:#a49bbd; --dim:#726a8c;
    --accent:${esc(accent)}; --accent-soft:${accentSoft}; --bad:#fb7185;
    --r-sm:8px; --r-md:10px; --r-lg:12px; --r-xl:14px; --r-pill:999px;
    --mono:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--cream);
    font:15px/1.5 'Sora',ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    -webkit-font-smoothing:antialiased}
  .wrap{max-width:520px;margin:0 auto;padding:22px 16px 48px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r-xl);padding:18px;margin-top:14px}
  .head{display:flex;align-items:center;gap:10px;justify-content:space-between}
  .brand{font-weight:700;font-size:16px;letter-spacing:-.01em}
  .code{font-family:var(--mono);font-weight:700;font-size:26px;letter-spacing:.02em}
  .muted{color:var(--muted)}
  .dim{color:var(--dim)}
  .accent{color:var(--accent)}
  .steps{display:flex;flex-direction:column;gap:0;margin-top:6px}
  .step{display:flex;align-items:flex-start;gap:12px;padding:6px 0}
  .dot{width:14px;height:14px;border-radius:50%;border:2px solid var(--linelit);margin-top:3px;flex:none;background:var(--panel)}
  .step.done .dot{background:var(--accent);border-color:var(--accent)}
  .step.cur .dot{border-color:var(--accent);box-shadow:0 0 0 4px var(--accent-soft)}
  .step .lbl{font-weight:600}
  .step.pend .lbl,.step.pend .when{color:var(--dim)}
  .row{display:flex;justify-content:space-between;gap:12px;padding:4px 0}
  .row.total{border-top:1px solid var(--line);margin-top:6px;padding-top:10px;font-weight:700;font-size:16px}
  .badge{display:inline-block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;
    padding:3px 10px;border-radius:var(--r-pill);border:1px solid var(--accent);color:var(--accent);background:var(--accent-soft)}
  .badge.bad{border-color:var(--bad);color:var(--bad);background:color-mix(in srgb, var(--bad) 12%, transparent)}
  .item{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid var(--panel2)}
  .item:last-child{border-bottom:0}
  .foot{margin-top:22px;text-align:center;font-size:12px;color:var(--dim)}
</style></head>
<body><div class="wrap">
  <div class="head">${logo}<div class="brand">${esc(name)}</div></div>
  ${inner}
  <div class="foot">Seguimiento de pedido · actualiza la página para ver el estado más reciente</div>
</div></body></html>`;
}

function notFound(env: Env): string {
  return shell(env, "Pedido no encontrado", `
    <div class="card">
      <div class="code muted">Pedido no encontrado</div>
      <p class="muted" style="margin:10px 0 0">El código no corresponde a ningún pedido o el enlace está incompleto. Verificalo con el negocio.</p>
    </div>`);
}

/** Renderiza la página de seguimiento. Devuelve HTML + status HTTP. */
export async function renderTrack(env: Env, code: string): Promise<{ status: number; html: string }> {
  const clean = (code || "").trim().toUpperCase();
  if (!clean) return { status: 404, html: notFound(env) };

  const repo = new OrdersRepo(new Db(env.DB));
  const order = await repo.byTrackCode(clean).catch(() => null);
  if (!order) return { status: 404, html: notFound(env) };

  const [items, events] = await Promise.all([
    repo.items(order.id).catch(() => []),
    repo.events(order.id).catch(() => []),
  ]);

  const canceled = order.status === "cancelado";
  // Índice alcanzado por estado (para pintar el avance). Con `cancelado`, el
  // avance llegó hasta el último estado del flujo registrado en los eventos.
  const reached = new Set<OrderStatus>();
  for (const ev of events) if (ev.status !== "cancelado") reached.add(ev.status);
  if (!canceled) reached.add(order.status);
  const maxIdx = ORDER_FLOW.reduce((m, s, i) => (reached.has(s) ? i : m), 0);

  const whenFor = (s: OrderStatus): string => {
    const ev = events.find((e) => e.status === s);
    return ev ? fmtDateTime(ev.at) : "";
  };

  const steps = ORDER_FLOW.map((s, i) => {
    const cls = reached.has(s) ? (i === maxIdx ? "cur" : "done") : "pend";
    const when = whenFor(s);
    return `<div class="step ${cls}">
      <div class="dot"></div>
      <div><div class="lbl">${esc(ORDER_STATUS_LABEL[s])}</div>${when ? `<div class="when dim" style="font-size:12px">${esc(when)}</div>` : ""}</div>
    </div>`;
  }).join("");

  const itemRows = items
    .map(
      (it) => `<div class="item">
        <div>${it.qty}× ${esc(it.name)}${it.notes ? ` <span class="dim" style="font-size:12px">(${esc(it.notes)})</span>` : ""}</div>
        <div class="muted" style="white-space:nowrap">${money(it.qty * it.unit_price)}</div>
      </div>`,
    )
    .join("");

  const entrega = order.address
    ? `<div class="row"><span class="muted">Entrega</span><span style="text-align:right">${esc(order.address)}${order.delivery_zone ? ` <span class="dim">(${esc(order.delivery_zone)})</span>` : ""}</span></div>`
    : `<div class="row"><span class="muted">Entrega</span><span>Retiro en el local</span></div>`;

  const driver =
    order.status === "camino" && order.driver_name
      ? `<div class="row"><span class="muted">Repartidor</span><span>${esc(order.driver_name)}</span></div>`
      : "";

  const stateBadge = canceled
    ? `<span class="badge bad">Cancelado</span>`
    : `<span class="badge">${esc(ORDER_STATUS_LABEL[order.status])}</span>`;

  const inner = `
    <div class="card">
      <div class="head">
        <div class="code">#${esc(order.track_code ?? order.id.slice(0, 6))}</div>
        ${stateBadge}
      </div>
      <div class="dim" style="font-size:12px;margin-top:4px">${esc(fmtDateTime(order.created_at))}</div>
    </div>
    ${canceled ? "" : `<div class="card"><div class="dim" style="font-size:12px;text-transform:uppercase;letter-spacing:.08em">Estado del pedido</div><div class="steps">${steps}</div></div>`}
    <div class="card">
      <div class="dim" style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Tu pedido</div>
      ${itemRows || `<div class="muted">—</div>`}
      <div class="row" style="margin-top:8px"><span class="muted">Subtotal</span><span>${money(order.subtotal)}</span></div>
      <div class="row"><span class="muted">Envío</span><span>${money(order.delivery_fee)}</span></div>
      <div class="row total"><span>Total</span><span>${money(order.total)}</span></div>
    </div>
    <div class="card">
      ${entrega}
      ${driver}
      <div class="row"><span class="muted">Pago</span><span>${esc(order.payment_method || "—")}</span></div>
    </div>`;

  return { status: 200, html: shell(env, `Pedido ${order.track_code ?? ""}`, inner) };
}
