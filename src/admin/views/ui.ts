// Primitivas de UI del panel (pulido 2026-09). Antes cada vista armaba a mano los
// estados vacíos, los avisos y los chips con estilos inline distintos; acá viven
// las clases compartidas definidas en `layout.ts` (GLOBAL_STYLE).
//
// Los íconos son `data-lucide`: el script del layout los re-renderiza después de
// cada swap de htmx, así que funcionan también dentro de fragmentos.

export type AlertKind = "ok" | "warn" | "bad" | "info";
export type PillKind = "ok" | "warn" | "bad" | "accent" | "dim";

const ALERT_ICON: Record<AlertKind, string> = {
  ok: "check-circle-2",
  warn: "alert-circle",
  bad: "alert-triangle",
  info: "info",
};

/** Bloque de estado vacío, centrado y con ícono. `message` ya debe venir escapado. */
export function emptyState(message: string, icon = "inbox"): string {
  return `<div class="empty"><i data-lucide="${icon}" width="22" height="22"></i><div>${message}</div></div>`;
}

/** Aviso (banner) consistente: ok / warn / bad / info. */
export function alertBox(message: string, kind: AlertKind = "info", icon?: string): string {
  const cls = kind === "info" ? "alert" : `alert alert-${kind}`;
  return `<div class="${cls}"><i data-lucide="${icon ?? ALERT_ICON[kind]}" width="15" height="15"></i><div>${message}</div></div>`;
}

/** Chip/pill de estado. `text` ya debe venir escapado. */
export function pill(text: string, kind: PillKind = "dim", icon?: string): string {
  const cls = kind === "dim" ? "pill pill-dim" : `pill pill-${kind}`;
  return `<span class="${cls}">${icon ? `<i data-lucide="${icon}" width="11" height="11"></i>` : ""}${text}</span>`;
}

/** Tarjeta de métrica: valor grande + etiqueta en mayúsculas. */
export function statTile(value: string, label: string): string {
  return `<div class="stat"><div class="v">${value}</div><div class="l">${label}</div></div>`;
}

/** Cabecera de página: título + subtítulo opcional + acciones a la derecha. */
export function pageHead(title: string, sub?: string, actions = ""): string {
  return `<div class="page-head"><div><h2>${title}</h2>${sub ? `<div class="sub">${sub}</div>` : ""}</div>${actions}</div>`;
}

/** Campo de formulario consistente: label + control + ayuda opcional. */
export function field(label: string, control: string, hint?: string): string {
  return `<label class="formrow"><span class="label">${label}</span>${control}${hint ? `<span class="bot-sub">${hint}</span>` : ""}</label>`;
}

/**
 * Botón-ícono de submit dentro de un form existente (mantiene `name="status"` y
 * el `value` que espera el handler).
 */
export function iconSubmit(
  icon: string,
  value: string,
  title: string,
  kind: "ok" | "bad" | "plain" = "plain",
): string {
  const cls = kind === "ok" ? "iconbtn iconbtn-ok" : kind === "bad" ? "iconbtn iconbtn-bad" : "iconbtn";
  return `<button type="submit" class="${cls}" name="status" value="${value}" title="${title}"><i data-lucide="${icon}" width="13" height="13"></i></button>`;
}
