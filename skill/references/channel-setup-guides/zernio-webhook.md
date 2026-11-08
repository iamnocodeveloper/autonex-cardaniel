# Zernio — conexión paso a paso (multicanal unificado)

> **¿Qué es Zernio?** Un proveedor unificado de mensajería: con **una sola cuenta**
> y **una api key** conectas varias redes a la vez — Instagram, Facebook/Messenger,
> X, Telegram, WhatsApp, Bluesky, Reddit, TikTok, LinkedIn, YouTube… Sin apps de
> Meta, sin App Review, sin pelear con tokens. (API pública: https://zernio.com)
>
> **¿Cómo se compara con ManyChat?** ManyChat conecta IG/Messenger/WhatsApp con un
> flow visual; Zernio conecta **más redes** con una api key y además permite
> **automatizar comentarios → DM privado** (nuestro adapter lo dispara por keyword).
>
> Este canal es **adicional**: no reemplaza los directos (Twilio/Meta/Telegram).

---

## Qué se necesita

| Secret / Var | Requerido | Descripción |
|---|---|---|
| `ZERNIO_API_KEY` | ✅ | Tu api key de Zernio (Bearer para enviar mensajes) |
| `ZERNIO_WEBHOOK_SECRET` | recomendado | Secreto con el que Zernio firma los webhooks (HMAC-SHA256); sin él, el webhook acepta todo |
| `ZERNIO_API_BASE_URL` | opcional | Override de la API (default `https://zernio.com/api`) |
| `ZERNIO_AUTO_DM_KEYWORD` | opcional | Palabra que dispara el **comentario → DM** (ej. `claude`, `info`, `precio`) |
| `ZERNIO_AUTO_DM_MESSAGE` | opcional | Mensaje del DM automático |
| `ZERNIO_AUTO_DM_BUTTON_LABEL` | opcional | Texto del botón (default "Abrir") |
| `ZERNIO_AUTO_DM_BUTTON_URL` | opcional | Link del botón (tu recurso, tu link de venta…) |

---

## Paso 1 — Crea tu cuenta y conecta redes

1. Entra a **zernio.com** y crea tu cuenta.
2. En el dashboard, **conecta tus cuentas** (Instagram, Messenger, X, etc.) con
   OAuth de un clic — sin developers ni verificaciones.
3. Copia tu **API key** (dashboard → API / Developers).

## Paso 2 — Guarda los secrets

```bash
npx wrangler secret put ZERNIO_API_KEY
npx wrangler secret put ZERNIO_WEBHOOK_SECRET
```

(En local: agrégala a `.dev.vars`.)

## Paso 3 — Configura el auto-DM por keyword (comentario → DM)

En `wrangler.toml` → `[vars]`.

**Modo simple (una sola keyword):**

```toml
ZERNIO_AUTO_DM_KEYWORD = "claude"
ZERNIO_AUTO_DM_MESSAGE = "¡Hola! 👋 Gracias por tu interés. Aquí tienes el recurso:"
ZERNIO_AUTO_DM_BUTTON_LABEL = "Abrir recurso"
ZERNIO_AUTO_DM_BUTTON_URL = "https://tusitio.com/recurso"
```

**Modo avanzado (VARIAS keywords, cada una con su mensaje + respuesta pública):**

```toml
ZERNIO_AUTO_DM_RULES = '[{"keywords":["precio","cuánto cuesta"],"message":"Te mando el catálogo 👇","buttonLabel":"Ver catálogo","buttonUrl":"https://tusitio.com/catalogo","replyToComment":"¡Gracias por preguntar! Te escribí por privado ✨"},{"keywords":["claude"],"message":"Aquí tienes el recurso"}]'
```

Cada regla hace dos cosas cuando el comentario trae alguna de sus keywords:
1. **DM privado** al autor (endpoint `private-reply`, IG/FB) con su `message` (+ botón opcional).
2. **Respuesta pública** al comentario si la regla tiene `replyToComment` (opcional).

> Si usas `ZERNIO_AUTO_DM_RULES`, el modo simple se ignora. Los eventos
> necesarios en el webhook son `comment.received` (comentarios) y
> `message.received` (los DMs que respondan después, que sí entran al agente).

> **Ejemplo real (tu caso):** alguien comenta *"precio"* en un post de Instagram →
> el bot responde en privado con tu catálogo + botón, Y responde en público
> *"¡Gracias por preguntar! Te escribí por privado ✨"*. Los DMs posteriores
> los contesta la IA con tu base de conocimiento.

## Paso 4 — Configura el webhook en Zernio

1. En Zernio → **Webhooks / Integrations**, crea un webhook con:
   - **URL:** `https://<tu-worker>.workers.dev/webhooks/zernio`
   - **Eventos:** `message.received`, **`message.sent`**, `comment.received`
     (reactions opcional)
   - **Secret:** el mismo `ZERNIO_WEBHOOK_SECRET` del Paso 2

   > **`message.sent` no es opcional.** Es el evento con el que Zernio entrega
   > TODO lo saliente: lo que el dueño escribe desde la app del celular y lo que
   > envían el bot y las automatizaciones. Sin él, el hilo del panel solo muestra
   > lo que entra. Si conectaste antes de que existiera, abre
   > **panel → Conexiones**: se agrega solo al endpoint ya registrado.
2. Guarda. Zernio empieza a mandar eventos.

## Paso 5 — Prueba

1. Mándale un DM a tu cuenta conectada (ej. Instagram) → el bot responde con IA.
2. Comenta la keyword (ej. "claude") en un post → recibes el DM automático con el
   botón.
3. Recarga el panel → **Conexiones**: Zernio debe estar en **verde**.

---

## Cómo funciona por dentro (para referencia)

- **DM entrante** (`message.received`): el adapter lo convierte en mensaje del
  agente (canal `zernio`, id = `accountId:conversationId`) y la IA responde vía
  `POST /v1/inbox/conversations/{conversationId}/messages`.
- **Comentario** (`comment.received`): si el texto trae `ZERNIO_AUTO_DM_KEYWORD`
  (case-insensitive), el adapter responde al autor vía `comment:{postId}` con el
  mensaje + botón. No entra al agente.
- **Firma**: HMAC-SHA256 del body crudo, header `X-Zernio-Signature` (legacy
  `X-Late-Signature`). Si `ZERNIO_WEBHOOK_SECRET` está configurado, las peticiones
  con firma inválida se rechazan (401).

## Troubleshooting

| Problema | Fix |
|---|---|
| `401 unauthorized` en el webhook | El `ZERNIO_WEBHOOK_SECRET` no coincide con el del webhook de Zernio; o falta el header de firma |
| Llegan DMs pero no responde | ¿`ZERNIO_API_KEY` guardado? `npx wrangler secrets list` |
| Comentarios no disparan DM | ¿`ZERNIO_AUTO_DM_KEYWORD` seteado en `wrangler.toml` y redesplegado? ¿El webhook de Zernio tiene el evento `comment.received` activo? |
| El bot no aparece en Conexiones | ¿`ZERNIO_API_KEY` presente? (así se detecta el canal en el panel) |
