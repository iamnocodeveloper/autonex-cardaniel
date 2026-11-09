# Changelog

Cambios notables de Kooni. Formato aproximado de
[Keep a Changelog](https://keepachangelog.com/es/1.1.0/); versiones = `package.json`.

El CLI `kooni-bot` se versiona aparte (npm) — ver la nota de cada versión.

**CLI `kooni-bot` → 0.8.2** (pendiente de publicar): `init`/`install`/`deploy`/`pair` **siempre
confirman la cuenta** antes de instalar — nunca reusan la sesión del CLI en silencio. Como el dueño
puede tener su cuenta y las de varios clientes, al instalar se pregunta «¿con esta cuenta o conectar
otra?»; en agente/CI se exige `--account <email>` (o `--login --wait`) y, si no, **aborta** (no
instala/licencia bajo la cuenta equivocada). Nuevo comando `logout` para cambiar de cuenta.

## [1.67.0] — 2026-11-09

### Cambiado — pulido visual del panel (shell, primitivas y marca blanca)

Segundo pase del rediseño 2026. No cambia lógica ni rutas: unifica el estilo que
cada vista armaba inline y cierra restos del tema anterior.

- **Escala compartida**: tokens `--r-sm/md/lg/xl/pill`, `--sp-1..4`,
  `--font-display` y `--font-mono`; mapeados a Tailwind (`warn`, `on-accent`,
  radios). Se quitaron los radios sueltos del CSS global.
- **Clases del shell** (antes estilos inline en `layout.ts`): `.headerbar`,
  `.main-area`, `.crumb`, `.page-title`, `.iconctl`, `.langsel`, `.logoutlink`,
  `.sb-brand`, `.brand-*`, `.sb-foot`, `.bot-*` y `.projsel`.
- **Primitivas de contenido**: `.page-head`, `.toolbar`, `.stat`, `.formrow`,
  `.label`, `.input`, `.select`, `.tabs` / `.tab`. Nuevos helpers en `ui.ts`:
  `statTile()`, `pageHead()`, `field()`.
- **Marca blanca con texto propio**: `BRAND_TEXT` y `BRAND_MUTED` se aplican
  **solo en tema oscuro**; en claro se mantiene la tinta neutra y el acento se
  oscurece con `color-mix` para conservar contraste. Si hay `BRAND_PRIMARY` sin
  soft, `--accent-soft` se deriva del acento (antes quedaba el fucsia de Kooni).
- **PWA**: el título por defecto del push usa `BRAND_NAME`; caché del service
  worker `v2` → `v3` para tirar la copia vieja del rediseño.
- **`/t/:code`** (seguimiento público) pasa al sistema de tokens: misma paleta,
  Sora + IBM Plex Mono, acento de marca y nombre del negocio. Se retiró el teal
  por defecto.
- **Sombras brutalistas retiradas** (`Npx Npx 0`) en Agente, Costos,
  Conversaciones, Configuración, Insights, Extras, KB, Resumen, Mejoras,
  Tickets y el botón del plan; ahora usan `var(--shadow)`.
- **Restos teal/hex eliminados** en Automatizaciones, Resumen, Equipo, Licencia
  y Conexiones (avisos, chips y botones sobre acento con `--on-accent`).
- **`docs/design-system.md` reescrito** con los tokens reales (claro/oscuro),
  tipografía, primitivas, helpers, i18n y marca blanca.

Tests: +5 en `test/admin/brand.test.ts` (nombre, acento, soft derivado, acento
oscuro en claro y texto solo en oscuro). Contratos de `layout`, login, PWA,
i18n y `/t/:code` siguen verdes.

## [1.66.0] — 2026-11-08

### Corregido — el hilo no mostraba lo enviado (app del celular ni automatizaciones)

El panel solo tenía los mensajes que **entraban**. Todo lo saliente —lo que el
dueño escribe desde la app de Instagram/Messenger y lo que envían las
automatizaciones— no aparecía en Conversaciones.

- **Faltaba el evento `message.sent`.** Zernio entrega TODO lo saliente por
  `message.sent`; el webhook solo se suscribía a `message.received`,
  `comment.received` y `reaction.received`. Ahora se registra también
  `message.sent`, y **`/admin/conexiones` repara solo** los endpoints ya
  existentes al abrirse (sin reconectar ni volver a pegar la API key).
- **`sentVia` decide el rol**: `null`/`human` → lo escribió una persona
  (roles `owner`), y `api`/`comment_automation`/`workflow`/`sequence`/`broadcast`
  → lo mandó el bot o una automatización (rol `assistant`). Antes todo eco se
  registraba como `owner` y **pausaba el bot**; una automatización pausando el
  bot era un efecto secundario indeseado.
- **Salientes con solo media** (una foto enviada desde el celular) ya no se
  descartan: se registran con su marcador.

### Corregido — `SKIPPED · Deduplicado por huella` con la respuesta pública pendiente

Caso real (comentario de `raulcubillosmexico`): la regla era
comentario→DM+público, el DM salió y la respuesta pública no. Zernio reenvió el
comentario y el panel registró **skipped por huella**, así que la respuesta
pública al comentario **no se envió nunca**.

- **La huella deduplicaba el comentario entero**, aunque una regla tenga dos
  patas que se completan en momentos distintos. Ahora, si llega una reentrega y
  la respuesta pública sigue pendiente, **se reintenta solo esa pata** (el claim
  por pata en `processed_comments` sigue evitando duplicados).
- Al reintentar se usa el **`comment_id` original** guardado en la huella (no el
  id nuevo que inventa Zernio), para no perder el estado ni el dedup.
- **El claim de huella se libera** cuando no se envió nada (fallo de API, límite
  alcanzado): antes quedaba tomado para siempre y el comentario quedaba sin
  respuesta aunque la automatización la tuviera.

### Corregido — "le di ya te sigo y no se envió nada"

- **Tap sin pendiente guardado**: si la fila de `follow_gate_pending` se perdió
  (deploy a mitad, INSERT fallido), el tap se descartaba **en silencio**. Ahora
  cae a la automatización de follow gate más reciente, verifica el follow y
  responde igual.
- Se mantiene todo lo de 1.65.0: payload real del botón, `refresh=true` contra
  la caché y la verificación en trío (`yes`/`no`/`unknown`).

Pruebas: `test/channels/zernio.test.ts` → **38** (5 nuevas: `message.sent` de la
app, del bot, con solo media, reentrega con pública pendiente y tap sin
pendiente). `pnpm typecheck` limpio.

## [1.65.0] — 2026-11-08

### Corregido — el follow gate no entregaba el recurso al confirmar

Reportado en producción: el DM de "sígueme" llegaba, pero al tocar **"Ya te
sigo"** no pasaba nada — ni se entregaba el recurso ni se avisaba que faltaba
seguir. Tres causas, las tres arregladas:

- **El tap del botón nunca se leía.** Zernio entrega la pulsación en
  `message.metadata.postbackPayload` (y la etiqueta en `postbackTitle`), con
  `message.text` **vacío**. El código solo miraba `message.text` y el prefijo
  `postback_` de `platformMessageId`, así que la confirmación se caía: el
  mensaje entraba al agente como "sin texto" o se descartaba. Ahora se lee el
  payload real (y también `quickReplyPayload`, `callbackData`, `interactiveId`).
- **"No lo sé" se trataba como "no me sigue".** `follow-status` devuelve
  `isFollower: null` con un `unavailableReason` cuando Meta no puede resolverlo
  (lo normal en un comentarista que nunca ha escrito: `consent_required`).
  El código lo metía en el mismo saco que `false`, así que un seguidor real
  quedaba en un bucle de "aún no me sigues". Nuevo helper
  `checkInstagramFollowStatus()` (`src/channels/zernioAccounts.ts`) que devuelve
  un **trío**: `yes` / `no` / `unknown`, y cada uno se maneja distinto.
- **La verificación leía caché.** Zernio cachea la respuesta por (cuenta,
  usuario); al confirmar se pide con `refresh=true` para que un follow recién
  hecho se vea al instante.

Comportamiento ahora, al tocar "Ya te sigo":

| Verificación | Qué hace el bot |
|---|---|
| **Sí sigue** | Entrega el mensaje de la regla + el link (trackeado si hay `buttonUrl`) y limpia el pendiente. |
| **No sigue** | Avisa que todavía no aparece como seguidor y **deja el botón para reintentar**. El pendiente se conserva. |
| **No se puede verificar** | Avisa y pide reintentar en unos segundos (nunca finge que ya cumplió). |

- Mensaje del caso "todavía no te sigue" **editable desde el panel**
  (Automatizaciones → follow gate): setting `follow_gate_not_following_message`.
- El follow gate se **omite en plataformas que no lo soportan** (follow-status
  es solo de Instagram; en Facebook/TikTok el gate era un bucle imposible de
  cumplir) y un postback ajeno (ej. "Agendar") ya no puede disparar la entrega
  por error.
- Cada intento queda en el historial de automatizaciones con su estado honesto
  (`sent` / `skipped` + motivo).

Pruebas: `test/channels/zernio.test.ts` (+4): payload real con `text` vacío
(entrega), no sigue (avisa y deja botón), no verificable (pide reintentar) y
postback ajeno (no dispara el gate). `pnpm typecheck` limpio.

## [1.64.0] — 2026-10-29

### Corregido — el análisis IA del inventario no corría

- **`analyzeInventory` le pasaba a `generateText` la propiedad `.model.model`
  del `ResolvedModel`** (que es `undefined`) → `Cannot read properties of
  undefined (reading 'specificationVersion')` y **0 correcciones** en todas las
  corridas desde que se encendió el toggle. Ahora usa el modelo real
  (`resolved.model`). Verificado en cardaniel: **40/40 autos corregidos**, 0 errores.
- **Modelo de análisis**: con `analysis_llm_provider = anthropic` la URL base se
  ignora (solo OpenAI/MiniMax la usan) y una key de gateway daba 401. En
  cardaniel quedó en `aisa` (gateway `api.aisa.one/v1`, `claude-sonnet-4-5`).

### Agregado — mapa visual de proveedores de scraping

- **Configuración → Scraping** y **Registro de scraping** muestran en lenguaje
  llano **qué hace Decodo**, **qué hace AIsa**, cuál tiene llave (y de dónde
  sale), cuál está **EN USO** y el **orden de lectura** (Decodo → sitemap
  directo → AIsa) según el modo elegido.
- Componente compartido `src/admin/views/scrapeProviders.ts` + textos ES/EN.
- cardaniel volvió a `scrape_provider = 'auto'` (Decodo principal, AIsa respaldo).

### Pruebas

- `test/kb/analysisRun.test.ts`: candado de regresión (el modelo real llega a
  `generateText`), correcciones aplicadas, fallo fail-soft y toggle apagado.
- `test/admin/scrapeProviders.test.ts`: render del mapa, modo activo y llaves.

## [1.63.0] — 2026-10-27

### Agregado — pausa por contacto y lista de bloqueados

- **Pausa indefinida por conversación**: además de “Pausar 1 h”, el hilo ofrece
  “Pausar hasta reactivar”. El bot no vuelve solo: el dueño lo devuelve con
  “Devolver al bot”.
- **Contactos bloqueados al bot** (`/admin/blocked`, tabla nueva `contact_blocks`):
  silencio total para ese contacto — ni respuestas, ni seguimientos, ni campañas,
  ni disparadores, ni cobranzas. Se puede bloquear desde el hilo o desde la página,
  y desbloquear cuando quieras. El bloqueo es **por canal**.
- **El dueño responde desde fuera → el bot se pausa hasta reactivarlo**:
  - Instagram/Messenger vía Meta (`is_echo`) y Zernio (`outgoing`): ya existía,
    ahora la pausa es **indefinida**.
  - **WAHA** (WhatsApp self-hosted): los mensajes `fromMe` ahora se registran como
    `owner` y pausan el bot (antes se descartaban).
  - **WhatsApp Cloud API**: se procesan `message_echoes` / `smb_message_echoes`.
  - Responder desde el inbox `/admin/conversations` también deja pausa indefinida.
- `processBuffer` re-chequea el silencio antes de gastar LLM (cierra la carrera
  “pausaron entre el ingest y el alarm”).

### Mejorado — scraping con versión, descripción y duplicados

- El inventario guarda **`trim`** y **`description`** por auto (extraídos del
  JSON-LD / og:description / markdown de la ficha).
- El análisis IA ahora recibe **título + URL + descripción** y detecta:
  - **versiones distintas con el mismo título** (ej. “SX” vs “SX Prestige”),
    proponiendo `trim`/`description` para diferenciarlas;
  - **la misma unidad publicada dos veces** → `duplicateOf` (no se borra: deja de
    aparecer en las respuestas). Si alguno tiene VIN, **nunca** se marca duplicado.
- `vehicleKey` ya no colapsa todos los autos sin VIN ni link en una sola clave.
- El bot (`inventarioQuery`/`fichaAuto`) recibe `version` y `descripcion`, y
  `fichaAuto` distingue candidatos ambiguos.
- Nuevo botón **“Enriquecer fichas (60)”** en Scraping para backfill por tandas.

### Cambiado — Decodo es el proveedor principal

- `scrape_provider=auto` ahora es **Decodo → sitemap directo (gratis) → AIsa**.
  Con `decodo` no hay fallback; con `aisa` solo se usa AIsa.
- Si Decodo devuelve `quota`, en `auto` se cae a AIsa; la corrida solo se corta si
  ambos se agotan.
- `docs/ESTADO-Y-OPERACION.md` y el panel actualizados con el nuevo orden.

Instalaciones existentes: `npx kooni-bot update` y re-aplicar `src/db/schema.sql`
para crear `contact_blocks`. La migración es idempotente.

## [1.62.0] — 2026-10-12

### Agregado — Laboratorio: poné a prueba a tu agente antes de que hable con clientes

En vez de "esperar que el bot ande", ahora se mide. El **Laboratorio** (`/admin/laboratorio`,
nuevo en **Análisis**) corre al agente REAL en un **sandbox** (no persiste conversaciones,
mensajes, leads ni tickets, y no manda nada por ningún canal) contra:

- **Escenarios** ("rápido"): 20 casos de un solo mensaje (FAQ, capturar lead, agendar, handoff,
  frustración, fuera de alcance, imagen y voz) en ES/EN/PT — los mismos que ya usaba `pnpm eval`.
- **Clientes simulados** ("personas"): 8 clientes multi-turno que insisten, regatean, se enojan,
  piden un humano o escriben informal — incluidos dos de comida (pide fuera de zona, pedido para
  más tarde).

Un **juez IA** puntúa cada conversación (0–100), te muestra **qué falló y por qué**, y cada fallo
queda propuesto en **Mejoras** (✓ aplicar a la KB con un clic). Hay **historial con delta**: re-corré
después de cada cambio y mirá qué se rompió y qué se arregló. Todo reusa piezas que ya existían
(fixtures, helpers del juez, playground, flywheel).

Tablas nuevas `lab_runs`/`lab_results` (idempotentes). Instalaciones existentes: `npx kooni-bot update`.

### Mejorado — nicho de comida (restaurante)

- **Arreglado el seguimiento del pedido**: el botón "Ver seguimiento" del cliente apuntaba a `/t/<código>`
  **sin ruta montada** — estaba roto. Ahora hay una página pública con estado, línea de tiempo
  (`order_events`), ítems y total.
- **El bot ya ve el menú del panel**: `catalogQuery` leía un catálogo estático vacío; ahora consulta la
  tabla `products` (lo que cargás en Menú), con fallback al estático.
- **Foto por producto**: campo de imagen (con miniatura) en el editor de Menú; el bot puede referenciarla.
- **Zonas de entrega**: tabla `delivery_zones` y pantalla **Zonas** (envío y **mínimo por zona**). El bot
  resuelve el envío y el mínimo desde la zona (no los inventa): zona desconocida → ofrece retiro/handoff;
  bajo el mínimo → rechaza. Sin zonas cargadas, sigue como antes (envío desde la KB).
- **Pago recibido + asignar repartidor** en cada pedido (el nombre del repartidor sale en el aviso "en camino").
- **Pedidos programados**: el bot guarda la hora pedida (tabla `order_schedule`) y la tarjeta muestra
  "Programado para DD/MM HH:MM".
- **Menú de ejemplo** para arrancar de un clic (antes el botón no aparecía) y **arreglo** de la ruta
  `/menu/seed`, que estaba sombreada por `/menu/:id` y nunca corría.

## [1.61.0] — 2026-10-09

### Agregado — video en recursos, adjunto por mensaje de seguimiento y versión en el panel

- **Video como recurso**: la Galería ahora acepta imágenes, notas de voz, PDF **y videos**. El bot los
  envía por el canal (WAHA `/api/sendVideo`, Telegram `/sendVideo`, Zernio) y degrada a texto donde el
  canal no lo soporta. Sin R2 el tope sigue siendo ~1.8 MB por archivo (los videos grandes piden R2).
- **Adjunto en cada mensaje de seguimiento**: los hasta 3 mensajes del Cazador pueden llevar **su
  propio recurso** (imagen/video/nota de voz/PDF) elegido en Extras → Cazador. Se mantiene el fallback
  a las claves viejas (Cazador/Reenganche) para no romper instalaciones existentes.
- **Versión del sistema** visible al pie del sidebar del panel ("sesión activa · v1.61.0").
- **Novedades** publicadas en el hub (Galería, primer mensaje de campaña y seguimiento personalizable)
  para todos los clientes.

## [1.60.1] — 2026-10-09

### Arreglado — los recursos de campaña no se reenvían a mitad de charla

- Los recursos marcados **"enviar en el primer mensaje"** ya **no** entran al catálogo que elige
  la IA: se mandan solos en el primer contacto (determinista). Así un "cuándo usarlo" vago (ej.
  "cuando un usuario escribe") no hace que el bot los vuelva a mandar en plena conversación.

## [1.60.0] — 2026-10-09

### Agregado — recursos en el primer mensaje (campañas) + seguimiento personalizable

- **Enviar un recurso en el PRIMER mensaje**: en la Galería, cada recurso tiene el checkbox
  **"Enviar en el primer mensaje del cliente (campañas)"**. El bot lo manda apenas el cliente
  escribe por primera vez (conversación nueva), de forma **determinista** —antes de la respuesta y
  sin depender de que la IA decida—. Ideal para quienes llegan de una campaña. En "Probar el bot"
  aparece como **"Al primer mensaje enviaría:"** cuando el historial está vacío.
- **Seguimiento personalizable (hasta 3 mensajes)**: en **Extras → Cazador**, checkbox
  **"Personalizar mensajes de seguimiento"** (apagado = IA, como hoy) + 3 mensajes. Con el modo
  activo: el toque 1 sale a las **3–20 h** con tu mensaje 1; si no contestan, el toque 2 a los
  **2–5 días** con el mensaje 2; y el toque 3 a los **5–10 días** con el mensaje 3 (ticket nuevo
  `followup_touches`). Un mensaje vacío = ese toque no se envía. La secuencia la gobierna el Cazador.

Instalaciones existentes: `npx kooni-bot update` aplica el esquema (crea `followup_touches`) y
despliega. Requiere el toggle **Permitir multimedia** + módulo **Galería** para lo de los recursos.

## [1.59.1] — 2026-10-09

### Arreglado — la Galería no aparecía en "Probar el bot"

- La ventana **Probar el bot** (`/admin/probar`) filtraba a herramientas de **solo lectura** y
  dejaba fuera `enviarRecurso`, así que el bot nunca mandaba imágenes/audios en la prueba (aunque
  sí lo haría en un chat real). Ahora `enviarRecurso` está disponible ahí y corre en **modo
  simulado**: no envía nada y el chat de prueba muestra el **recurso que enviaría** (imagen/audio/
  PDF con su texto).
- El resultado de cada herramienta viaja al panel para esa previsualización.

Nota: en la prueba el bot decide por IA. Para que mande un recurso, el campo **"cuándo usarlo"**
debe ser concreto (ej. "cuando pidan ofertas o promos") y hay que escribir algo que lo dispare.

## [1.59.0] — 2026-10-09

### Agregado — Galería de recursos (subida) + envío natural por WAHA

- **Galería (`/admin/recursos`)**: subí **imágenes, notas de voz y PDF** desde el panel (o pegá una
  URL). Se guardan con estrategia **auto**: bucket R2 `MEDIA` si está bound; si no, en D1
  (`media_assets`). Se sirven por **enlace firmado** público `GET /media/:token` (el canal descarga
  la URL para reenviar el archivo). Las imágenes se comprimen en el navegador antes de subir.
- **El bot sabe cuándo mandar cada recurso**: cada uno lleva un campo **"cuándo usarlo"** y el
  catálogo completo (nombres + cuándo) se inyecta al prompt. Antes, el modelo solo conocía los
  nombres cuando fallaba una llamada a `enviarRecurso`.
- **Envío natural por WAHA**: imagen por `/api/sendImage`; **nota de voz real (PTT)** por
  `/api/sendVoice` con `convert:true`; documento por `/api/sendFile`. Presencia "escribiendo…" y
  "grabando audio…" (`startTyping` / `presence`) y **confirmación de lectura** (`sendSeen`) al recibir.
- **Recursos en flujos y seguimientos**: los pasos de un disparador aceptan `@recurso` (tercer campo
  de la línea `minutos|contenido|@recurso`, también en pasos diferidos); el Cazador y el Reenganche
  pueden adjuntar un recurso elegido en **Extras**.
- **R2 opcional**: el template incluye el binding `MEDIA` (`kooni-bot-catalog`) y el instalador lo
  comenta solo si la cuenta no tiene R2 — el bot funciona igual con D1.

Instalaciones existentes: aplicar el esquema (`pnpm db:apply:remote`, crea `media_assets` y
`trigger_step_media`) y desplegar. Requiere el toggle **Permitir multimedia** y el módulo **Galería**.
WAHA sigue siendo **edición privada** (no se distribuye a instalaciones públicas).

**CLI `kooni-bot` → 0.8.1** (pendiente de publicar): el instalador ahora comenta el binding R2
`MEDIA` (antes `CATALOG`, que ya no existe) cuando la cuenta no tiene R2. El template se baja de
GitHub igual, así que no es imprescindible para actualizar instalaciones.

## [1.58.1] — 2026-10-08

### Arreglado — la tarjeta de WAHA ahora se muestra cuando el módulo está activo

- Antes, `/admin/conexiones` ocultaba la tarjeta de WAHA salvo que ya existiera
  `WAHA_API_URL`, así que con el módulo `canal_waha` activado en el super admin el dueño
  **no podía cargar los datos** (huevo y gallina). Ahora la tarjeta se muestra si el módulo
  está desbloqueado (o si ya está configurado), por lo que se pueden pegar URL/API key/sesión.
- Las instalaciones existentes solo necesitan `npx kooni-bot update`.

## [1.58.0] — 2026-10-08

### Agregado — canales activables por licencia, pasos de flujo programados e i18n

- **Módulos de canal por super admin**: nuevo módulo `canal_waha` en el catálogo
  (`src/modules.ts`). El webhook de WAHA ahora exige que el módulo esté desbloqueado
  (`verifyWahaWebhook`), así el super admin **activa/desactiva el canal por instalación**
  desde el panel. Retrocompatible: sin `module_unlocks` (instalaciones viejas) queda abierto.
- **Pasos de `flow` programados** (`delay_minutes`): los pasos con demora se agendan en el
  Durable Object (`cf_agents_schedules` + `setAlarm`, nueva callback `runFlowStep`); los de
  demora 0 se siguen mandando al instante. El texto de cada paso (incluidos los `ai:`) se
  resuelve al disparar.
- **i18n completo** de las vistas nuevas (Etiquetas, Cotizaciones, Disparadores) es/en.
- **Hub InsForge**: migración `20261008120000` **aplicada** — 5 módulos en `modulos_catalogo`
  (incluye `canal_waha`) y 2 novedades publicadas para todos los clientes.
- Tests: `test/triggers/engine` (+1: `flow` agenda los pasos con demora).

### Nota operativa — instalación `madrigal`
- Cuenta Kooni creada para **mario.madrigal205@gmail.com** y la instalación `madrigal`
  (uid `70fb40`, tier pro) + su licencia re-ligadas a esa cuenta (antes pertenecían al
  usuario admin). El instalador había quedado bajo la cuenta con la que el CLI estaba
  logueado, no bajo el correo del dueño — el vínculo es por **sesión del CLI**, no por email.

### Hub — tarifa mensual por cliente (override de la licencia)
- `licencias.precio` + `moneda` + `plan_ref` (migración `20261008140000`). Editables en
  **AdminLicencias → Tarifa**; el cliente la ve en **Plan** ("tu tarifa").
- `functions/pago-crear` cobra esa tarifa en vez del precio del plan (si `plan_ref` es null o
  coincide). Sin override, los planes siguen igual. `pago-crear` y el panel ya desplegados.
- Caso real: `madrigal` = **USD 40/mes** (`plan_ref=kooni+`).

## [1.57.0] — 2026-10-08

### Agregado — etiquetas con IA, cotizaciones en PDF, disparadores y migración de cuenta

- **Etiquetado inteligente** (`etiquetas_ia`): catálogo de etiquetas definido por el
  usuario (`src/db/labels.ts`) + reglas por **palabra clave** (en tiempo real, en
  `src/agent.ts::ingest`) y por **IA** (clasificador en el análisis nocturno, motor
  `src/labels/engine.ts`). Tool `etiquetarConversacion` para que el modelo etiquete
  al reconocer la condición. Panel `/admin/etiquetas`, chips y filtro por etiqueta en
  Conversaciones, badges en el kanban.
- **Cotizaciones en PDF** (`cotizaciones` + `archivos_salientes`): borradores
  (`quotes`/`quote_items`) que arma el bot con la tool `crearCotizacion` (nicho
  eventos), plantilla HTML editable con marcadores + bloque de ítems
  (`src/quotes/template.ts`), PDF vía **Cloudflare Browser Rendering** (`src/quotes/pdf.ts`,
  binding `BROWSER`, opcional) servido por **enlace firmado** `GET /q/:token` (sin R2).
  Editor de borrador (`/admin/cotizaciones/:id`) y tarjeta en el hilo con Editar /
  Enviar / Reenviar. Envío de **documentos** en `OutgoingReply` (Telegram, WAHA, Zernio).
- **Disparadores keyword→flujo multi-canal** (`flujos`): tabla `triggers` + motor
  `src/triggers/engine.ts` que corre en `ingest` (todos los canales). Acciones:
  responder texto, responder con IA, etiquetar, capturar lead, pasar a humano o
  secuencia de mensajes. Panel `/admin/disparadores`.
- **`npx kooni-bot migrate`** (CLI 0.8.0, **publicado en npm**): migra una instalación **íntegra**
  a otra cuenta de Cloudflare (D1 + esquema + re-index de la KB + secrets + deploy +
  re-vinculación de licencia). Solo copia; la cuenta de origen no se toca. Doc:
  `docs/MIGRACION.md`.
- **Novedades** (hub InsForge, migración `20261008120000`): publica la migración y las
  funciones nuevas para todos los clientes + los 4 módulos nuevos en `modulos_catalogo`.
- Tests: `test/db/labels`, `test/labels/engine`, `test/tools/etiquetarConversacion`,
  `test/db/quotes`, `test/quotes/{template,link}`, `test/tools/crearCotizacion`,
  `test/db/triggers`, `test/triggers/engine`.

## [1.56.0] — 2026-10-05

### Agregado — el prompt manual acepta etiquetas `{{...}}` (con barra para insertarlas)

El "Prompt del agente (avanzado)" dejó de ser texto muerto: ahora puede reutilizar
piezas del prompt automático con etiquetas `{{...}}`, y el panel trae una barra para
insertarlas sin memorizarlas.

- **Sustitución real de etiquetas** (`applyPromptTokens` en `src/system-prompt.ts`):
  un prompt manual se procesa con los mismos tokens que el automático
  (`{{BUSINESS_CONTEXT}}`, `{{TOOL_LIST}}`, `{{NICHO_PLAYBOOK}}`, `{{LECCIONES}}`,
  `{{INSTRUCCIONES}}`, `{{BOT_NAME}}`, `{{BUSINESS_NAME}}`, `{{LANGUAGE}}`… y el
  resto del template) al construir el prompt. Un texto sin etiquetas queda idéntico.
- **Barra de inserción** (`src/admin/views/prompt-tokens.ts` + el motor en
  `layout.ts`): chips de **etiquetas** y de **herramientas**, más un menú que aparece
  al escribir **`/`** en el campo (filtra, navega con ↑/↓ y se inserta con Enter).
  Disponible en **Configuración → Prompt del agente (avanzado)** y en **Mi Agente →
  Flujo → Agente (Cerebro)**; las herramientas ofrecidas son las activas de esa
  instalación (respeta las apagadas con `disabled_tools`).
- **Bilingüe** es/en (claves `pt.*` en los diccionarios del panel).
- Tests: `test/admin/prompt-tokens.test.ts` + casos nuevos en
  `test/system-prompt.test.ts` y `test/settings-loader.test.ts`.

### Corregido — saneamiento de la suite (12 tests rojos heredados de `main`)

- **Auditoría**: `aisa_api_key` entra a `AUDIT_SENSITIVE_KEYS` — se guardaba **en
  claro** en `/admin/auditoria` y su export CSV (el test-guarda ya lo vigila).
- **`test/admin/comentarios`** (5): el inbox llamaba a `adminApp` con el prefijo
  `/admin`, pero la app registra rutas relativas y `index.ts` la cuelga en
  `/admin` → daba **404**; además el detalle ligaba el comentario a una regla con
  **id ficticio** en vez del id real. Alineado con `inbox.test.ts`.
- **`test/tools/solicitarTaxi`** (4): la semilla no creaba la conversación que
  exige el `FOREIGN KEY` de `taxi_trips.conversation_id`.
- **`test/reports/taxis`** (1): el CSV ya usa el encabezado `REPORTE,métrica,valor`.
- **`test/integrations/decodo`** (1): el modo barato (v1.51) ya no manda
  `headless:"html"`; el test se alinea.

> `pnpm test` queda en **verde** (1199 tests). Nada de esto cambia el runtime del
> bot salvo la redacción de `aisa_api_key`.

> El prompt manual **sigue sustituyendo** al automático (no se suma): lo que cambia
> es que ahora puede **re-inyectar** sus piezas con etiquetas. El CLI `kooni-bot`
> (npm) no cambia.

## [1.55.2] — 2026-10-04

### Corregido — licencias Pro (el bot seguía en Free)

- **Clave pública equivocada en `src/license.ts`**: verificaba con otra clave
  (`…qpP9…`) distinta a la que firma el panel (`…Lxrjpy…`). Los códigos del super
  admin **no validaban** y el bot quedaba en Free cuando la instalación no traía
  la var `LICENSE_PUBLIC_KEY`. Ahora coincide con el firmador, el CLI y
  `wrangler.toml.example`. (Se confirmó validando la firma de un código real.)
- **Super admin → Licencias: ahora muestra y copia el código firmado.** El panel
  lo generaba pero no lo enseñaba, así que no se podía enviar al cliente para
  activarlo a mano. Se agregó la columna "Código" con botón **Copiar** y una
  tarjeta con el código recién firmado.
- **Panel del bot → Licencia: «Sincronizar ahora» siempre visible**, con aviso
  cuando el bot todavía no sincronizó con el panel. La activación del super admin
  se aplica en el próximo sync (botón manual o cron nocturno).
- **Hub (`kooni.click/cli`)**: la aprobación del login del CLI apuntaba a
  `kooni.click` (sitio de marketing) porque faltaba el secret `SITE_URL`; se
  configuró al hub (`https://t6bferet.insforge.site`), así que el link correcto
  sale solo.
- **CLI `kooni-bot` 0.7.1**: `pair`/`deploy` ahora **avisan** cuando el bot no
  pudo sincronizar su licencia (HTTP 401 = token de instalación desincronizado).
  Antes fallaba en silencio, que es justo lo que dejaba al bot en Free sin señal
  alguna.
- **El plan se refleja al instante en el panel del cliente**: `licencia-emitir` y
  el guardado de licencia en el super admin escriben `instalaciones.tier` con el
  plan de la licencia (antes quedaba en `free` hasta que el worker reportara uso).

## [1.55.1] — 2026-10-04

### Corregido — el login del CLI es obligatorio para registrar y licenciar

- **`init` y `deploy` ahora exigen sesión del CLI** (`npx kooni-bot login`): sin
  ella no se instala/despliega (en agente/CI se delega con `login --wait`).
  Antes solo se avisaba al final, así que era fácil quedar con una instalación
  **no registrada** en el panel ni licenciable. `--no-login` queda solo como
  salida explícita para instalaciones anónimas/offline.
- **La instalación se registra y se vincula al panel en el deploy**: se re-emite
  la licencia con la **URL real del worker** y se guarda el **token por
  instalación** (`KOONI_INSTALL_TOKEN`), con el que el worker sincroniza su plan
  y reporta uso (`registrar-uso`) — el enlace instalación ↔ licencia del panel.
  Arregla el caso `init --no-deploy` seguido de `deploy` (procesos distintos): el
  token pendiente se perdía y la instalación no aparecía ni trackeaba.
- El correo del onboarding ya no dice que "registra la instalación" (es solo el
  contacto del dueño); el registro lo hace el login. Guía del agente, `--help` y
  `docs/DESPLIEGUE.md` actualizados.
- CLI `kooni-bot` sube a **0.7.0**.

## [1.55.0] — 2026-10-02

### Agregado — giro **concesionario** (venta de autos)

- **Pack `concesionario`** (`src/niches/concesionario.ts`): panel "Prospectos" con columnas
  auto de interés / interés (contado, financiamiento, auto a cuenta) / presupuesto / prueba de
  manejo, y playbook de venta consultiva sobre el **inventario real** (`inventarioQuery` +
  `fichaAuto`). Reglas duras: no promete aprobación de crédito, tasa ni mensualidad, no valúa
  autos a cuenta, no pide datos sensibles por el chat y no aparta ni cobra. Deriva a un asesor
  en financiamiento, trade-in, negociación y posventa. Acceso "Inventario" en el menú.
- **Importador CSV/Excel de autos** (`src/kb/vehiclesCsv.ts`, formulario en
  `/admin/scraping/inventario`): sirve a quien no tiene sitio legible ni cuenta de scraping.
  Mapea por encabezados es/en o por orden canónico, reporta filas malas sin abortar, reimportar
  actualiza por VIN/título y "reemplazar" quita los vendidos. Los autos quedan marcados
  `source: "csv"`: **el scraping nocturno ya no los borra** (`mergeVehicleStore`, limpieza de
  `webSync` y `rebuildInventoryKb`). Doc `inventario-autos-resumen` en la KB.
- Registrado en CLI, hub (giros, demo simulado, landing es/en, panel de packs vía migración),
  plantillas de KB y CSV de ejemplo, y tests (`niches`, `niches-tables`, `vehiclesCsv`).

### Corregido — giros con cita (clínica, barbería, eventos, inmobiliaria)

- Con Cal.com conectado el bot **nunca reservaba**: los playbooks solo llamaban a
  `captureLead` y el prompt base no explica `scheduleAppointment`. Nuevo bloque compartido
  `AGENDA REAL` (`src/prompt/agenda.ts`): consulta horarios reales, pide correo para reservar y,
  si no hay agenda (`booking_unavailable`), no confirma nada y captura el lead.
- Inmobiliaria: ya no promete "avisarle cuando entre algo así" (el bot no puede escribir por su
  cuenta) y el playbook pasa a tuteo.

### Corregido — promesas de recordatorios que no existen

- La landing, los demos y `ventas/giros.md` de restaurante, clínica y barbería decían que el
  bot recuerda la cita/reserva. No hay motor de recordatorios (solo cobranza lo tiene): se
  quitó esa promesa. El CLI `kooni-bot` sube a **0.6.0** (nuevo giro `concesionario`).

## [1.54.0] — 2026-09-30

### Agregado — el giro **inmobiliaria** pasa a ser un producto vendible

**Inventario de propiedades** (gemelo del de autos: JSON en `settings.web_sync_properties`,
sin tabla nueva, así que sigue valiendo el guard `NICHE_TABLES`):

- **Importador CSV/Excel** (`src/kb/propertiesCsv.ts`): parser propio **sin dependencias**,
  quote-aware (comas y saltos de línea dentro de comillas), autodetecta `,` `;` y tab, mapea
  por **encabezados es/en** y cae al **orden canónico** si no los hay; normaliza precios de
  todos los formatos (`$4,200,000`, `1.250.000`, `12,500 MXN`, `2,500.50`) y reporta la fila
  mala **sin abortar** la importación. Plantilla para el cliente:
  `docs/kb-plantillas/inmobiliaria-propiedades.csv`.
- **Lectura del sitio** (`src/kb/propertiesScrape.ts`): descubre fichas
  (`/propiedades/`, `/inmuebles/`, `/venta/`, `/renta/`…, excluyendo blog/contacto), lee
  **JSON-LD** (`RealEstateListing`, `Product`/`Place`/`Apartment` + `offers`) y el markdown
  que devuelve AIsa; usa el proveedor de `scrape_provider` (directo → AIsa → Decodo).
  **Precio propio para inmuebles**: el extractor de autos topa en 500.000, así que un precio
  de millones se perdía (`priceFromPropertyText`).
- **Panel `/admin/propiedades`** (solo si `BOT_NICHE=inmobiliaria`): KPIs, tabla, filtros
  (venta/renta/sin precio/sin foto), búsqueda, paginación 50, y dos bloques de carga:
  **Importar** (pegar el CSV o subir el archivo con `FileReader`) y **Leer el sitio ahora**.
- **Doc `propiedades-resumen`** en la KB (panorama por zona/operación/rango de precio) y
  corrida registrada en Scraping. **Tick nocturno** que completa foto/precio de lo que entró
  por CSV con link y, si hay sitio configurado, lee las fichas.
- **Tools del bot**: `buscarPropiedad` (filtros exactos: operación, tipo, zona, precio,
  recámaras + paginación con `hayMas`; 0 resultados ⇒ dice que no hay y ofrece las zonas
  disponibles, nunca inventa) y `fichaPropiedad` (ficha + foto + link por el canal). Se
  registran **solo en el giro** (vía `hooks.extraTools`), y `buscarPropiedad` entra en
  "Probar el bot". Playbook del giro reescrito para consultar el inventario real.
- Nuevas claves `web_sync_properties` / `properties_page_size` en settings (+ etiquetas).

**Landing pública por giro** (hub `kooni-paneles`): rutas públicas `/giros` y `/giros/:id`
(antes del gate de sesión: un visitante no espera al login) con la marca de Kooni (fucsia),
**demo simulado** por giro (guion propio, sin backend, sin número real y sin costo),
comando de instalación copiable, los 3 pasos de instalación y un CTA de contacto. i18n es/en
completo (~85 claves). `Plantillas.tsx` comparte ahora la lista de giros (`src/lib/giros.ts`).

**Tests**: `test/kb/properties.test.ts` (store, filtros, anti-invento con precio null,
paginación, merge que conserva la foto, CSV con comillas/tabs/precio de millones),
`test/kb/propertiesScrape.test.ts` (JSON-LD, markdown de AIsa, descubrimiento) y asserts de
los hooks del pack inmobiliaria en `test/niches.test.ts`.

## [1.53.0] — 2026-09-30

### Agregado — elegir el proveedor de scraping: **AIsa (Firecrawl)** o Decodo

El scraping del inventario dejó de depender de una sola API. Nuevo setting
**`scrape_provider`** (Configuración → Scraping): `auto` | `aisa` | `decodo`.

- **AIsa (Firecrawl)** es la salida para sitios que **bloquean al Worker** (403 del
  WAF) o cuando Decodo no tiene cuota. Usa la **misma key del LLM** si esa key es
  de AIsa (`aisa_api_key` vacío ⇒ hereda `llm_api_key`); también se puede pegar una
  propia en el panel.
- **`auto`** (default): intento **directo** (barato) → **AIsa** → **Decodo**.
  El intento directo ahora **exige que el cuerpo sea XML de verdad**: un WAF que
  responde `200` con una página HTML de challenge ya no se confunde con un sitemap.
- **Descubrimiento sin sitemap**: con AIsa se usa `firecrawl/map` sobre el sitio y
  se **sintetiza un sitemap** con las fichas (`/inventory/…`), así el parser de
  inventario existente funciona sin cambios.
- **Fichas**: con AIsa, `firecrawl/scrape` devuelve el markdown de la ficha (1
  crédito) con **precio, millas y la foto** (`extractImageFromMarkdown`), en una
  sola llamada; con Decodo se mantiene el HTML + JSON-LD.
- Nuevo `src/integrations/scraper.ts` (conmutador) y `src/integrations/aisaScrape.ts`
  (cliente Firecrawl: `scrape`, `map`). `AISA_API_KEY` como secret opcional.
- El resumen de la corrida informa cuántas URLs se bajaron **directo / AIsa / Decodo**.
- UI: selector de proveedor + campo de key de AIsa (con origen: panel / LLM / worker).
- Tests: `test/integrations/scraper.test.ts` (directo, challenge del WAF, AIsa, map→XML).

## [1.52.4] — 2026-09-30

### Agregado — "Inventario sincronizado" (ver TODOS los autos del bot)

La pestaña Scraping solo mostraba el **diff** de la corrida: no había forma de ver
el inventario completo, que es de donde venía el "muchos resultados no se ven".

- Nueva vista **`/admin/scraping/inventario`** (linkeada desde Scraping →
  "Ver inventario completo →"): lista **todos** los autos del store con
  **búsqueda** (título / VIN / marca / URL), **filtros** (Sin precio / Sin foto /
  Nuevos / Usados-certificados) y **paginación** (50 por página).
- KPIs: total, sin precio y sin foto (de un vistazo se ve el trabajo pendiente de
  enriquecimiento).
- Tabla con miniatura de la foto, condición, precio, millas, estado de la foto y
  link a la ficha.
- Lógica pura y testeable: `filterStoredVehicles()` y `paginate()` en
  `src/kb/inventory.ts` (+ tests).

## [1.52.3] — 2026-09-30

### Cambiado — el scraping dice POR QUÉ falló el fetch directo (+ reintento)

Cuando el sitemap no se puede bajar directo, el run caía a Decodo y el panel
mostraba SOLO el error de Decodo (p. ej. "cuota agotada"): el motivo real del
fetch directo quedaba escondido en los logs. Ahora:

- El `error_msg` de la corrida guarda los dos motivos:
  `fetch directo: HTTP 403; Decodo: <motivo>`.
- `fetchSitemapDirect` reintenta **una vez** (hay WAF que bloquean de forma
  intermitente) y devuelve el error más informativo.

Así, en **Scraping → detalle de la corrida** se ve si el problema es que el sitio
bloquea al Worker, que Decodo no tiene cuota, o ambos.

## [1.52.2] — 2026-09-30

### Cambiado — pulido visual del panel (misma identidad)

Primer paso de unificación: se agregan **primitivas compartidas** para los
patrones que cada vista armaba a mano con estilos inline distintos.

- Nuevas clases (aditivas, nada se renombra): `.pill` (+ `-ok/-warn/-bad/-accent/-dim`),
  `.alert` (+ `-ok/-warn/-bad`), `.empty`, `.iconbtn` (+ `-ok/-bad`), `.tblwrap`.
- Nuevo `src/admin/views/ui.ts`: `emptyState()`, `alertBox()`, `pill()`,
  `iconSubmit()`.
- **Scraping**: los chips de validación pasan a `.pill` y los botones ✓/✗/↺ usan
  **íconos lucide** (antes eran glifos de texto), con el aviso de error y el estado
  vacío unificados.
- `docs/design-system.md`: estado real del documento + sección de primitivas y la
  regla de i18n de las vistas.

> Sigue pendiente el barrido completo de las ~34 vistas (unificar el resto de los
> estilos inline, íconos y estados vacíos) — es incremental y sin cambios de lógica.

## [1.52.1] — 2026-09-30

### Corregido — "Oído y vista" en WAHA: el archivo se anunciaba con `localhost`

Diagnóstico real en cardaniel: el toggle estaba encendido y WAHA configurado, pero
los marcadores guardados eran `waha:http://localhost:80/api/files/…` — WAHA
anuncia sus archivos con su **propio** origen cuando no tiene `WAHA_PUBLIC_URL`.
Desde el Worker ese origen no existe, así que la descarga fallaba y el audio
quedaba como "(no pude entender el audio)" y la foto nunca llegaba al modelo.

- `resolveWahaMediaUrl()` (`src/channels/wahaCredentials.ts`): si la URL de WAHA
  viene con host local (`localhost`/`127.0.0.1`/`0.0.0.0`) o relativa, se
  reescribe el origen al **`base` configurado**, conservando el path. Una URL con
  host real se deja intacta.
- Se aplica tanto al **bot** (`src/media/fetchRef.ts`: transcripción y visión) como
  al **proxy del panel** (`src/admin/media.ts`), que además sigue validando que la
  URL resuelta pertenezca al host configurado (no abre un proxy SSRF).
- Regresión: `test/media/fetchRef.test.ts`.

> Nota operativa: en esta instalación `module_unlocks` estaba en `["web_sync"]`,
> lo que **apagaba** las funciones de Extras aunque sus toggles estuvieran en `1`
> (oído/vista, multi-idioma, blindaje, cazador, reenganche, vigilante, voz de
> marca). Se quitó esa clave para volver al default "todos los módulos", dejando
> que los toggles manden. (`[]` NO sirve: "presente ⇒ exactamente esos ids".)

## [1.52.0] — 2026-09-30

### Agregado — el panel del bot quedó 100% bilingüe (ES/EN)

Se completó la traducción de **todas** las secciones del panel `/admin`, no solo
el shell:

- **Todas las vistas** traducidas: Inbox (Conversaciones, Comentarios, Contactos,
  Leads, Tickets), Configuración y Conexiones, Mi Agente (Flujo, Probar,
  Conocimiento, editores), Automatizaciones, Licencia, Extras, y Análisis
  (Resumen, Scraping, Estadísticas, Insights, Costos, Mejoras, Auditoría,
  Campañas), más los nichos (Pedidos, Viajes, Cartera, Cola, Conductores,
  Reportes), la pantalla de **ingreso** y las **tarjetas de control** de
  Configuración.
- **Mensajes flash/redirect** de las acciones del panel (guardados, errores,
  avisos) también traducidos (`msg.*`).
- Diccionarios por área (`src/admin/locales/{es,en}/`: `core`, `inbox`, `config`,
  `analisis`, `agente`, `resto`); el **par ES/EN se valida por tipo** y por test.
- ~1900 claves. **El español sigue siendo el default y byte-idéntico**, así que el
  panel se ve exactamente igual que antes hasta que cambies el idioma, y los
  tests que afirman textos en español siguen pasando.
- Los helpers compartidos (`ago()` de tiempo relativo) y el selector 🇲🇽/🇺🇸 del
  header se mantienen como única fuente del idioma, independiente de
  `BOT_LANGUAGE` (el idioma con el que el bot le habla a los clientes).

## [1.51.0] — 2026-09-30

### Corregido — el scraping de inventario ya no depende de la cuota de Decodo

La corrida fallaba con **HTTP 429** de Decodo ("used all requests / subscription
period ended"), aun con saldo, porque **todo** pasaba por Decodo y `scrapeUrl`
pedía siempre lo más caro (`proxy_pool: "premium"` + `headless: "html"`) y no
reintentaba. Ahora:

- **Sitemaps/XML por fetch directo** (`src/integrations/directFetch.ts`): el
  sitemap es público y estático, se baja sin gastar requests de Decodo (con
  fallback a Decodo si el sitio bloquea al Worker). El resto sigue por Decodo.
- **Reintentos con backoff** ante 429/5xx/timeout (respeta `Retry-After`).
- **Modo barato**: pool `standard` y sin headless por default (el XML no los
  necesita).
- **Errores accionables y clasificados** (`quota` / `auth` / `rate_limit` /
  `server` / `empty` / `timeout`): en vez del cuerpo truncado, un mensaje que dice
  qué revisar; ante `quota` la corrida se corta en vez de martillar la API.
- El resumen de la corrida informa cuántas URLs fueron directas y cuántas por Decodo.

### Agregado — validar los cambios del scraping (última vs anterior)

- Nueva tabla `web_sync_change_reviews`: cada cambio de una corrida puede marcarse
  **confirmado** / **descartado** (o volver a pendiente) desde la pestaña Scraping,
  con el estado visible y filtros *Pendientes / Confirmados / Descartados*.
- El detalle de la corrida sigue agrupando por auto con `viejo → nuevo`, ahora con
  su estado de validación al lado de cada campo.

### Agregado — inventario: el bot lista 25 y pagina

- `queryInventory` pagina (`limit`/`offset`, `hasMore`) y el default sube de **12 a
  25** autos por consulta (configurable con `inventory_page_size`, clamp 1..50).
- `inventarioQuery` acepta `pagina` y, con `hayMas`, el bot ofrece "¿querés ver más?"
  en vez de cortar en silencio.

### Agregado — idioma del panel del bot (ES/EN)

- Infra i18n del panel SSR (`src/admin/i18n.ts` + `src/admin/locales/{es,en}.ts`) y
  setting `panel_language`. **Español sigue siendo el default** (nada cambia hasta
  que lo cambies).
- Selector 🇲🇽/🇺🇸 en el header; navegación, breadcrumb, título, pill "BOT EN LÍNEA",
  "Cerrar sesión" y el pie del sidebar traducidos. Es independiente del idioma con
  el que el bot le habla a los clientes (`BOT_LANGUAGE`).
- Ruta `POST /admin/config/language` (auditada).
- Las vistas restantes se traducen por fases (el idioma ya funciona en el shell).

## [1.50.0] — 2026-09-30

### Agregado — pestaña "Comentarios" tipo inbox (Zernio)

La pestaña existía como una tabla plana; ahora es un inbox de dos paneles como
Conversaciones, con lo que faltaba para operarla:

- **Publicación a la que pertenece** cada comentario: nueva tabla `comment_posts`
  (caption + permalink + imagen), que se rellena desde el bloque `post` del
  webhook `comment.received` y, si falta, se completa bajo demanda con
  `GET /v1/inbox/comments/{postId}` (con TTL de 6 h).
- **En qué automatización entró**: regla que disparó (`comments.rule_id` → kind +
  keywords), fallback público, o "sin automatización", más el detalle por pata
  (`dm_logs`: enviado / omitido / fallido con el motivo).
- **Hilo completo**: raíz + respuestas (incluidas nuestras respuestas públicas),
  pedido on demand a Zernio al abrir el detalle.
- Lista con pills (Con regla / Fallback / Sin regla / DM enviado / Resp. pública),
  búsqueda, plataforma y rango de días; polling HTMX.

### Agregado — responder en público y mandar DM desde el panel

- Nuevo `src/channels/zernioComments.ts`: `fetchCommentThread`, `replyToComment`
  y `privateReplyToComment` (con `Idempotency-Key`, timeout y detección de la
  private reply ya consumida de Meta).
- Acciones desde el detalle: "Responder en público", "Enviar DM" y
  "✨ Generar con IA" (borrador). Auditadas (`comment.reply`, `comment.dm`) y con
  el tope diario de respuestas públicas compartido con el bot.

### Agregado — respuesta dinámica con IA a comentarios

- Nuevo fallback global (`comment_ai_fallback_enabled` + `comment_ai_fallback_prompt`):
  los comentarios que no matchean ninguna regla reciben una respuesta pública
  generada por el modelo del dueño (en el idioma del comentario). Tiene prioridad
  sobre el texto fijo (`commentFallbackMessage`). Se configura en
  `/admin/automatizaciones`.
- `src/aiReply.ts`: `generateAiCommentReply` acepta el caption de la publicación y
  el hilo como contexto (`generateAiPublicReply` delega en ella).

## [1.49.0] — 2026-09-29

### Corregido — "Oído y vista": el bot no leía audio ni fotos en canales con credencial

Con el toggle **Oído y vista** encendido, el bot no transcribía notas de voz ni
"veía" imágenes cuando el canal era WAHA (WhatsApp self-hosted) o Telegram con el
token configurado desde el panel. Causa: la descarga del archivo se hacía **sin
las credenciales del canal** — `transcribeAudio` hacía un `fetch` pelado (WAHA
responde 401/403) y la visión reponía el token con `env.TELEGRAM_BOT_TOKEN` (no
con el resuelto) y dejaba que el proveedor de IA bajara la URL anónimamente.

- Nuevo `src/media/fetchRef.ts` (`fetchMediaBytes`): descarga con las credenciales
  del canal (`X-Api-Key` de WAHA, token de Telegram desde settings) y devuelve los
  bytes.
- La imagen se adjunta al modelo como **bytes** (no como URL), así no depende de
  un fetch anónimo y el token no sale del worker.
- El panel ya usaba este criterio (`/admin/media/*`); ahora el agente también.
- Regresión: `test/media/fetchRef.test.ts` + `test/media/vision.test.ts`.

### Corregido — los seguimientos salían siempre en español

El Cazador de ventas (`runFollowups`) y el Reenganche (`runReengagements`) tenían
el prompt **hardcodeado en español**: seguían en español aunque la conversación
fuera en inglés.

- Nuevo `src/followup/language.ts` (`conversationLang`): detecta el idioma de los
  mensajes del cliente (`detectLanguage`, es/en/pt) y, si no hay certeza, usa
  `BOT_LANGUAGE`.
- Ambos prompts ahora llevan la directiva explícita de idioma, así el seguimiento
  mantiene el idioma de la conversación.

### Agregado — panel (`kooni-paneles`) en español e inglés

- El panel completo (área cliente + super admin) se puede ver en **español o
  inglés**, con un **desplegable de bandera** en la barra lateral y en
  Configuración.
- La preferencia se guarda **por usuario** en `public.profiles.language`
  (migración `20260929000000_kooni-profiles-language.sql`) y es **independiente**
  del idioma del bot (`BOT_LANGUAGE`), que sigue detectando el idioma del cliente.

## [1.48.0] — 2026-09-23

### Agregado — sistema de licencias (super admin + panel del cliente) y login del CLI

- **Backend InsForge `kooni`** (`migrations/` + `functions/`): licencias por
  instalación con módulos, límites y marca blanca; uso agregado (sin PII).
- **Paneles** (`kooni-paneles/`, React + Vite): super admin (`/admin`) y panel del
  cliente (`/`), desplegados en InsForge.
- **Bot**: `syncLicenseState()` (cron + `POST /license/sync`, fail-open) aplica
  plan/módulos/límites/marca desde el panel; `unlockedModules()` reactiva el gating
  por módulo (sin `module_unlocks` → todo abierto, retrocompatible).
- **CLI `kooni-bot login`** (device flow) + registro de la instalación
  (`licencia-emitir`) y token por instalación (`KOONI_INSTALL_TOKEN`).
- Nuevas vars: `KOONI_API_URL`, `KOONI_INSTALL_TOKEN`, `LICENSE_PUBLIC_KEY`.

## [Unreleased]

### Corregido — mensajes que se perdían al pausar (conversación "vacía")

Una conversación podía aparecer en la bandeja **sin ningún mensaje** (ni
recibidos ni enviados) y sin respuesta del bot. Causa: `ingest()` creaba el hilo
y recién guardaba el mensaje en `processBuffer()`; cualquier salida temprana
(pausa de canal, bot pausado, takeover, spam, tope diario, límite free) dejaba el
hilo creado pero vacío.

- **El entrante se guarda siempre** (`SupportAgent.persistInbound()`), antes de
  cualquier decisión de responder. `processBuffer()` ya no lo duplica.
- La pausa ahora apaga la **respuesta**, nunca el **registro**: el dueño ve en el
  panel lo que el cliente escribió aunque el bot esté en pausa o en takeover.
- **Timeouts de 15s** en los envíos salientes de Zernio, WAHA y Meta: un
  proveedor colgado ya no bloquea el Durable Object ni la conversación.
- Nuevo runbook: [`docs/MENSAJERIA.md`](./docs/MENSAJERIA.md) (ciclo de vida,
  matriz de pausas y diagnóstico).
- Regresión en `test/agent.media.test.ts`: "el mensaje del cliente NUNCA se pierde".

### Corregido — el QR de WAHA no aparecía (sesión en FAILED/STOPPED)

Con la URL y la API key bien puestas, la card de WAHA se veía "CONECTADO" pero
sin QR. El panel solo pintaba el QR cuando el estado era `SCAN_QR_CODE` o
`STARTING`; si la sesión quedaba `FAILED` (WhatsApp deslogueado), `STOPPED` o
inalcanzable, la card quedaba muda — sin QR y sin pista de qué hacer.

- **Nunca más en blanco**: cualquier estado configurado muestra algo — el QR, una
  explicación del estado real (con el status de WAHA) o el aviso de que el
  servidor no responde.
- **Botón «Reiniciar sesión y generar QR»** (`POST /admin/conexiones/waha/restart`)
  para recuperar una sesión caída sin re-guardar la card a mano.
- El `<img>` del QR tiene fallback visible si el proxy falla, y el QR se
  **renueva solo cada 20s** (WhatsApp lo rota: así el escaneo no falla por caducar).

## [1.47.0] — 2026-09-14

### Agregado — Nicho TAXIS (central de despacho con bases y cola de conductores)

Nuevo pack opt-in (`BOT_NICHE=taxis`) para cooperativas/centrales de taxis. El
bot atiende al cliente que pide un taxi y despacha solo; si no hay conductores,
escala al operador.

- **Bases y conductores** en el panel (`/admin/bases`, `/admin/conductores`):
  cada base tiene zonas (con tarifa), coordenadas, tarifa base y ETA; cada
  conductor tiene código, WhatsApp, base, vehículo y placa.
- **Cola FIFO por base** (`/admin/cola`): el conductor entra al final de la fila
  escribiendo desde su WhatsApp registrado; el bot lo reconoce e intercepta el
  mensaje ANTES del agente (`src/taxi/driverInbound.ts`), así no pasa por el
  modelo ni aparece como conversación de cliente. Comandos: `salir`, `fin`,
  `estado`; cualquier otro texto = “llegué”.
- **Despacho automático**: el bot pide la ubicación (pin de WhatsApp o zona) y
  elige la base más cercana con conductores — por GPS (Haversine) o por match de
  zona — y asigna al siguiente de la fila. Tool `solicitarTaxi`.
- **Sin conductores → urgente**: el viaje queda `sin_conductor` y el chat se
  marca con ticket + etiqueta de atención humana + aviso al dueño, para que el
  operador asigne a mano.
- **Elegir conductor desde el chat**: selector en la cabecera del hilo
  (`POST /admin/conversations/:id/assign-driver`) que asigna (o crea) el viaje y
  le manda al cliente el conductor asignado.
- **Panel de viajes** (`/admin/viajes`) con avance de estado, asignación manual y
  alerta sonora de viaje nuevo; PWA abre en Viajes (`/admin/viajes?tv=1`).
- **Reportes** (`/admin/reportes`): viajes, por base, ranking de conductores,
  demanda por zona, ingreso estimado y salud del bot — con export CSV.
- **Canales del nicho**: solo WhatsApp (Cloud API oficial + WAHA). En Conexiones
  y en el flujo del agente se ocultan los demás canales.
- **Cron**: `runTaxiMaintenance()` expira conductores que llevan demasiado en la
  cola y cierra viajes colgados.
- **Tablas nuevas** (idempotentes, `src/db/schema.sql`): `taxi_bases`,
  `taxi_drivers`, `taxi_queue`, `taxi_trips`, `taxi_trip_events`.
- **KB**: plantillas `docs/kb-plantillas/taxis-{faq,tarifas,casos-limite}.md`.
- **Ubicación entrante**: los adaptadores de WhatsApp Cloud y WAHA ahora leen el
  pin de ubicación (`IncomingMessage.location`).

> Instalaciones existentes: `pnpm db:apply:remote` crea las tablas (idempotente,
> no toca datos) y el `BOT_NICHE=taxis` queda inerte hasta que se active.

### CLI

- `kooni-bot@0.4.1`: `taxis` agregado a la lista de giros del instalador.

## [1.46.0] — 2026-09-14

### Agregado — Zona horaria del negocio configurable (una sola fuente de verdad)

- Nuevo setting **Configuración → 🕐 Zona horaria del negocio**
  (`business_timezone`, select de zonas IANA comunes). Se valida del lado del
  servidor: una zona inválida se ignora y cae al default, así un typo no puede
  mandar las citas a la hora equivocada.
- Antes había **tres orígenes** que se podían desincronizar: el reloj del bot y
  la agenda leían `env.CALCOM_TIMEZONE` (con fallback hardcodeado), y las fechas
  del panel leían `member/config.local.ts`. En cardaniel eso significaba que el
  bot pensaba en hora de Ciudad de México mientras el negocio está en Florida:
  **dos horas de desfase** al interpretar "hoy", "mañana" o al pedir horarios.
- Ahora manda el setting y todos leen de `src/timezone.ts`:
  el reloj del bot, la agenda de Cal.com, el guardia de "fecha en el pasado" y
  el default de Cal.com (antes duplicado). Precedencia:
  `business_timezone` → `CALCOM_TIMEZONE` (legacy) → default.

### Arreglado — El prompt del bot no se podía cachear nunca

- El prompt generado incluía la **hora con precisión de minuto**, así que su
  texto cambiaba cada 60 segundos y **OpenAI nunca acertaba el caché de prefijo**:
  el prompt completo (~2-3k tokens) se re-pagaba en cada turno y en cada paso del
  loop de tools.
- El prompt grande ahora lleva **solo la fecha** (estable durante todo el día) y
  la **hora exacta + offset** se inyecta en un bloque de sistema aparte,
  recalculado cada turno. El bot sigue sabiendo qué hora es —lo que necesita para
  agendar y para "hoy"/"mañana"— sin romper el caché.

### Tests

- `test/timezone.test.ts`: validación de zonas, precedencia, e invariancia de la
  fecha dentro del mismo día (que es lo que habilita el caché) incluyendo el
  cambio de día según la zona.

## [1.45.0] — 2026-09-14

### Arreglado — El scraping de inventario no traía datos (sitemaps XML)

- **Causa raíz**: los sitemaps de inventario (`.../inventory_sitemap`) son **XML**
  y se pedían a Decodo con `markdown: true`. El conversor a Markdown no maneja
  XML, así que Decodo respondía **200 con `content` vacío** → `scrapeUrl`
  devolvía "sin contenido" y la corrida entera fallaba. En cardaniel estaban
  fallando **las 3 últimas corridas**, y el sync caía a modo texto sin
  actualizar el inventario.
- Ahora, si la respuesta en Markdown viene vacía y no se pidió HTML de forma
  explícita, `scrapeUrl` **reintenta una vez sin markdown** y devuelve el
  XML/HTML crudo. El parseo determinista (`parseInventoryFromAny`) ya sabía leer
  sitemaps: solo faltaba que le llegara el contenido.
- **Verificado a nivel unitario con mocks.** No pudo confirmarse contra la API
  real: durante el diagnóstico Decodo devolvía `401` con saldo agotado.

### Arreglado — Un feed caído congelaba precios y fotos para siempre

- El enriquecimiento nocturno (`refreshVehicleImages`: precio, millas y foto de
  cada ficha) vivía **dentro** del bloque `inventorySeen`, así que bastaba con
  que el feed fallara para que ni se intentara. En cardaniel eso dejó **280 de
  449 autos sin precio y 152 sin foto**, acumulándose corrida tras corrida.
- Ahora corre siempre que la corrida nocturna lo pida, haya o no inventario
  nuevo. Sigue siendo seguro: solo AGREGA datos (nunca borra) y está acotado a
  20 autos por corrida con cooldown por ficha.

### Tests

- `test/integrations/decodo.test.ts`: 3 casos nuevos del fallback — recupera el
  XML, no reintenta si se pidió HTML explícito, y propaga el error si el
  reintento también falla.

## [1.44.0] — 2026-09-14

### Agregado — Modelo de análisis separado del del chat

- Nueva sección **Configuración → Modelo de análisis (scraping)**: proveedor,
  modelo, URL base y API key **propios**, independientes del chat. Permite pagar
  un modelo bueno para el análisis (ej. Claude Opus) y uno barato para chatear
  (ej. gpt-4o-mini), incluso contra **otra API**.
- Todo vacío = **hereda la configuración del bot** (misma API, mismo modelo).
  La API key y la URL base se heredan solo si el proveedor coincide: heredar una
  llave de OpenAI para llamar a Anthropic daría 401.
- Claves nuevas: `analysis_llm_provider`, `analysis_llm_api_key`,
  `analysis_llm_model`, `analysis_llm_api_base_url`.
- `createAnalysisModel()` en `src/llm/provider.ts` (tier `smart` por defecto:
  el análisis corre pocas veces al día y conviene el modelo bueno).

### Agregado — Análisis IA del inventario scrapeado (opcional)

- Nuevo toggle **Extras → Análisis IA del inventario**
  (`feature_web_sync_analysis_enabled`), **apagado por defecto**.
- Tras cada sincronización, el modelo revisa los autos ya parseados y devuelve
  **correcciones** de título, marca, modelo, año, precio, millaje y condición.
- **Garantías**: el modelo solo puede tocar autos que ya existen (por `key`) —
  nunca agrega ni borra —, cada corrección se valida por rango antes de
  aplicarse, y un fallo del modelo **nunca** bloquea ni vacía el inventario.
  Cota de 40 autos por corrida, priorizando los sospechosos (sin VIN, sin
  precio, sin año o con título basura).
- El resultado queda registrado en el scraping (`web_sync_runs.note`).

### Arreglado — Multi-idioma: no funcionaba en la práctica

- **Causa raíz**: las reglas de idioma vivían SOLO en el texto del prompt, así
  que un `system_prompt_override` las desactivaba por completo — el toggle de
  Extras se podía encender y apagar sin que cambiara nada.
- Nuevo detector de idioma determinista **es/en/pt** (`src/lang/detect.ts`):
  stopwords + señales diacríticas (`ñ/¿/¡` vs `ã/õ/ç`), sin API externa. Ante
  duda devuelve `null` en vez de adivinar.
- El idioma del cliente se detecta **una vez por conversación** y se inyecta
  como **bloque de sistema aparte** del prompt → gobierna haya o no override.
- **Contrato del toggle**: con Multi-idioma apagado el bot responde SIEMPRE en
  el idioma base (`BOT_LANGUAGE`); encendido, sigue el idioma del cliente.
- Las respuestas **públicas a comentarios** (`src/aiReply.ts`) ahora también
  respetan el idioma del comentario (antes estaban fijas en español).
- **Bug**: se pasaba `lastUserLang = "es-MX"` pero la tabla de palabras de
  frustración está indexada por `es|en|pt`, así que la detección de frustración
  nunca escalaba al modelo "smart".

### Arreglado — El bot no encontraba la información del inventario

- **Marca tolerante**: el filtro por marca exigía coincidencia EXACTA
  (`make === filtro`), así que mandar "kia sorento" o "KIA " devolvía 0
  resultados y el bot concluía que ese auto no existía.
- El límite de resultados por consulta pasó de **8 a 12** y, cuando hay más
  coincidencias que el límite, la tool devuelve un **panorama agregado** (rango
  de años y de precio) e instruye a acotar con el cliente en vez de listar todo
  o hacer creer que solo hay 12.

### Arreglado — Toggles del menú Extras que no gobernaban nada

- `feature_web_sync_enabled` se escribía desde el panel pero **nadie lo leía**:
  el sync corría igual. Ahora apagarlo detiene de verdad la corrida (cron, API y
  panel). Lectura compatible hacia atrás: solo un `"0"` explícito apaga; una
  instalación donde nunca se tocó sigue sincronizando como antes.
- `AgentConfig.oidoVistaEnabled` era un campo muerto (el gate releía los
  settings): ahora es la **única fuente de verdad** del toggle "Oído y vista".

### Arreglado — Respuestas públicas detrás de un gateway

- `aiReply` construía sus overrides a mano y **omitía `llm_api_base_url`**, así
  que con un gateway (AIsa/OpenRouter) esa llamada fallaba mientras el chat sí
  funcionaba.

### Notas

- El paquete npm `kooni-bot` (CLI) **no cambia**: todo esto vive en la app del
  Worker, no en el instalador.

## [1.43.0] — 2026-09-11

### Agregado — Registro de scraping (control interno de Decodo)

- **Nueva sección Análisis → “Scraping”** (`/admin/scraping`, solo lectura): qué
  pasó en cada corrida de Decodo (Web Sync / inventario), sea del **cron
  nocturno**, del botón **manual** del panel o del endpoint por token.
- Por corrida guarda el **resumen** (autos totales, nuevos, vendidos/salieron,
  cambios, errores, duración) y el **detalle**: autos **nuevos** (con link),
  **vendidos** y **cambios campo a campo** (título, condición, precio, millas,
  link y desglose de precio) mostrados como `antes → después`.
- KPIs (autos actuales, última corrida, nuevos/vendidos/cambios de 7 días),
  filtro por disparador, paginación, **export CSV** y botón **“Scrapear ahora”**.
- Persistencia en D1: tablas `web_sync_runs` + `web_sync_changes` (se crean en
  toda instalación) y retención de **90 días** (purga en el cron nocturno).
- El diff es **informativo**: nunca altera el inventario.
- Acceso directo desde **Configuración → Scraping web (Decodo)**.

## [1.42.0] — 2026-09-10

### Agregado — API key de Decodo configurable desde el panel

- Nueva sección **Configuración → Scraping web — API key de Decodo**: el dueño
  pega su credencial (`usuario:contraseña` o base64) **sin `wrangler secret`**.
- Resolución: **settings del panel** primero; si está vacía, cae al secret
  `DECODO_AUTH` del worker. **Instalación limpia → vacío** (el scraping queda
  apagado hasta que la pongan).
- Botón **“Usar la del worker”** + `POST /admin/config/decodo-import` y
  `POST /kb/decodo-import` (token) para persistir la key actual del worker.
- El valor se **redacta en el registro de auditoría** (`decodo_auth`).

## [1.41.0] — 2026-09-10

### Agregado — Cobranza: opt-out, ventana horaria, reglas con voz, reportes

- **Opt-out (DNC)**: tabla `collection_dnc` + botón en la ficha. Un deudor que
  pide no ser contactado **nunca** recibe mensajes ni llamadas del motor.
- **Ventana horaria** del motor: hora local desde/hasta + offset UTC (settings y
  panel). El botón “correr ahora” la ignora a propósito.
- **Reglas**: editar desde el panel (además de crear/borrar) y **canal “Voz”**
  que dispara la llamada con IA (Vapi/Retell) en vez de un mensaje.
- **Promesa cumplida**: al registrar el pago total de una deuda, la promesa pasa
  a `kept` y el caso a `pagado`.
- **Reportes** en `/admin/cartera`: tasa de recuperación, efectividad por canal
  (intentos/contactados/promesas/pagos) y embudo por etapa.
- **Filtros** por lista/etapa + paginación y export CSV.
- Docs: `docs/COBRANZA.md` (guía completa del nicho).

## [1.40.0] — 2026-09-10

### Agregado — Cobranza: motor, reglas, voz y promesas (nicho `cartera`)

- **Motor de cobranza** (`src/collections/engine.ts`): recorre las reglas de mora
  activas y manda recordatorios por el canal del deudor, con **cooldown 20 h**,
  **intentos máximos** y **tope por corrida**. Guarda el mensaje en el hilo del
  CRM y registra interacción + intento. Corre en el cron (solo BOT_NICHE=cartera).
- **Reglas de cobranza** en `/admin/cartera`: tramo de mora (días), canal,
  plantilla con variables `{nombre} {negocio} {saldo} {vence} {dias}` e intentos.
- **“Correr cobranza ahora”** y **export CSV** desde el panel; filtros y KPIs.
- **Voz (Vapi/Retell)**: tool `llamarDeudor` + botón en la ficha del deudor. Los
  webhooks `/webhooks/vapi` y `/webhooks/retell` registran el resultado
  (promesa / pago / disputa / sin respuesta) en la cartera y mueven la etapa.
- **Promesas de pago**: recordatorio en las 24 h previas y marcado automático de
  las incumplidas.

## [1.39.0] — 2026-09-10

### Agregado — Nicho “Cartera de cobros” (se elige al instalar)

- **Nuevo pack de nicho `cartera`** (`BOT_NICHE=cartera`): re-etiqueta el panel
  (Gestiones, estados de cobranza), aporta playbook de cobranza (tono firme y
  respetuoso, anti-acoso, escalado obligatorio) y tools propias.
- **Tools del agente**: `consultarDeuda` (saldo real, nunca inventar) y
  `registrarPromesa` (promesa de pago fecha+monto, mueve la gestión a
  `promesa`).
- **Panel `/admin/cartera`** (se suma al nav por `hooks.navExtra`): KPIs (deuda
  total, en mora, en promesa, recuperado), importación de cartera por CSV
  (`nombre, teléfono, monto, vence, referencia`), búsqueda, ficha del deudor con
  deuda, pagos, promesas, historial y etapas.
- **Esquema**: tablas `debtor_lists`, `debtors`, `debt_accounts`,
  `collection_cases`, `collection_interactions`, `collection_contact_attempts`,
  `collection_rules`, `payment_promises` (se crean en toda instalación).
- **CLI `kooni-bot` 0.4.0**: `init` ahora **pregunta el giro** y estampa
  `BOT_NICHE` en `wrangler.toml` (opciones: generico, agencia-ia, restaurante,
  inmobiliaria, clinica, barberia, **cartera**).

## [1.38.0] — 2026-09-10

### Agregado — “Atención humana”: etiqueta + tickets + kanban (general)

- Nueva tabla `conversation_labels` + `ConversationLabelsRepo`. Etiqueta de
  sistema `atencion_humana` (“Atención humana”).
- **Marcado automático**: la tool `handoffHuman` (el bot escala a un humano) y
  el **vigilante** (riesgo detectado) etiquetan la conversación.
- **Conversaciones**: chip/badge `⚑ atención humana` en la lista y un botón en
  el header del hilo para marcarla/quitarla a mano
  (`POST /admin/conversations/:id/label`). Al **resolver el ticket** se quita.
- **Tickets**: la sección ahora muestra el nombre del contacto, canal, el
  **resumen completo**, un extracto del hilo desplegable y un botón
  **“Abrir conversación →”**.
- **Kanban de leads**: badge `⚑ atención humana` en la tarjeta (y marca en la
  tabla).
- Aplica a **todas las instalaciones**: la tabla se crea con `schema.sql` en el
  update.

## [1.37.3] — 2026-09-10

### Arreglado — nombre del lead en WhatsApp (pushName, no el `@lid`)

- `wahaAdapter.parseIncoming` ahora devuelve `displayName` con el **pushName**
  del remitente: lo saca del payload (`_data.notifyName`, `pushName`, `name` de
  `contact`/`sender`) y, si no viene, se lo pide a WAHA
  (`GET /api/contacts?contactId=…&session=…` → `pushname` > `name` > ...). Antes
  no devolvía nombre, así que la conversación/lead quedaba sin nombre y el CRM
  mostraba el id (`7345…@lid`).
- `ConversationsRepo.getOrCreate` hace **backfill** del `display_name` cuando
  existía vacío (no pisa un nombre ya guardado).

## [1.37.2] — 2026-09-10

### Arreglado — los mensajes de WAHA no entraban (shape del webhook)

- `wahaAdapter.parseIncoming` esperaba `payload.text` + `payload.chatId`, pero
  WAHA (WAMessage, verificado contra su OpenAPI) manda **`payload.body`** y
  **`payload.from`**. Resultado: el webhook llegaba, el worker lo descartaba en
  silencio y **no se creaba ninguna conversación**.
- Ahora acepta ambos shapes (`body`/`text`, `from`/`chatId`) y también
  `payload.mediaUrl` como fuente del media. Tests que fijan el shape real de
  WAHA (texto y media).

## [1.37.1] — 2026-09-10

### Arreglado — links clickeables en TODOS los canales

- `pickAdapter` ahora envuelve cada adaptador y normaliza los chunks salientes
  con `toPlainLinks` (Markdown → URL plana). Es el punto único por el que pasan
  **todos** los envíos: agente, tools (`sendReplyCapped`), campañas, follow-ups
  y la respuesta manual del CRM. Antes solo el texto del agente y
  `chunkReply`/`stripMarkdown` lo hacían, así que otros caminos podían mandar
  `[texto](url)` literal (no clickeable en WhatsApp/Instagram/Messenger).
- Zernio: los mensajes de **automatización** (auto-DM, respuesta pública al
  comentario, follow prompt) también se normalizan.
- Test nuevo `test/replies/plainlinks.test.ts` que fija WhatsApp (WAHA),
  Instagram/ Messenger (Meta) y Zernio.

## [1.37.0] — 2026-09-10

### Agregado — Cobros por voz: configuración de Vapi y Retell

- Nueva sección **Conexiones → “Cobros por voz: Vapi / Retell”** con todos los
  campos para conectar cada plataforma: API key, Assistant/Agent ID, Phone
  Number ID / número saliente, webhook secret, API base URL, proveedor activo,
  objetivo/tono del guion de cobranza y intentos máximos por deudor.
- Webhooks listos para pegar en cada dashboard: `POST /webhooks/vapi` (header
  `X-Vapi-Secret`) y `POST /webhooks/retell` (`x-retell-signature`); por ahora
  ack + log (el flujo de llamadas se cablea en la próxima etapa).
- `src/integrations/voiceProviders.ts`: resolución de credenciales (settings D1
  gana; env fallback), claves nuevas en `SETTING_KEYS`/`SETTING_LABELS` y
  redacción de los secretos en el registro de auditoría.

### Notas de la etapa (cardealer)
- Cierre documentado en `PLAN.md` → § CIERRE DE ETAPA — cardealer-daniel.
- Webhooks de WhatsApp/IG/WAHA y el flujo de inventario tal como quedaron.

## [1.36.0] — 2026-09-10

### Agregado

- **`rebuildInventoryKb` + `POST /kb/rebuild`** (mismo token): reconstruye los
  docs de KB del inventario a partir del **store ya poblado** (con precios,
  millas y condición enriquecidos), **sin scrapear el feed**. Sirve cuando el
  sitemap está bloqueado/caído (hoy Cloudflare lo devuelve 403) y deja la KB
  completa y actualizada igual. Idempotente: re-embebe cada parte y borra las
  sobrantes.

## [1.35.1] — 2026-09-10

### Arreglado (crítico)

- **Un fallo de scrape ya no vacía el store del inventario.** La rama que
  limpiaba el store cuando la corrida "no veía inventario" también se disparaba
  ante un error transitorio de Decodo (scrape vacío) — borró los 449 autos.
  Ahora solo se quitan los autos cuyo `feedUrl` ya no está configurado, y nunca
  se toca el store si hubo errores en la corrida.

## [1.35.0] — 2026-09-10

### Agregado

- **KB del inventario con datos reales completos**: al renderizar los docs del
  listado se superponen precio/millas/condición ya enriquecidos del store (el
  sitemap solo trae título/condición/VIN) — el listado queda completo y real.
- **Links clickeables**: `toPlainLinks()` convierte `[texto](url)` a
  `texto (url)` y `<url>` a `url`; aplicado en `stripMarkdown` (todo lo que se
  envía) y al guardar la respuesta del agente (CRM consistente). WhatsApp e
  Instagram no renderizan Markdown: antes llegaba el link literal sin ser
  clickeable.

## [1.34.1] — 2026-09-10

### Arreglado

- El refetch forzado por `key` ya no borra precio/millas/desglose si el scrape
  falla (Turnstile intermitente): solo sobrescribe si Decodo respondió con
  contenido.

## [1.34.0] — 2026-09-10

### Agregado — desglose de precio de la ficha (Price/Discount/Fees/Transparent)

- `extractPricingFromText` + `stripTags`: saca el desglose del widget de precio
  de la ficha (Price, Dealer Discount, Dealer Fee, Admin Processing Fee, Tag
  Agency Fee, WPB Kia Transparent Price) y lo guarda en `StoredVehicle.pricing`.
- El **precio principal** del auto pasa a ser el *Transparent Price* cuando
  existe (es el que expone el JSON-LD `offers.price`).
- `fichaAuto` devuelve `desglosePrecio` y la instrucción pide mostrarlo.
- `mergeVehicleStore` preserva el desglose entre syncs livianos.
- Se quitó el endpoint temporal de diagnóstico.

## [1.33.1] — 2026-09-10

### Arreglado

- Refetch forzado por `key` (`/kb/enrich?key=…`) sobrescribe precio/millas
  aunque el scrape devuelva null, para reparar datos ya guardados.

## [1.33.0] — 2026-09-10

### Arreglado — precio correcto (JSON-LD autoritativo, no texto libre)

- `fetchVehicleDetails` ahora scrapea la **ficha en HTML primero** y toma precio/
  millas del **JSON-LD**. El texto libre del markdown puede traer precios de
  autos "similares" u otros montos (se vio un "$52,110" en un Dodge Durango
  2005). El markdown queda solo como respaldo para la **foto**.
- `POST /kb/enrich?key=vin:…` permite forzar el refetch de autos puntuales
  (para reparar datos ya guardados).

## [1.32.0] — 2026-09-10

### Agregado — detalle completo de cada auto (precio/millas/foto) + link

- **`fetchVehicleDetails`**: al scrapear la ficha de un auto ahora extrae
  **precio, millas y foto**. Precio/millas salen del **JSON-LD** de la ficha
  (`extractDetailsFromHtml`); fallback a texto etiquetado ("Sale Price $…",
  "45,210 miles") y a `og:image`/`<img>`.
- `refreshVehicleImages` y `ensureVehicleDetails` guardan precio/millas además
  de la foto, y `imageCandidates` vuelve a considerar autos **sin precio**
  (el sitemap de origen no lo trae).
- **`fichaAuto`** entrega la ficha completa (VIN, condición, precio, millas,
  link y foto) y ahora se usa SIEMPRE que el cliente pide un auto puntual
  (por nombre/modelo/año/VIN). `inventarioQuery` devuelve también `url` por
  auto y su nota pide incluir el link.
- Prompt: bloque `<inventario>` endurecido — auto puntual → `fichaAuto`;
  siempre incluir el link; nunca inventar precio.
- **`POST /kb/enrich`** (mismo token que `/kb/reindex`): precarga detalles en
  lote sin re-scrapear el sitemap, para llenar el store rápido.

## [1.31.0] — 2026-09-10

### Arreglado — Web Sync del bot de autos (feed muerto → sitemap)

- **El feed `/llm/inventory/` de DealerInspire dejó de existir**: hoy sirve la
  homepage a cualquier user-agent (verificado con GPTBot/ClaudeBot/PerplexityBot/
  Googlebot/Chrome, vía Decodo y vía reader). Por eso el "modo inventario" caía a
  modo texto, `web_sync_vehicles` nunca se creaba y el bot improvisaba (recitaba
  marcas de la home o decía "no tengo acceso").
- **Nueva fuente: el sitemap de inventario de DealerInspire**
  (`/dealer-inspire-inventory/inventory_sitemap`). `parseDealerInventorySitemap`
  parsea cada URL `/inventory/<cond>-<año>-<marca>-<modelo>-<trim>-<VIN>/` y arma
  el vehículo completo (condición, año, marca, modelo, VIN y **el link real de la
  ficha**). `parseInventoryFromAny` elige sitemap o feed según el contenido.
- **`mergeVehicleStore` preserva lo enriquecido**: un sync liviano (sitemap, sin
  precio/millas/foto) ya no pisa el precio/millas/foto que se hayan completado
  scrapeando la ficha.
- **Prompt del agente**: cuando la instalación tiene inventario sincronizado se
  inyecta un bloque `<inventario>` que obliga a usar `inventarioQuery` (y
  `fichaAuto` para la ficha de un auto puntual) — nunca conocimiento general ni
  la KB. Si está configurada pero el store está vacío, un `<inventario_vacio>`
  prohíbe recitar marcas/autos.

## [1.30.0] — 2026-09-10

### Agregado — Web Sync "modo inventario" (bot de autos)

- **Inventario estructurado**: si la página scrapeada parsea como listado de
  vehículos, Web Sync guarda un store en D1 (`settings.web_sync_vehicles`: VIN,
  título, precio, millas, condición, URL de ficha) en vez de un blob de texto.
  Los docs de KB siguen **sin links** (regla v1.25) + un doc `-resumen` con las
  marcas reales y reglas anti-alucinación.
- **Tool `inventarioQuery`**: disponibilidad exacta (marca/modelo/condición/
  precio/VIN). Si una marca no está, devuelve 0 matches y las marcas disponibles
  — el bot no contesta de memoria.
- **Tool `fichaAuto`**: entrega la **ficha real de UN auto** — link de la página
  y **foto** (`og:image`) — solo cuando el cliente pide ese auto o da su VIN. La
  URL sale del store parseado, nunca la inventa el modelo.
- **Fotos**: el feed no trae imágenes; se scrapean de la ficha con Decodo
  (batch nocturno acotado con `refreshVehicleImages` + bajo demanda cacheada).
- `scrapeUrl` acepta `markdown:false` para leer `og:image` cuando el Markdown no
  trae imágenes; el disparo manual y el tick nocturno corren el batch de fotos en
  background (`executionCtx.waitUntil`).
- El pipeline cae al **modo texto legacy** si el contenido no parece inventario,
  así que las demás instalaciones con Web Sync no cambian de comportamiento.

## [1.29.0] — 2026-09-07

### Agregado

- **Kanban de leads** (`/admin/leads`). Vista kanban por defecto (5 columnas,
  drag & drop), vista tabla en `?vista=tabla`. Disponible en todos los planes.
- **Estado `entrada`** ("comunicación de entrada"): toda conversación real deja
  una ficha; si el bot no le sacó una intención queda ahí para clasificar.
- **Tool `moverLead`**: el bot mueve la ficha de la conversación entre etapas y
  deja una nota. El bot lee la etapa actual (`<ficha_panel>`) para dar
  continuidad la próxima vez que ese cliente escriba.

## [1.28.0] — 2026-09-07

### Agregado — nicho `restaurante` (pack "pedidos")

- **Motor de pedidos**: tablas `products` / `orders` / `order_items` /
  `order_events` (idempotentes, solo con `BOT_NICHE=restaurante`).
- **Tool `tomarPedido`**: el bot toma el pedido conversando y lo registra;
  reconcilia precios con el menú y avisa al restaurante.
- **Avisos de estado** al cliente por su canal (recibido → confirmado →
  preparación → en camino → entregado / cancelado) con link de seguimiento.
- **Panel**: `/admin/pedidos` (cola + cambio de estado), `/admin/menu` (CRUD de
  productos, "marcar agotado"), `/admin/reportes` (6 reportes en 1 pantalla,
  cada uno con acción sugerida, filtro por fechas, export CSV).
- **PWA de mostrador**: `/admin/pedidos/feed` + alerta sonora al entrar un
  pedido (Web Audio, sin depender del SO), `?tv=1` modo mostrador, manifest del
  restaurante que abre en Pedidos.
- `NichePack.hooks` (`extraTools` / `navExtra` / `orderEngine`) para packs
  "pesados".

## [1.27.0] — 2026-09-07

### Cambiado

- **Modelo de planes**: todas las funciones disponibles en el plan gratis. Free
  vs Pro se diferencian **solo por límites de cantidad** (`src/limits.ts`). Se
  eliminó el paywall por feature (`PRO_ONLY_TOOLS`/`PRO_ONLY_TABS` vacíos,
  `unlockedModules()` devuelve todo).
- Se hace cumplir el tope de **mensajes/mes** y de **canales** (antes solo se
  mostraban).
- Precios: fundador $39 · Pro $12/mes · Kit de agencia $149 (packs por rubro,
  fuera del repo).

### Eliminado

- `cli/` (CLI legacy de Forja) y `.github/workflows/publish-cli.yml`.

## [1.26.0] — 2026-09-07

### Agregado

- Chat del panel: links clicables, previsualización de imágenes/audio entrantes
  (proxy autenticado para Telegram/WAHA), botones del bot visibles en el hilo.

## [1.25.0] — 2026-09-04

### Corregido

- Búsqueda de KB: `queryKb` pedía metadata que Vectorize no devuelve → el bot
  decía "no tengo esa información" con la KB llena.

### Agregado

- Canal **WAHA** (WhatsApp HTTP API self-hosted) por instalación.

## [1.20.0–1.24.0] — 2026-09-03

- **Registro de auditoría** del panel (`/admin/auditoria`): quién, cuándo, qué
  cambió, antes → después. Purga a 180 días.
- Canal **MercadoLibre** (preguntas + mensajería post-venta).
- Umbral de score de la KB configurable desde el panel.
- Periodo de gracia de 7 días para licencias mensuales vencidas.
- Niche packs por giro: `restaurante`, `inmobiliaria`, `clinica`, `barberia`.

## Antes de 1.20.0

Ver `PLAN.md` y `docs/BITACORA-*.md` para el detalle histórico (beta, sistema de
licencias v2 Ed25519, rediseño de identidad, Web Sync, playground "Probar el bot").
