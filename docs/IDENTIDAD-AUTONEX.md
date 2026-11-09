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
| `BRAND_TEXT` / `--cream` | `#FFFFFF` | Texto principal **blanco** |
| `BRAND_MUTED` / `--muted` | `#D4D4D8` | Texto secundario |
| `BRAND_DIM` / `--dim` | `#A1A1AA` | Texto terciario / labels |
| `BRAND_BG` / `--bg` | `#0D0D0F` | Fondo neutro (sin matiz violeta) |
| `BRAND_PANEL` / `--panel` | `#17171A` | Superficies |
| `BRAND_PANEL2` / `--panel2` | `#202024` | Hover, filas, inputs |
| `BRAND_RAISE` / `--raise` | `#2A2A2F` | Elementos elevados |
| `BRAND_LINE` / `--line` | `#2E2E34` | Bordes |
| `BRAND_LINELIT` / `--linelit` | `#3D3D45` | Bordes iluminados |
| `BRAND_VIOLET` / `--violet` | `#E0B96A` | Acento del canvas (sin violeta) |

- `--accent-soft` se deriva del dorado con `color-mix`.
- **Esquema único oscuro** (`BRAND_THEME="dark"`): el toggle de tema no se
  muestra y el panel conserva fondo oscuro y texto blanco también si el
  navegador prefiere tema claro.
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
BRAND_NAME      = "AUTONEX"
BRAND_PRIMARY   = "#C9A052"
BRAND_ACCENT2   = "#E0B96A"
BRAND_TEXT      = "#FFFFFF"
BRAND_MUTED     = "#D4D4D8"
BRAND_DIM       = "#A1A1AA"
BRAND_BG        = "#0D0D0F"
BRAND_PANEL     = "#17171A"
BRAND_PANEL2    = "#202024"
BRAND_RAISE     = "#2A2A2F"
BRAND_LINE      = "#2E2E34"
BRAND_LINELIT   = "#3D3D45"
BRAND_ON_ACCENT = "#170F1C"
BRAND_THEME     = "dark"
BRAND_VIOLET    = "#E0B96A"
```

## 6. Repositorio

Este cliente vive en un repositorio aislado:
`github.com/iamnocodeveloper/autonex-cardaniel`. El template queda como remoto
`upstream` (`github.com/iamnocodeveloper/kooni-bot`) para traer mejoras con
`git fetch upstream && git merge upstream/main`.
