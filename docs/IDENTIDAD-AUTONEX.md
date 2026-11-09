# Identidad AUTONEX — instalación cardaniel

> Identidad **exclusiva de esta instalación**. El template Kooni conserva su
> marca morado/fucsia. Se aplica con variables `BRAND_*` en `wrangler.toml`
> (archivo local, no versionado) y el código compartido de marca blanca.

## 1. Nombre

- **AUTONEX** — nombre del sistema/panel de esta instalación.
- El bot sigue presentándose con el nombre del negocio cuando habla con
  clientes; el nombre del negocio en páginas públicas (seguimiento `/t/:code`,
  cotizaciones) es **Daniel autos**.
- El panel, el login, el manifest PWA y las notificaciones push muestran
  **AUTONEX**.

## 2. Paleta

| Token | Valor | Uso |
|---|---|---|
| `BRAND_PRIMARY` / `--accent` | `#C9A052` | Dorado de marca: acciones y activo |
| `BRAND_ACCENT2` / `--accent-2` | `#E0B96A` | Dorado claro secundario |
| `BRAND_TEXT` / `--cream` (oscuro) | `#FFFFFF` | Texto principal **blanco** |
| `BRAND_MUTED` / `--muted` (oscuro) | `#D4D4D8` | Texto secundario |
| `BRAND_BG` / `--bg` | `#0D0D0F` | Fondo neutro (sin matiz violeta) |
| `BRAND_PANEL` / `--panel` | `#17171A` | Superficies |

- `--accent-soft` se deriva del dorado con `color-mix`.
- **Tema claro:** el texto vuelve a tinta oscura y el acento se oscurece
  automáticamente (`color-mix` con negro) para conservar contraste ≥4.5:1.
- Sobre botones dorados, el texto usa `--on-accent` (tinta oscura), no blanco.

## 3. Tipografía

Se mantiene la del sistema: **Sora** para títulos y cuerpo, **IBM Plex Mono**
para datos y código.

## 4. Marca gráfica

- Sin logo propio: se usa un **monograma “A”** dorado (el código compartido
  reemplaza la “K” de Kooni cuando `BRAND_NAME` no es Kooni).
- Para usar un logo real: definir `BRAND_LOGO_URL` en `wrangler.toml`.

## 5. Variables (en `wrangler.toml`, no en git)

```toml
BRAND_NAME    = "AUTONEX"
BRAND_PRIMARY = "#C9A052"
BRAND_ACCENT2 = "#E0B96A"
BRAND_TEXT    = "#FFFFFF"
BRAND_MUTED   = "#D4D4D8"
BRAND_BG      = "#0D0D0F"
BRAND_PANEL   = "#17171A"
```

## 6. Repositorio

Este cliente vive en un repositorio aislado:
`github.com/iamnocodeveloper/autonex-cardaniel`. El template queda como remoto
`upstream` (`github.com/iamnocodeveloper/kooni-bot`) para traer mejoras con
`git fetch upstream && git merge upstream/main`.
