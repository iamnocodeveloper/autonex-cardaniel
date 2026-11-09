import type { D1Database, DurableObjectNamespace, R2Bucket, VectorizeIndex, Ai, Fetcher } from "@cloudflare/workers-types";
import type { SupportAgent } from "./agent";

export interface Env {
  // Bindings
  // Typed namespace so we can call the agent's methods via RPC (stub.ingest()).
  AGENT: DurableObjectNamespace<SupportAgent>;
  DB: D1Database;
  KB: VectorizeIndex;
  AI: Ai;
  // Browser Rendering (Cloudflare) — render HTML→PDF de las cotizaciones
  // (src/quotes/pdf.ts). Opcional: sin este binding, la cotización se envía
  // como texto + enlace (degradación limpia). Requiere habilitar Browser
  // Rendering en la cuenta y `[browser] binding = "BROWSER"` en wrangler.toml.
  BROWSER?: Fetcher;
  // R2 con los recursos multimedia subidos desde el panel (biblioteca de
  // recursos). Opcional: sin este binding, los archivos se guardan en D1
  // (`media_assets`) y se sirven por enlace firmado. Ver src/media/store.ts.
  MEDIA?: R2Bucket;

  // Vars (member-set)
  BOT_NAME: string;
  PEER_BOTS?: string; // JSON [{name,url}] — otras instancias para el selector de proyectos
  WA_DAILY_TEMPLATE_CAP?: string; // tope diario de plantillas HSM (default 250 — tier 1 de Meta)
  BUSINESS_NAME: string;
  BOT_LANGUAGE: string;
  BOT_TIER: "free" | "pro";
  // "1" = instalación FUERA del esquema de licencias: todos los módulos
  // desbloqueados y sin límites de uso (contactos, mensajes, canales, reglas…),
  // sin importar el código Pro ni el estado que sincronice el backend. Solo se
  // pone en instalaciones propias; ver isInstallUnlimited() en config.ts.
  INSTALL_UNLIMITED?: string;
  // Nicho del bot (restaurante, inmobiliaria…). Selecciona el "niche pack" que
  // re-etiqueta el dashboard, aporta el playbook del giro y sus columnas.
  // Ausente/desconocido → pack genérico (comportamiento actual). Ver src/niches/.
  BOT_NICHE?: string;
  // LLM provider for the chat brain: "anthropic" (default) | "openai".
  // If unset and only OPENAI_API_KEY is present, auto-selects "openai".
  // (Voice transcription + embeddings always run on Cloudflare Workers AI.)
  LLM_PROVIDER?: "anthropic" | "openai";
  // Override de la URL base del proveedor OpenAI (proxies / gateways tipo
  // OpenRouter, AIsa…). Sin esto, usa https://api.openai.com/v1.
  OPENAI_API_BASE_URL?: string;
  // Optional per-tier model id overrides (fast = cheap default, smart = upgrade).
  ANTHROPIC_MODEL_FAST?: string;
  ANTHROPIC_MODEL_SMART?: string;
  OPENAI_MODEL_FAST?: string;
  OPENAI_MODEL_SMART?: string;
  BUFFER_SECONDS: string;
  DASHBOARD_BASE_URL: string;
  // uid de 6 chars de esta instalación (estampado por el CLI en wrangler.toml).
  // Sirve para ligar las licencias Pro a UNA instalación concreta.
  BOT_INSTANCE_ID?: string;
  // URL de la función `registrar-uso` del panel de licencias del dueño. Si está
  // definida, el cron nocturno envía métricas agregadas + costos de IA (usage.ts).
  USAGE_PUSH_URL?: string;
  // Token compartido de registro/uso (X-Kooni-Token) — estampado por el CLI.
  // Legacy: las instalaciones nuevas usan KOONI_INSTALL_TOKEN (por instalación).
  KOONI_REGISTER_TOKEN?: string;
  // Base de las edge functions del backend de licencias (InsForge). El CLI la
  // estampa en wrangler.toml. Sin ella, el sync de licencia queda apagado.
  KOONI_API_URL?: string;
  // Token POR INSTALACIÓN (secret) con el que este bot se identifica ante el
  // backend (registrar-uso / estado-licencia). Reemplaza al token compartido.
  KOONI_INSTALL_TOKEN?: string;
  // Marca blanca del panel /admin (para revendedores): colores, nombre y logo.
  BRAND_NAME?: string;
  BRAND_LOGO_URL?: string;
  BRAND_PRIMARY?: string;
  BRAND_PRIMARY_SOFT?: string;
  BRAND_ACCENT2?: string;
  BRAND_BG?: string;
  BRAND_PANEL?: string;
  // Texto de marca. Se aplica en ambos temas: si el cliente define su propio
  // fondo, debe controlar también el color del texto.
  BRAND_TEXT?: string;
  BRAND_MUTED?: string;
  // Neutrales completos para una marca con su propio esquema (evita que
  // queden los grises violetas de Kooni).
  BRAND_DIM?: string;
  BRAND_PANEL2?: string;
  BRAND_RAISE?: string;
  BRAND_LINE?: string;
  BRAND_LINELIT?: string;
  // Texto sobre el acento (para acentos claros, tinta oscura).
  BRAND_ON_ACCENT?: string;
  // "dark" | "light": esquema único de la marca; oculta el toggle de tema.
  BRAND_THEME?: "dark" | "light";
  // Acento violeta del canvas de flujo (para marcas sin morado).
  BRAND_VIOLET?: string;

  // Secrets (member-set via wrangler secret put)
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY?: string;  // alternative LLM provider (see LLM_PROVIDER)
  RESEND_API_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  MANYCHAT_API_KEY?: string;
  MANYCHAT_WEBHOOK_SECRET?: string;  // shared secret expected in the X-Api-Key header on /webhooks/manychat; unset = guard off
  MANYCHAT_CONTENT_TYPE?: "instagram" | "whatsapp" | "telegram" | "messenger"; // ManyChat channel for sendContent; defaults to "instagram"
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_WA_FROM?: string;
  TWILIO_HANDOFF_CONTENT_SID?: string;  // approved WhatsApp template for owner handoff DM
  // Meta oficial (Facebook Messenger + Instagram DMs, sin ManyChat).
  META_PAGE_ACCESS_TOKEN?: string;  // Messenger / IG ligado a Página (graph.facebook.com)
  INSTAGRAM_ACCESS_TOKEN?: string;  // Instagram API con Instagram Login, token IGAA… (graph.instagram.com)
  META_VERIFY_TOKEN?: string;       // string que tú eliges; valida el handshake GET del webhook
  META_APP_SECRET?: string;
  // "manychat" = los DMs de Instagram entran SOLO por ManyChat (el webhook
  // oficial de Meta los ignora para no procesarlos doble).
  IG_DM_SOURCE?: string;
  // "off" = canal oficial de IG apagado por completo (DMs). El bot de IG vive
  // solo en ManyChat.
  IG_OFFICIAL?: string;         // App Secret de Facebook; firma los webhooks de Messenger
  INSTAGRAM_APP_SECRET?: string;    // App Secret del producto Instagram (IG Login); firma los webhooks de IG
  // WhatsApp OFICIAL (Cloud API de Meta, sin BSP/Twilio). Mismo ecosistema Graph
  // que Meta; el número corre en la cuenta del miembro con SU token. El envío es
  // a graph.facebook.com/<phone_number_id>/messages; el media entrante se sirve
  // por el proxy firmado /webhooks/whatsapp/media/:id (Cloud API exige el token
  // para descargarlo, así queda del lado del server).
  WHATSAPP_PHONE_NUMBER_ID?: string;  // el Phone Number ID del número (no el número)
  WHATSAPP_ACCESS_TOKEN?: string;     // token del system user / WABA (Bearer)
  WHATSAPP_VERIFY_TOKEN?: string;     // handshake GET del webhook (si falta, usa META_VERIFY_TOKEN)
  WHATSAPP_APP_SECRET?: string;       // firma X-Hub-Signature-256 (si falta, usa META_APP_SECRET)
  XAI_API_KEY?: string;             // xAI (Grok) — proveedor LLM alterno (ver src/llm/provider.ts)
  MINIMAX_API_KEY?: string;         // MiniMax — proveedor LLM (API compatible con OpenAI)
  MINIMAX_API_BASE_URL?: string;    // override de https://api.minimaxi.com/v1
  GEMINI_API_KEY?: string;          // Google Gemini — proveedor LLM (Google AI Studio)

  // ── Zernio (proveedor unificado multicanal — IG/FB/X/TG/WhatsApp/…) ──────
  // Una sola api key para muchas redes (tipo ManyChat pero unificado).
  // API: https://zernio.com/api — webhook firmado HMAC-SHA256.
  ZERNIO_API_KEY?: string;               // secret: Bearer para enviar mensajes
  ZERNIO_WEBHOOK_SECRET?: string;        // secret: valida la firma X-Zernio-Signature (recomendado)
  ZERNIO_API_BASE_URL?: string;          // var: override de https://zernio.com/api
  // Auto-DM por keyword en comentarios de posts (comentario → DM privado):
  ZERNIO_AUTO_DM_KEYWORD?: string;       // var: palabra que dispara (ej. "claude", "info") — modo simple
  ZERNIO_AUTO_DM_MESSAGE?: string;       // var: mensaje del DM
  ZERNIO_AUTO_DM_BUTTON_LABEL?: string;  // var: texto del botón (default "Abrir")
  ZERNIO_AUTO_DM_BUTTON_URL?: string;    // var: link del botón con tu recurso
  // Modo avanzado: JSON con VARIAS reglas keyword → mensaje (+ botón + respuesta
  // pública opcional). Ejemplo:
  //   [{"keywords":["precio","cuánto cuesta"],"message":"Te mando el catálogo 👇",
  //     "buttonLabel":"Ver catálogo","buttonUrl":"https://...",
  //     "replyToComment":"¡Gracias por preguntar! Te escribí por privado ✨"},
  //    {"keywords":["claude"],"message":"Aquí tienes el recurso"}]
  ZERNIO_AUTO_DM_RULES?: string;         // var: JSON array de reglas (tiene prioridad sobre el modo simple)

  // ── WAHA (WhatsApp HTTP API — self-hosted, Docker) ─────────────────────
  // Canal WhatsApp por instalación: SOLO se activa si esta instalación tiene
  // WAHA_API_URL (un servidor WAHA corriendo en un VPS/Docker). Sin él, el
  // webhook /webhooks/waha devuelve 401 y el canal está inactivo.
  WAHA_API_URL?: string;       // var: http://<host>:3000 del servidor WAHA
  WAHA_API_KEY?: string;       // secret: X-Api-Key de WAHA (si la configuraste)
  WAHA_SESSION?: string;       // var: nombre de sesión (default "default")
  WAHA_WEBHOOK_TOKEN?: string; // secret: ?token=... para validar el webhook entrante

  // ── Cobros por voz (Vapi / Retell) ─────────────────────────────────────
  // Proveedores de llamadas con IA. Igual que WAHA/Zernio: lo normal es
  // configurarlos desde el panel (Conexiones → Cobros por voz), que guarda en
  // settings de D1; estas vars son el fallback para bots viejos/CI.
  VAPI_API_KEY?: string;            // secret: Private API key de Vapi
  VAPI_ASSISTANT_ID?: string;       // var: id del Assistant
  VAPI_PHONE_NUMBER_ID?: string;    // var: id del número saliente
  VAPI_WEBHOOK_SECRET?: string;     // secret: valida el header X-Vapi-Secret
  VAPI_API_BASE_URL?: string;       // var: default https://api.vapi.ai
  RETELL_API_KEY?: string;          // secret: API key de Retell
  RETELL_AGENT_ID?: string;         // var: agent_id
  RETELL_PHONE_NUMBER?: string;     // var: número saliente (E.164)
  RETELL_WEBHOOK_SECRET?: string;   // secret: verificación del webhook
  RETELL_API_BASE_URL?: string;     // var: default https://api.retellai.com

  // ── Cal.com (agenda real para scheduleAppointment) ───────────────────────
  // Con estas vars, el bot consulta disponibilidad real y reserva en Cal.com.
  // Sin ellas, scheduleAppointment solo registra la cita para que el dueño la confirme.
  CALCOM_API_KEY?: string;                 // secret: API key de Cal.com (cal_...)
  CALCOM_EVENT_TYPE_ID?: string;           // event type por defecto (numérico, como string)
  CALCOM_EVENT_TYPES?: string;             // opcional: JSON {"corte":123,"barba":456} servicio→eventTypeId
  CALCOM_TIMEZONE?: string;                // zona horaria (default America/Mexico_City)

  // ── Web Sync (módulo web_sync — SOLO en la instalación que lo pidió) ──────
  // Credencial de Decodo Scraper API: "user:pass" o el base64 ya hecho. Ausente
  // = el módulo no scrapea nada (segundo candado, además de module_unlocks).
  DECODO_AUTH?: string;                    // secret
  // API key de AIsa (gateway api.aisa.one): habilita el scraping vía Firecrawl
  // para sitios que bloquean al Worker. Opcional: si está la del LLM y ES de
  // AIsa, se hereda (`resolveAisaKey`). Se puede setear también desde el panel.
  AISA_API_KEY?: string;                   // secret (opcional)

  // ── Web Push (avisos al celular del dueño con el panel instalado como PWA) ─
  // Sin las tres, no se manda ningún push (pushConfigured() = false).
  VAPID_PUBLIC_KEY?: string;               // var (base64url) — también va al cliente
  VAPID_PRIVATE_KEY?: string;              // secret (base64url, 32 bytes)
  VAPID_SUBJECT?: string;                  // var ("mailto:tu@correo")
  OWNER_EMAIL: string;  // for handoff notifications (email)
  OWNER_TELEGRAM_CHAT_ID?: string;  // for handoff notifications (default channel)
  OWNER_WA_NUMBER?: string;  // for Pro handoff WhatsApp DM (requires template)

  // HTTP Basic Auth password for the admin dashboard (secret).
  // Username is always "admin". Set via `wrangler secret put DASHBOARD_PASSWORD`.
  DASHBOARD_PASSWORD: string;

  // ── Licencias Pro (firma asimétrica Ed25519 v2, sin servidor) ────────────
  // Clave PÚBLICA con la que el worker verifica códigos KOONI-PRO-V2-...
  // (ver scripts/gen-license.ts y src/license.ts). Opcional: sin esta var, se
  // usa la pública embebida por defecto en src/license.ts. La PRIVADA nunca
  // vive aquí — solo en InsForge (secret LICENSE_PRIVATE_KEY del panel).
  LICENSE_PUBLIC_KEY?: string;

  // "1" = panel admin PÚBLICO (sin Basic Auth). Solo cuando el dueño lo decide
  // explícitamente (var en wrangler.toml); sin la var, el guard queda activo.
  DASHBOARD_PUBLIC?: string;

  // Token guarding POST /kb/reindex (header: X-Reindex-Token). Secret.
  // Set via `wrangler secret put KB_REINDEX_TOKEN`.
  KB_REINDEX_TOKEN: string;

  // Secret con el que se firman los enlaces públicos de cotización
  // (GET /q/:token → PDF). Sin él, cae a DASHBOARD_PASSWORD. Ver src/quotes/link.ts.
  QUOTE_URL_SECRET?: string;

  // Control plane (hosted): glue para que un plano de control externo lea este
  // bot self-hosted vía los endpoints /api/*. Ambos opcionales; sin el token,
  // /api/* queda cerrado (fail-closed).
  CONTROL_PLANE_TOKEN?: string;  // secret; Bearer que el control plane presenta para llamar /api/*
}
