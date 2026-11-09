# Kooni Admin — Design System

> **Estado 2026-11:** identidad **morado/fucsia**, tipografía **Sora + IBM Plex Mono**,
> tema **claro + oscuro** con toggle. La fuente de verdad de tokens y tipografía es
> `src/admin/views/layout.ts` (`GLOBAL_STYLE` y `HEAD_ASSETS`); la marca está en
> [`IDENTIDAD-KOONI.md`](./IDENTIDAD-KOONI.md). Este documento describe ese sistema,
> no una versión anterior.

Stack: **sin build step**. Las vistas son template strings de TypeScript → HTML,
estiladas con utilidades de **Tailwind CDN** (mapeadas a los tokens) y/o
`style="…"` con variables CSS. **htmx 2** maneja la interactividad.

---

## 1. Tokens

Cada color existe dos veces: como **CSS custom property** (para `style="…"`) y como
color de **Tailwind** (para `class="…"`). Ambos apuntan al mismo valor.

| CSS var | Tailwind | Oscuro | Claro | Uso |
|---|---|---|---|---|
| `--bg` | `bg-bg` | `#0f0e17` | `#faf7fe` | Fondo de página |
| `--panel` | `bg-panel` | `#181624` | `#ffffff` | Tarjeta / sidebar / header |
| `--panel2` | `bg-panel2` | `#221d33` | `#f4eefc` | Hover, filas, inputs sobre panel |
| `--raise` | `bg-raise` | `#2f2745` | `#ece2fa` | Chips/avatares elevados |
| `--line` | `border-line` | `#332c48` | `#e7ddf4` | Borde por defecto |
| `--linelit` | `border-linelit` | `#463c63` | `#d3c4ec` | Borde iluminado |
| `--accent` | `text-accent` `bg-accent` | `#e05fd8` | `#c31fce` | Marca: acciones y activo |
| `--accent-soft` | `bg-accent-soft` | `rgba(224,95,216,.14)` | `rgba(195,31,206,.09)` | Fondo tenue del acento |
| `--accent-2` | `text-accent2` | `#a679f6` | `#8b3ff0` | Secundario (IA/insights) |
| `--on-accent` | `text-on-accent` | `#170f1c` | `#ffffff` | Texto sobre el acento |
| `--cream` | `text-cream` | `#ece9f5` | `#211c33` | Texto principal |
| `--muted` | `text-muted` | `#a49bbd` | `#5c5473` | Texto secundario |
| `--dim` | `text-dim` | `#726a8c` | `#8b83a3` | Texto terciario / labels |
| `--ok` `--ok-soft` | `text-ok` | `#34d399` | `#059669` | Éxito / en línea |
| `--warn` `--warn-soft` | `text-warn` | `#f0b34a` | `#b45309` | Advertencia |
| `--bad` `--bad-soft` | `text-bad` | `#fb7185` | `#e11d48` | Error / peligro |
| `--info` | `text-info` | `#6aa9fb` | `#2563eb` | Información |
| `--violet` | `text-violet` | `#a78bfa` | `#7c3aed` | Nodos del canvas de flujo |
| `--shadow` | — | sombra suave | sombra violeta suave | Elevación (nunca `Npx Npx 0`) |
| `--font-display` | `font-display` | Sora | Sora | Títulos y cuerpo |
| `--font-mono` | `font-mono` | IBM Plex Mono | IBM Plex Mono | Datos, código, etiquetas |

**Escala compartida** (en `:root`): `--r-sm:8px`, `--r-md:10px`, `--r-lg:12px`,
`--r-xl:14px`, `--r-pill:999px`; `--sp-1:6px`, `--sp-2:10px`, `--sp-3:14px`,
`--sp-4:22px`.

**Reglas**
- Usa `var(--token)` o la utilidad Tailwind. **Nunca** hex/rgba literales en una vista.
- Sobre `--accent`, el texto va en `var(--on-accent)`.
- `ok` / `warn` / `bad` son semánticos: no son “el acento”.
- Sombras: `var(--shadow)`. Las sombras duras del look anterior están retiradas.
- Radios: usar los tokens de la escala, no números sueltos.

Alias heredados (`--border`, `--border-lit`, `--green`, `--blue`, `--red`) siguen
definidos para que snippets viejos no se rompan; en código nuevo usa los nombres
de la tabla.

---

## 2. Tipografía

| Rol | Familia | Fallback |
|---|---|---|
| Display / títulos / cuerpo | **Sora** 400–800 | `ui-sans-serif, system-ui, sans-serif` |
| Mono / datos / código | **IBM Plex Mono** 400–600 | `ui-monospace, monospace` |

- Títulos: Sora 700/800, `letter-spacing` entre `-.02em` y `-.03em`.
- El cuerpo también es Sora. La mono queda para números, tablas, etiquetas y código.
- Cargadas desde Google Fonts en `HEAD_ASSETS` (sin build step).

Jerarquía:

| Rol | Receta |
|---|---|
| Título de página | lo renderiza el shell — **no lo repitas** (§6) |
| Encabezado de sección | `font-display font-semibold text-[15px] text-cream` |
| Número grande | `font-display font-bold text-[30px] leading-none` |
| Cuerpo | `text-[12.5px] text-muted leading-relaxed` |
| Label / caption | `text-[10px] tracking-[.2em] uppercase text-dim` |

---

## 3. Shell (`layout.ts`)

| Clase | Qué |
|---|---|
| `.shell` | Grid `248px 1fr`; en móvil una columna con drawer |
| `.sb`, `.sb-nav`, `.sb-sec`, `.navlink` | Sidebar y navegación agrupada |
| `.sb-brand`, `.brand-row`, `.brand-mark`, `.brand-name`, `.brand-sub` | Cuadro de marca |
| `.sb-foot`, `.bot-card`, `.bot-avatar`, `.bot-title`, `.bot-sub` | Pie con estado del bot |
| `.headerbar` | Header sticky |
| `.crumb`, `.page-title` | Migaja y título de la página |
| `.iconctl` | Botón-ícono del header (tema, push) |
| `.langsel` | Selector de idioma |
| `.logoutlink` | Enlace de cerrar sesión |
| `.projsel` | Selector de proyectos (`PEER_BOTS`) |
| `.main-area` | Contenedor de contenido |
| `.hburger`, `.nav-backdrop` | Drawer móvil |

---

## 4. Componentes y primitivas

### 4.1 Estructura de contenido
- `.page-head` — cabecera de página: título + subtítulo + acciones.
- `.toolbar` — fila de filtros/acciones.
- `.card` — superficie de tarjeta (conserva la animación `rise`).
- `.stat` — tarjeta de métrica: `.v` (valor) + `.l` (label).
- `.tblwrap` / `.xscroll` — tabla con scroll horizontal.
- `.tabs` / `.tab` (`.active` o `aria-current="page"`) — sub-pestañas.

### 4.2 Formularios
- `.formrow` — columna label + control + ayuda.
- `.label` — etiqueta en mayúsculas.
- `.input` / `.select` — controles consistentes (foco en `--accent`).

### 4.3 Botones
- `.bigbtn` — acción principal (fondo `--accent`, texto `--on-accent`, `--shadow`).
- `.ghostbtn` — secundaria (borde; hover con `--accent-soft`).
- `.iconbtn` (+ `-ok` / `-bad`) — botón-ícono de 26px.
- `.chip` — chip interactivo.

Receta del botón principal:

```html
<button class="bigbtn font-display font-bold text-[12.5px] cursor-pointer"
  style="background:var(--accent);border:1px solid var(--accent);color:var(--on-accent);padding:11px 16px;display:flex;align-items:center;gap:8px">
  <i data-lucide="check" width="16" height="16"></i> Guardar
</button>
```

`.bigbtn` ya aplica `--shadow` y el hover/active. Variante compacta:
`padding:8px 16px`.

### 4.4 Estado
- `.pill` (+ `-ok` / `-warn` / `-bad` / `-accent` / `-dim`).
- `.alert` (+ `-ok` / `-warn` / `-bad`).
- `.empty` — estado vacío centrado con ícono.
- `.live-pill` — indicador “en línea”.

### 4.5 Overlays
- `.modal-backdrop` + `.modal-card`; punto de montaje `#modal-root` (Escape lo limpia).
- `.toast`; punto de montaje `#toast-root`.

### 4.6 Canvas de flujo
- `.node` y `.node-card` — nodos interactivos (hover eleva con `--shadow`).

### 4.7 Filas y tablas
Contenedor `bg-panel border border-line`; filas separadas con
`border-top:1px solid var(--line)`. Hover: `.leadrow`, `.datarow`, `.kbrow`,
`.convrow` (todos → `background:var(--panel2)`). Cabecera de columnas:
`font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)`.

### 4.8 Helpers (`src/admin/views/ui.ts`)
Devuelven HTML ya armado. **Usar siempre que aplique**, no rearmar el patrón:

```ts
emptyState(message, icon = "inbox")
alertBox(message, kind = "info", icon?)
pill(text, kind = "dim", icon?)
iconSubmit(icon, value, title, kind = "plain")
statTile(value, label)
pageHead(title, sub?, actions?)
field(label, control, hint?)
```

- `message`/`text` deben venir **escapados** por quien llama.
- Los helpers que renderizan reciben `t` desde la vista.

Lucide: `<i data-lucide="name" width="16" height="16"></i>`. El shell llama
`lucide.createIcons()` al cargar y **después de cada swap de htmx**, así que los
fragmentos también pintan sus íconos.

---

## 5. i18n de las vistas

- Todo texto visible pasa por `t()`:
  ```ts
  const { t } = await panelI18n(env);
  ```
- Las claves viven en `src/admin/locales/es/*` y `src/admin/locales/en/*`.
  **La paridad ES/EN es obligatoria** (test `test/admin/i18n.test.ts`).
- No agregues literales nuevos en el HTML: agrega la clave en ambos idiomas.
- No cambies textos existentes que los tests fijan (login, PWA, navegación).

---

## 6. Cabecera de página — la renderiza el shell

Para cada página, el shell pinta un topbar sticky con **migaja (`Sección / Tab`)**,
el `<h1>` de la página y el pill “bot en línea”, derivados de `activeTab`. El body
de la vista empieza **debajo**.

- **No** renderices tu propio título de página ni tu propio indicador de bot.
- Empieza con contenido (filtros, métricas, sub-pestañas, tarjetas…).
- `<main class="main-area">` ya tiene el padding; usa `gap`/márgenes internos, no
  vuelvas a rellenar el borde exterior.

---

## 7. Marca blanca

`resolveBrand()` + `brandOverrides()` en `layout.ts`. Precedencia:
overlay del backend → vars `BRAND_*` → identidad Kooni.

| Var | Efecto |
|---|---|
| `BRAND_NAME` | Nombre en sidebar, login, manifest, push |
| `BRAND_LOGO_URL` | Logo del sidebar/login |
| `BRAND_PRIMARY` | `--accent` (y `--accent-soft` derivado si no se da soft) |
| `BRAND_PRIMARY_SOFT` | `--accent-soft` explícito |
| `BRAND_ACCENT2` | `--accent-2` |
| `BRAND_BG` / `BRAND_PANEL` | Fondo y superficie |
| `BRAND_PANEL2` / `BRAND_RAISE` | Hover/filas e elementos elevados |
| `BRAND_LINE` / `BRAND_LINELIT` | Bordes normal e iluminado |
| `BRAND_TEXT` / `BRAND_MUTED` / `BRAND_DIM` | Texto principal, secundario y terciario |
| `BRAND_ON_ACCENT` | Texto sobre el acento (tinta oscura si el acento es claro) |
| `BRAND_THEME` | `"dark"` / `"light"`: esquema único; oculta el toggle de tema |
| `BRAND_VIOLET` | `--violet` del canvas de flujo (para marcas sin morado) |

- El texto y los neutrales de marca se aplican en **ambos temas**: si defines
  `BRAND_BG`/`BRAND_PANEL`, el panel mantiene ese esquema aunque el navegador
  prefiera claro (por eso se recomienda `BRAND_THEME="dark"`).
- Si la marca **no** redefine las superficies, el acento se oscurece
  automáticamente en tema claro con `color-mix` para conservar contraste.
- Sin `BRAND_*`, no se emite ningún override: el panel usa la identidad Kooni.
- La PWA (`src/admin/pwa.ts`) usa `BRAND_BG` / `BRAND_PRIMARY` / `BRAND_ACCENT2` /
  `BRAND_NAME`.

---

## 8. Página pública de seguimiento (`/t/:code`)

`src/admin/views/track.ts` es autocontenida (no usa el layout) pero comparte la
**misma paleta y tipografía**: define los tokens en su propio `<style>` y toma el
acento de `BRAND_PRIMARY`. El nombre visible es el **del negocio**
(`BUSINESS_NAME`), no la marca del panel.

---

## 9. Reglas de contribución

1. Colores y radios: **tokens**, nunca literales.
2. Sombras suaves (`--shadow`); no reintroducir sombras duras.
3. Chips/avisos/vacíos: helpers de `ui.ts`.
4. Botones de submit: `.bigbtn` / `.ghostbtn` / `iconSubmit`.
5. No cambiar ids, `name`, rutas ni textos que los tests fijan.
6. No tocar atributos `hx-*` ni el wiring de htmx: se restyla, no se recablea.
7. Toda vista nueva: `pageHead` + `.card` + tokens + claves i18n en ES y EN.
8. Revisar en **oscuro y claro**, desktop y móvil, antes de cerrar.
