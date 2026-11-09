# Ficha del cliente — cardaniel (Daniel autos)

Referencia de **esta instalación**: dónde vive, qué tiene configurado y cómo se
opera. Sin secretos: las credenciales viven en Cloudflare (secrets) y en
`settings` (D1); acá solo se documenta **dónde están**.

---

## 1. Identificación

| | |
|---|---|
| Cliente | Daniel autos (cardaniel) |
| Bot | `Daniel` · idioma `es-MX` · nicho autos |
| Worker | `kooni-bot-cardealer-daniel2-948b8b` |
| URL | https://kooni-bot-cardealer-daniel2-948b8b.cardealerdani.workers.dev |
| Panel | https://kooni-bot-cardealer-daniel2-948b8b.cardealerdani.workers.dev/admin |
| Cuenta Cloudflare | `Info@dmezzadri.com` (`b579b15488cb0efc53c2434d381cbe17`) |
| Instancia | `BOT_INSTANCE_ID = 948b8b` |
| Repositorio | `github.com/iamnocodeveloper/autonex-cardaniel` — repo **aislado** del template (el template queda como remoto `upstream`) |
| Identidad | **AUTONEX** (dorado `#C9A052`, texto blanco en oscuro) — ver `docs/IDENTIDAD-AUTONEX.md` |
| Versión desplegada | **1.67.0** — deploy 2026-11-09 (identidad AUTONEX aplicada y verificada en vivo) |
| Cron | `0 3 * * *` (Web Sync nocturno + fotos + métricas) |

## 2. Recursos

| Recurso | Nombre | Notas |
|---|---|---|
| D1 | `kooni_cardealer_dani_948b8b_db` | 84 tablas; inventario en `settings.web_sync_vehicles` |
| Vectorize | `kooni_cardealer_dani_948b8b_kb` | 1024 dims, cosine; se re-embebe desde la KB |
| Durable Object | `SupportAgent` | migración `v1` (SQLite) |
| R2 (`MEDIA`) | — | no configurado: los archivos van a D1 |
| Browser (`BROWSER`) | — | no configurado |

## 3. Configuración vigente (no secreta)

```ini
INSTALL_UNLIMITED = "1"            # fuera del esquema de licencias: sin límites ni módulos bloqueados
LLM_PROVIDER      = "openai"       # contra el gateway AIsa (llm_api_base_url = https://api.aisa.one/v1)
BOT_TIER          = "pro"
BRAND_NAME        = "AUTONEX"   # identidad del panel (solo este cliente)
BRAND_PRIMARY     = "#C9A052"   # dorado
BRAND_ACCENT2     = "#E0B96A"
BRAND_TEXT        = "#FFFFFF"   # texto blanco
BRAND_MUTED       = "#D4D4D8"
BRAND_DIM         = "#A1A1AA"
BRAND_PANEL2      = "#202024"
BRAND_RAISE       = "#2A2A2F"
BRAND_LINE        = "#2E2E34"
BRAND_LINELIT     = "#3D3D45"
BRAND_ON_ACCENT   = "#170F1C"   # tinta sobre botones dorados
BRAND_THEME       = "dark"      # esquema único; oculta el toggle
BRAND_VIOLET      = "#E0B96A"   # canvas sin violeta

scrape_provider                 = 'auto'   # Decodo → sitemap directo → AIsa
feature_web_sync_enabled        = '1'
feature_web_sync_analysis_enabled = '1'
analysis_llm_provider           = 'aisa'   # gateway; NO 'anthropic' (ignora la URL base)
analysis_llm_model              = 'claude-sonnet-4-5-20250929'
analysis_llm_api_base_url       = 'https://api.aisa.one/v1'
panel_language                  = 'en'     # el panel se ve en inglés
web_sync_urls                   = 'https://www.greenwaykiawestpalmbeach.com/dealer-inspire-inventory/inventory_sitemap'
```

- Credenciales de scraping: **Decodo** en `settings.decodo_auth` (+ secret `DECODO_AUTH`) y
  **AIsa** heredada de `settings.llm_api_key`.
- Panel: usuario `admin`; el password es el secret `DASHBOARD_PASSWORD`.
  Rotarlo: `npx wrangler secret put DASHBOARD_PASSWORD` (invalida las sesiones abiertas).
- `QUOTE_URL_SECRET` (secret) firma los enlaces de cotización: rotarlo no afecta al panel.
- Aviso de uso al backend: `USAGE_PUSH_URL` (InsForge `registrar-uso`).
- Push: `VAPID_PUBLIC_KEY` (var) / `VAPID_PRIVATE_KEY` (secret) / `VAPID_SUBJECT`.

## 4. Cómo funciona el inventario (resumen operativo)

1. **Cron 03:00** (o botón *Scrapear ahora*) → `runWebSync`.
2. **Feed**: `scrape_provider = auto` → **Decodo** lee el sitemap (XML crudo); si falla,
   sitemap directo (gratis) y por último **AIsa** (`firecrawl/map` + filtro `/inventory/`).
3. **Parseo determinista** → store `settings.web_sync_vehicles` (clave `vin:` o `url:`) + docs de KB.
4. **Fichas** (foto/precio/millas/descripción): 20 por corrida nocturna con Decodo HTML/JSON-LD
   (3 en paralelo, cooldown 3 días). Bajo demanda: tool `fichaAuto`.
5. **Análisis IA**: 40 autos por corrida (prioriza sospechosos y posibles duplicados),
   modelo `claude-sonnet-4-5` vía AIsa. Solo **corrige** autos existentes y valida rangos.
6. **Registro**: `/admin/scraping` (`web_sync_runs` / `web_sync_changes`, 90 días).
7. **Bot**: `inventarioQuery` (solo lo que hay) y `fichaAuto` (link + foto puntual).

## 5. Estado al 2026-10-29

| Métrica | Valor |
|---|---|
| Autos en inventario | **397** (si responde Decodo/sitemap: 436) |
| Sin precio | 94 |
| Sin foto | 94 |
| Sin millas | 396 |
| Última corrida | manual, 0 errores, análisis **40/40 corregidos** |
| Sesiones del panel | el password se rotó el 2026-10-29 (las sesiones previas quedaron invalidadas) |
| Credenciales | rotadas `DASHBOARD_PASSWORD`, `KB_REINDEX_TOKEN` y `QUOTE_URL_SECRET`; el resto requiere el panel del proveedor |

> El lote de fichas corre de noche (20 por corrida) o con **“Enriquecer fichas (60)”** en
> `/admin/scraping`. Los 94 autos nuevos aún no tienen precio/foto.

## 6. Runbook

```powershell
$env:CLOUDFLARE_ACCOUNT_ID="b579b15488cb0efc53c2434d381cbe17"
npx wrangler whoami                     # debe listar la cuenta de dmezzadri
npx wrangler deploy                     # publica el código local
npx wrangler tail kooni-bot-cardealer-daniel2-948b8b   # logs en vivo

# ver la config sin secretos
npx wrangler d1 execute kooni_cardealer_dani_948b8b_db --remote --command \
  "SELECT key, value FROM settings WHERE key LIKE 'web_sync%' OR key LIKE 'analysis%' OR key='scrape_provider'"
```

Disparar una corrida sin entrar al panel (Basic auth):

```powershell
curl.exe -u admin:<DASHBOARD_PASSWORD> -X POST -H "Accept: application/json" `
  https://kooni-bot-cardealer-daniel2-948b8b.cardealerdani.workers.dev/admin/scraping/run
```

## 6.1 Repositorio aislado (2026-11-09)

Cardaniel es un cliente aparte: el código vive en
`github.com/iamnocodeveloper/autonex-cardaniel` (público, con el historial del
template). El template original queda como remoto **`upstream`**:

```powershell
git fetch upstream
git merge upstream/main   # traer mejoras del template cuando convenga
```

- `wrangler.toml` (IDs de Cloudflare + token de uso) **no se versiona**.
- Para desplegar: fijar la cuenta `Info@dmezzadri.com` (ver §6) y correr
  `npx wrangler deploy` (o `pnpm run deploy` si pnpm está sano).
- La identidad AUTONEX se aplica con `BRAND_*` en `wrangler.toml`; ver
  `docs/IDENTIDAD-AUTONEX.md`.

## 7. Respaldo

`backups/cardealer-daniel-2026-10-29/` (local, **gitignored**): dump completo de D1,
`settings` enmascarado y `wrangler.toml`. Instrucciones de restauración en su `README.md`.

## 8. Pendientes / notas

- Completar millas y fichas de los autos nuevos (botón *Enriquecer fichas*).
- **Rotación pendiente en proveedores**: AIsa (`llm_api_key` + `analysis_llm_api_key`),
  Decodo, Zernio, WAHA, VAPID (obliga a re-suscribir la PWA) y los tokens de
  Cloudflare/GitHub del incidente. Los valores nuevos de lo ya rotado están en
  `backups/cardealer-daniel-2026-10-29/credenciales-rotadas-2026-10-29.md` (local).
- **Inventario oscilante**: con Decodo/sitemap son 436 autos; cuando Decodo
  responde `status: failed` (613) y cae a AIsa, quedan 397. Es el fallback
  diseñado, no pérdida de datos: el cron reintenta cada noche.
- El panel está en inglés (`panel_language = 'en'`); para español: `UPDATE settings SET value='es' WHERE key='panel_language'`.
- `kooni-paneles` / `functions` (hub InsForge) se administran aparte; esta ficha cubre solo el bot.
