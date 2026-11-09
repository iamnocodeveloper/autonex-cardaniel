# 🟣 Identidad de marca — KOONI

> Documento de identidad del proyecto **Kooni**. Define nombre, significado, paleta,
> tipografía, logo, voz y reglas de uso. Es la fuente de verdad para cualquier pieza
> de marca (dashboard, docs, correos, presentaciones).

---

## 1. Nombre

**Kooni** — una palabra inventada, corta y cálida.

- **Significado propuesto:** "el que cuida" — del japonés *kō (幸, bienestar)* y la
  terminación *-ni* que da cercanía. El asistente que cuida tu negocio y a tus clientes.
- **Se pronuncia:** /kú-ni/ (KOOH-nee).
- **Uso:** siempre en mayúscula inicial: **Kooni**. Nunca "KOONI", "kooni" ni
  "Kooní" en textos de marca.
- **Variantes aceptadas:** "Kooni Bot" (el bot desplegado), "Panel Kooni" (el
  dashboard `/admin`).

### Tagline

> **Tu negocio, atendido siempre.**
> EN: *Your business, always attended.*

### Descripción de una línea

> Kooni es un asistente de IA multicanal (WhatsApp, Instagram, Messenger y Telegram)
> que vive en tu propia nube de Cloudflare, con tu llave de IA. Atiende 24/7,
> responde desde tu base de conocimiento y te avisa cuando algo lo amerita.

---

## 2. Paleta de color

> **Rediseño 2026 (v1.17.0):** acento **morado/fucsia** sobre tinta con matiz
> violeta, con **tema claro y oscuro** (toggle en el header, `data-theme` en
> `<html>` + `localStorage`). Antes: teal/menta, solo oscuro, look "terminal".
> La fuente de verdad son los tokens CSS de `src/admin/views/layout.ts`.

**Neutrales:** no un gris plano — leve sesgo violeta hacia el acento.

| Token | Oscuro | Claro | Uso |
|---|---|---|---|
| `bg` | `#0f0e17` | `#faf7fe` | Fondo general |
| `panel` | `#181624` | `#ffffff` | Tarjetas / sidebar / header |
| `panel2` | `#221d33` | `#f4eefc` | Hover / filas |
| `raise` | `#2f2745` | `#ece2fa` | Elementos elevados |
| `line` | `#332c48` | `#e7ddf4` | Bordes |
| `linelit` | `#463c63` | `#d3c4ec` | Bordes iluminados |
| `accent` | `#e05fd8` | `#c31fce` | **Marca — fucsia** (acciones, links, activo) |
| `accent-2` | `#a679f6` | `#8b3ff0` | Secundario — violeta |
| `accent-soft` | `rgba(224,95,216,.14)` | `rgba(195,31,206,.09)` | Fondo tenue del acento |
| `on-accent` | `#170f1c` | `#ffffff` | Texto sobre el acento |
| `cream` | `#ece9f5` | `#211c33` | Texto principal |
| `muted` | `#a49bbd` | `#5c5473` | Texto secundario |
| `dim` | `#726a8c` | `#8b83a3` | Texto terciario |
| `ok` / `ok-soft` | `#34d399` | `#059669` | Éxito / en línea |
| `warn` / `warn-soft` | `#f0b34a` | `#b45309` | Advertencia |
| `bad` / `bad-soft` | `#fb7185` | `#e11d48` | Errores |
| `info` | `#6aa9fb` | `#2563eb` | Información |
| `shadow` | sombra suave | sombra suave violeta | Elevación (no `Npx Npx 0`) |

**Reglas:**
- El fucsia es el color de marca: acciones principales y estados activos. Nunca
  como color de texto largo.
- Contraste mínimo 4.5:1 en texto, en **ambos** temas.
- Sobre el acento, el texto va en `on-accent` (tinta en oscuro, blanco en claro).
- `ok` / `warn` / `bad` son estados semánticos — no son "el acento".
- Marca blanca: `BRAND_*` (`wrangler.toml`) sobreescribe `accent` / `bg` /
  `panel`; `BRAND_TEXT` / `BRAND_MUTED` cambian el color de texto **solo en
  tema oscuro** (en claro se conserva la tinta neutra). Sin ellas, identidad
  Kooni. El acento de marca se oscurece automáticamente en tema claro para
  mantener contraste.

---

## 3. Tipografía

| Rol | Familia | Fallback |
|---|---|---|
| Display / títulos / texto | **Sora** (Google Fonts, 400–800) | `ui-sans-serif, system-ui, sans-serif` |
| Mono / datos / código / etiquetas | **IBM Plex Mono** (Google Fonts, 400–600) | `ui-monospace, monospace` |

- Títulos en Sora 700/800, con `letter-spacing: -0.02em` a `-0.03em`.
- **El cuerpo también es Sora** — antes todo era monoespaciado (el look "terminal"
  de Forja). La mono queda solo para números, tablas, etiquetas y código.
- Ambas por Google Fonts (gratis, sin registro).

---

## 4. Logo

Archivos: `assets/kooni-logo.svg` (64px) y `assets/kooni-favicon.svg` (32px).

- **Forma:** cuadrado redondeado de tinta `#0f0e17` con borde fucsia `#e05fd8`.
- **Glifo:** la letra **K** formada por un nodo de conversación (trazos que se
  abren en dos direcciones) en fucsia.
- **Punto:** un nodo violeta `#a679f6` en la esquina superior derecha — "el bot
  encendido / en línea".
- Los SVG (`assets/` y `web/assets/`) ya están recoloreados a fucsia/violeta (v1.18).
- **Uso en dashboard:** dentro del cuadro de marca (34px) del sidebar y en la
  página de login de dos columnas (`loginPage()` en `layout.ts`), se renderiza
  el glifo K con el punto. En marca blanca lo reemplaza el logo del revendedor
  (`BRAND_LOGO_URL`).

---

## 5. Voz y tono

Kooni habla **español sencillo (LATAM)**, directo y cálido.

- **Una pregunta a la vez.** Nunca listas interminables.
- **Claro antes que ingenioso.** El humor es opcional, la claridad no.
- **Nunca inventa.** Si no sabe, dice que no sabe y escala a un humano.
- **Reconoce que es un bot.** Si le preguntan, lo admite.
- **Nada de jerga técnica** hacia el cliente; el panel sí usa términos del negocio.

### Ejemplos

| ❌ | ✅ |
|---|---|
| "El endpoint del webhook quedó configurado exitosamente" | "Ya conectamos el canal. Prueba mandando un mensaje." |
| "Error 500 en el handoff" | "Algo salió mal al avisarte. Intenta de nuevo." |
| "Tu agente generará una factura proforma" | "Te mando el detalle de lo que costó este mes." |

---

## 6. Reglas de uso

- **Uso interno:** Kooni es un proyecto de uso interno (no comercial). No se
  revende, no se redistribuye el código con la marca Kooni sin permiso.
- **Origen:** el código deriva de un template open source (MIT). La licencia
  MIT se conserva (`LICENSE`) y exige mantener el aviso de copyright original.
  Kooni agrega su propia marca encima, lo cual la MIT permite.
- **No usar** marcas de terceros en productos de Kooni; solo en el aviso de
  licencia y en referencias históricas de la documentación.

---

## 7. Stack técnico (resumen)

Cloudflare Workers (Hono) · Vercel AI SDK · D1 (SQLite) · Vectorize (bge-m3) ·
R2 · Durable Objects. Un solo `pnpm run deploy`. Detalle en `docs/ARQUITECTURA.md`.
