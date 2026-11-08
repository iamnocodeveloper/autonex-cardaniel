import { Db } from "./client";
import { currentActor, recordAudit, redactValue } from "../audit/context";

// Canonical setting keys. Every value is stored as TEXT; the loader parses.
// Empty/absent => default (see settings-loader.ts).
export const SETTING_KEYS = {
  systemPromptOverride: "system_prompt_override",
  // Reglas del dueño que se SUMAN al prompt generado; NO lo reemplazan (eso es
  // system_prompt_override). Es el campo seguro para "siempre ofrece agendar
  // cita" sin perder el contexto del negocio, el playbook ni el KB.
  customInstructions: "custom_instructions",
  // Historial del prompt: JSON [{ at, system, instructions }] — últimas 10
  // versiones. Lo escribe el panel al guardar y permite "volver a esta".
  promptVersions: "prompt_versions",
  businessContext: "business_context",
  botName: "bot_name",
  tone: "tone",
  // Zona horaria del NEGOCIO — fuente única de verdad para el reloj del bot
  // (fecha/hora que ve el modelo), la agenda (Cal.com) y el guardia de "fecha en
  // el pasado". Antes salía de la var CALCOM_TIMEZONE con fallback hardcodeado,
  // así que un negocio de Florida podía estar pensando en hora de México.
  // Vacío = cae a CALCOM_TIMEZONE (legacy) y después al default.
  businessTimezone: "business_timezone", // IANA, ej. America/New_York
  // KB: score mínimo (0–1) para que un fragmento de searchKb cuente como match.
  // Default 0.45 (ver KB_MIN_SCORE_DEFAULT en src/kb/query.ts). Súbelo si el bot
  // cita cosas irrelevantes; bájalo si dice "no tengo info" con la KB llena.
  kbMinScore: "kb_min_score",
  bufferSeconds: "buffer_seconds",
  maxChunks: "max_chunks",
  interChunkDelayMs: "inter_chunk_delay_ms",
  escalationKeywords: "escalation_keywords",
  modelOverride: "model_override", // auto | haiku | sonnet
  botPaused: "bot_paused", // 0 | 1 — pausa global (todas las conversaciones)
  pausedChannels: "paused_channels", // JSON array: canales pausados (ej. ["telegram"])
  disabledTools: "disabled_tools", // comma-separated tool names turned off from the dashboard
  temperature: "temperature", // LLM sampling temperature 0-1; empty = provider default
  monthlyBudget: "monthly_budget", // USD cap for monthly AI spend; empty = no cap
  learnedLessons: "learned_lessons", // JSON array of rules distilled from owner takeovers
  twilioHandoffContentSid: "twilio_handoff_content_sid", // HSM del aviso de handoff (fallback del secret)
  autonomyLevel: "autonomy_level", // flywheel: manual (default) | copilot (auto-aplica lo seguro de noche)
  // BYO-LLM (dashboard "Modelo de IA"): the owner plugs their own provider,
  // API key and/or concrete model. Empty = the instance's env defaults.
  llmProvider: "llm_provider", // "" (auto) | anthropic | openai | minimax | aisa
  llmApiKey: "llm_api_key", // owner's API key; empty = use the env key
  llmModel: "llm_model", // concrete model id; empty = auto tiers (fast⇄smart)
  llmApiBaseUrl: "llm_api_base_url", // gateway URL (AIsa/OpenRouter); empty = env
  // Modelo de ANÁLISIS (scraping/inventario): configuración SEPARADA del chat.
  // Todo vacío = hereda la del chat (llm_*). Sirve para pagar un modelo caro y
  // bueno SOLO en el análisis (ej. Claude Opus) y uno barato en el chat
  // (ej. gpt-4o-mini), incluso contra una API distinta.
  analysisLlmProvider: "analysis_llm_provider", // "" (hereda) | anthropic | openai | xai | minimax | aisa
  analysisLlmApiKey: "analysis_llm_api_key", // API key propia; vacío = hereda la del chat
  analysisLlmModel: "analysis_llm_model", // modelo concreto; vacío = hereda
  analysisLlmApiBaseUrl: "analysis_llm_api_base_url", // gateway propio; vacío = hereda
  proLicense: "pro_license", // código KOONI-PRO-... pegado en el panel (quita límites)
  // Overlay del backend de licencias: JSON { plan, estado, limits, brand,
  // syncedAt }. Lo escribe `syncLicenseState` desde el super admin. Manda sobre
  // los límites por defecto y sobre BRAND_* de wrangler.toml.
  licenseOverlay: "license_overlay",
  // Botones y multimedia (Fase A): activable desde Configuración.
  menuButtons: "menu_buttons", // JSON: botones del menú que se envían al saludo
  resourceLibrary: "resource_library", // JSON: biblioteca de recursos (imagen/audio/botones)
  allowMultimedia: "allow_multimedia", // "0" | "1": permite que el bot envíe imagen/audio/botones
  // Zernio (multicanal): API key + webhook secret editables desde el panel.
  // Viven en settings para conectar el canal SIN `wrangler secret put` ni redeploy.
  zernioApiKey: "zernio_api_key",
  zernioWebhookSecret: "zernio_webhook_secret",
  // Telegram: token del bot editable desde el panel (mismo patrón que Zernio).
  telegramBotToken: "telegram_bot_token",
  // Avisos al dueño (handoff) por Telegram DM: chat_id del dueño editable desde
  // el panel (Conexiones → card Telegram). Fallback al secret OWNER_TELEGRAM_CHAT_ID.
  ownerTelegramChatId: "owner_telegram_chat_id",
  // ── MercadoLibre (preguntas + mensajería post-venta) ────────────────────
  // App OAuth propia del dueño (una por cuenta de vendedor). TODO el estado del
  // canal vive en settings para conectarlo sin `wrangler secret put` ni redeploy.
  mlClientId: "ml_client_id", // App ID de la app en developers.mercadolibre.com
  mlClientSecret: "ml_client_secret", // Secret Key de esa app
  mlSite: "ml_site", // país: MLA | MLM | MLB | MLC | MCO | MLU | MPE | ...
  mlAccessToken: "ml_access_token", // token de acceso (vigencia ~6h; se refresca solo)
  mlRefreshToken: "ml_refresh_token", // refresh token (rotativo, de un solo uso)
  mlUserId: "ml_user_id", // id del vendedor (viene del token)
  mlNickname: "ml_nickname", // nombre visible del vendedor (para el panel)
  mlTokenExpiresAt: "ml_token_expires_at", // epoch ms de expiración del access token
  mlOauthState: "ml_oauth_state", // anti-CSRF del flujo OAuth (efímero)
  // Reporte nocturno (Kooni+): resumen del día al dueño, configurable desde
  // /admin/config → "Reporte nocturno".
  nightlyReportEnabled: "nightly_report_enabled", // "0" | "1"
  nightlyReportChannel: "nightly_report_channel", // telegram | email | both
  // Módulos de pago desbloqueados por override del DUEÑO de la plataforma
  // (JSON array de ids; se setea directo en D1 — no aparece en el panel).
  moduleUnlocks: "module_unlocks",
  // Toggles del menú Extras (Kooni+): el dueño enciende/apaga cada función.
  featureBlindaje: "feature_blindaje_enabled", // "0" | "1"
  featureVigilante: "feature_vigilante_enabled", // "0" | "1"
  featureHandoff: "feature_handoff_enabled", // "0" | "1"
  featureCazador: "feature_cazador_enabled", // "0" | "1"
  featureOidoVista: "feature_oido_vista_enabled", // "0" | "1"
  featureVozMarca: "feature_voz_marca_enabled", // "0" | "1"
  featureMultiidioma: "feature_multiidioma_enabled", // "0" | "1"
  featureEncuestas: "feature_encuestas_enabled", // "0" | "1"
  featureReenganche: "feature_reenganche_enabled", // "0" | "1"
  featureResenas: "feature_resenas_enabled", // "0" | "1"
  featureCobros: "feature_cobros_enabled", // "0" | "1"
  featureGaleria: "feature_galeria_enabled", // "0" | "1"
  // Etiquetado inteligente de conversaciones (módulo etiquetas_ia).
  featureEtiquetas: "feature_etiquetas_enabled", // "0" | "1"
  // Cotizaciones en PDF (módulo cotizaciones).
  featureCotizaciones: "feature_cotizaciones_enabled", // "0" | "1"
  // Envío de archivos/documentos (PDF) en las respuestas (módulo archivos_salientes).
  featureArchivos: "feature_archivos_enabled", // "0" | "1"
  // Disparadores keyword→flujo multi-canal (módulo flujos).
  featureFlujos: "feature_flujos_enabled", // "0" | "1"
  // Plantilla HTML de la cotización (marcadores {{...}} + bloque {{#items}}).
  // Vacío = usa la plantilla por defecto embebida (src/quotes/template.ts).
  quoteTemplateHtml: "quote_template_html",
  // Defaults de cotización (JSON): currency, footer, validityDays, depositPct.
  quoteDefaults: "quote_defaults",
  // "0" | "1": si está en 1, el bot envía el PDF al cliente apenas crea el borrador.
  quoteAutoSend: "quote_auto_send",
  // Versión de la plantilla aplicada (para re-render/aviso al dueño).
  quoteTemplateVersion: "quote_template_version",
  // Etiqueta que se aplica AUTOMÁTICAMENTE cuando el bot captura un lead
  // (captureLead). Vacío = no etiqueta. Debe ser el id (slug) de una etiqueta.
  captureAutoLabel: "capture_auto_label",
  // ¿El bot se presenta como el DUEÑO mismo (primera persona) o como asistente?
  agentPersona: "agent_persona", // "" (asistente) | "dueño"
  // Config de funciones de Extras (enlaces que el bot inyecta al prompt).
  reviewLink: "review_link", // link de reseñas de Google (Pide reseñas)
  paymentLink: "payment_link", // link de pago seguro (Cobros por WhatsApp)
  // Recurso de la biblioteca (resource_library) que acompaña a los seguimientos:
  // el Cazador y el Reenganche pueden adjuntar una imagen/nota de voz/PDF.
  cazadorResource: "cazador_resource",
  reengancheResource: "reenganche_resource",
  // Seguimiento personalizado: modo manual (hasta 3 mensajes) en vez de IA.
  seguimientoCustom: "seguimiento_custom", // "1" = usar los mensajes de abajo
  seguimientoMessage1: "seguimiento_message_1",
  seguimientoMessage2: "seguimiento_message_2",
  seguimientoMessage3: "seguimiento_message_3",
  // Recurso de la Galería a adjuntar a CADA mensaje de seguimiento (1/2/3).
  seguimientoResource1: "seguimiento_resource_1",
  seguimientoResource2: "seguimiento_resource_2",
  seguimientoResource3: "seguimiento_resource_3",
  // Comentarios SIN automatización: si está en "1", el bot responde EN PÚBLICO
  // (nunca DM) los comentarios de primer nivel que no matchean ninguna regla,
  // con el texto de commentFallbackMessage. Default "" (apagado = no hace nada).
  commentFallbackEnabled: "comment_fallback_enabled", // "0" | "1"
  commentFallbackMessage: "comment_fallback_message", // texto de la respuesta pública
  // Comentarios que NO matchean ninguna regla, respondidos con IA (fallback
  // global): si está en "1", el bot genera la respuesta pública con el modelo
  // del dueño. Tiene prioridad sobre el texto fijo de commentFallbackMessage.
  commentAiFallbackEnabled: "comment_ai_fallback_enabled", // "0" | "1"
  commentAiFallbackPrompt: "comment_ai_fallback_prompt", // instrucción opcional para la IA
  // Follow gate: qué se le dice a quien tocó "Ya te sigo" pero la verificación
  // dice que todavía NO sigue. Vacío = texto por defecto del bot. Se le agrega
  // automáticamente la instrucción de tocar el botón otra vez.
  followGateNotFollowingMessage: "follow_gate_not_following_message",
  // Respuesta pública por defecto para reglas `comment_dm_public` que no tienen
  // texto público configurado. Vacío = texto genérico del bot.
  commentDefaultPublicReply: "comment_default_public_reply",
  // Cuántos autos muestra el bot por consulta de inventario (clamp 1..50).
  inventoryPageSize: "inventory_page_size", // default 25
  // Idioma del PANEL (interfaz del dueño): "es" | "en". No afecta el idioma con
  // el que el bot le habla a los clientes (eso es BOT_LANGUAGE / multi-idioma).
  panelLanguage: "panel_language", // default "es"
  // Web Sync (módulo web_sync): páginas que se scrapean a la KB del bot.
  webSyncEnabled: "feature_web_sync_enabled", // "0" | "1" — apagado ⇒ no corre (cron, API ni panel)
  // Análisis IA del inventario scrapeado: normaliza/valida los autos con el
  // modelo de análisis (analysis_llm_*). Apagado ⇒ el parseo determinista manda
  // y el pipeline queda byte a byte como antes.
  webSyncAnalysisEnabled: "feature_web_sync_analysis_enabled", // "0" | "1"
  webSyncUrls: "web_sync_urls", // URLs (una por línea o coma)
  webSyncState: "web_sync_state", // JSON { [url]: { hash, at, chars } } — anti re-embebido
  webSyncLastRun: "web_sync_last_run", // epoch ms de la última corrida
  // Inventario estructurado (modo inventario de Web Sync): JSON con los autos
  // parseados (VIN, precio, ficha URL, foto) para las tools inventarioQuery y
  // fichaAuto. Sin esto, el bot contestaría solo con el blob de texto de la KB.
  webSyncVehicles: "web_sync_vehicles", // JSON { updatedAt, vehicles: { [key]: VehicleStored } }
  // Inventario de PROPIEDADES (giro inmobiliaria): mismo patrón que los autos —
  // JSON en settings, sin tabla nueva. Lo llenan el importador CSV del panel y la
  // lectura del sitio (`runPropertiesSync`); lo leen las tools buscarPropiedad /
  // fichaPropiedad.
  webSyncProperties: "web_sync_properties", // JSON { updatedAt, props: { [key]: PropiedadStored } }
  propertiesPageSize: "properties_page_size", // default 12
  // API key de Decodo (scraping para Web Sync / inventario). Editable desde el
  // panel (Configuración → Scraping); si está vacía, cae al secret DECODO_AUTH.
  decodoAuth: "decodo_auth",
  // Proveedor de scraping del inventario (feed + fichas):
  //   "auto"   → directo (barato) → AIsa → Decodo
  //   "aisa"   → Firecrawl vía el gateway de AIsa (misma key del LLM si existe)
  //   "decodo" → Scraper API de Decodo
  scrapeProvider: "scrape_provider", // "auto" | "aisa" | "decodo"
  // API key de AIsa (gateway api.aisa.one). Vacía = hereda la del LLM
  // (`llm_api_key`), que en muchas instalaciones ES la key de AIsa.
  aisaApiKey: "aisa_api_key",
  // WAHA (WhatsApp self-hosted, Docker): datos editables desde el panel
  // (Conexiones → WAHA), mismo patrón que Telegram/Zernio — sin
  // `wrangler secret put` ni redeploy. Fallback a las vars/secrets de env.
  wahaApiUrl: "waha_api_url", // http://<host>:3000 del servidor WAHA
  wahaSession: "waha_session", // nombre de sesión (default "default")
  wahaApiKey: "waha_api_key", // X-Api-Key de WAHA
  wahaWebhookToken: "waha_webhook_token", // ?token=... del webhook entrante (autogenerado)
  // ── Cobros por voz (Vapi / Retell) ──────────────────────────────────────
  // Proveedores de llamadas con IA para la cartera de cobros. TODO editable
  // desde el panel (Conexiones → Cobros por voz) sin `wrangler secret put`.
  voiceProvider: "voice_provider", // "" (ninguno) | "vapi" | "retell" — el activo
  // Vapi (dashboard.vapi.ai)
  vapiApiKey: "vapi_api_key", // Private API key (sk_live_…)
  vapiAssistantId: "vapi_assistant_id", // id del Assistant que contesta
  vapiPhoneNumberId: "vapi_phone_number_id", // id del número saliente (Phone Numbers)
  vapiWebhookSecret: "vapi_webhook_secret", // secret del Server URL (header X-Vapi-Secret)
  vapiApiBaseUrl: "vapi_api_base_url", // default https://api.vapi.ai
  // Retell (dashboard.retellai.com)
  retellApiKey: "retell_api_key", // API key (key_…)
  retellAgentId: "retell_agent_id", // agent_id que contesta
  retellPhoneNumber: "retell_phone_number", // número comprado desde el que se llama (E.164)
  retellWebhookSecret: "retell_webhook_secret", // secreto de verificación del webhook
  retellApiBaseUrl: "retell_api_base_url", // default https://api.retellai.com
  // Común a la cartera de cobros por voz
  cobrosVoiceObjective: "cobros_voice_objective", // objetivo/tono del guion de cobranza
  cobrosVoiceMaxAttempts: "cobros_voice_max_attempts", // intentos por deudor (default 3)
  // Ventana horaria del motor de cobranza (nicho cartera). Horas locales del
  // negocio (0-23) + offset en minutos respecto de UTC (ej. -360 = UTC-6).
  collectionSendFromHour: "collection_send_from_hour", // default 8
  collectionSendToHour: "collection_send_to_hour", // default 19
  collectionTzOffsetMinutes: "collection_tz_offset_minutes", // default -360
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/**
 * Etiqueta legible por clave de `settings` — para el registro de auditoría
 * (§ U). Las claves sin entrada aquí se muestran con su nombre técnico.
 */
export const SETTING_LABELS: Record<string, string> = {
  [SETTING_KEYS.systemPromptOverride]: "Prompt del sistema (reemplazo total)",
  [SETTING_KEYS.customInstructions]: "Instrucciones extra del dueño",
  [SETTING_KEYS.promptVersions]: "Historial del prompt",
  [SETTING_KEYS.businessContext]: "Contexto del negocio",
  [SETTING_KEYS.botName]: "Nombre del bot",
  [SETTING_KEYS.businessTimezone]: "Zona horaria del negocio",
  [SETTING_KEYS.tone]: "Tono del bot",
  [SETTING_KEYS.kbMinScore]: "Umbral de score de la KB",
  [SETTING_KEYS.bufferSeconds]: "Segundos de buffer",
  [SETTING_KEYS.maxChunks]: "Máximo de mensajes por respuesta",
  [SETTING_KEYS.interChunkDelayMs]: "Pausa entre mensajes (ms)",
  [SETTING_KEYS.escalationKeywords]: "Palabras de escalamiento",
  [SETTING_KEYS.modelOverride]: "Modelo de IA (override)",
  [SETTING_KEYS.botPaused]: "Bot en pausa (global)",
  [SETTING_KEYS.pausedChannels]: "Canales pausados",
  [SETTING_KEYS.disabledTools]: "Herramientas desactivadas",
  [SETTING_KEYS.temperature]: "Temperatura del modelo",
  [SETTING_KEYS.monthlyBudget]: "Presupuesto mensual de IA (USD)",
  [SETTING_KEYS.learnedLessons]: "Lecciones aprendidas",
  [SETTING_KEYS.twilioHandoffContentSid]: "Plantilla HSM de handoff (Twilio)",
  [SETTING_KEYS.autonomyLevel]: "Nivel de autonomía (flywheel)",
  [SETTING_KEYS.llmProvider]: "Proveedor de IA",
  [SETTING_KEYS.llmApiKey]: "API key del proveedor de IA",
  [SETTING_KEYS.llmModel]: "Modelo de IA",
  [SETTING_KEYS.llmApiBaseUrl]: "URL base del proveedor de IA",
  [SETTING_KEYS.analysisLlmProvider]: "Proveedor del modelo de análisis",
  [SETTING_KEYS.analysisLlmApiKey]: "API key del modelo de análisis",
  [SETTING_KEYS.analysisLlmModel]: "Modelo de análisis",
  [SETTING_KEYS.analysisLlmApiBaseUrl]: "URL base del modelo de análisis",
  [SETTING_KEYS.proLicense]: "Código de licencia Pro",
  [SETTING_KEYS.licenseOverlay]: "Estado de licencia (sincronizado)",
  [SETTING_KEYS.menuButtons]: "Botones del menú",
  [SETTING_KEYS.resourceLibrary]: "Biblioteca de recursos",
  [SETTING_KEYS.allowMultimedia]: "Permitir multimedia en respuestas",
  [SETTING_KEYS.zernioApiKey]: "API key de Zernio",
  [SETTING_KEYS.zernioWebhookSecret]: "Webhook secret de Zernio",
  [SETTING_KEYS.telegramBotToken]: "Token del bot de Telegram",
  [SETTING_KEYS.ownerTelegramChatId]: "Chat id del dueño (Telegram)",
  [SETTING_KEYS.mlClientId]: "App ID de MercadoLibre",
  [SETTING_KEYS.mlClientSecret]: "Secret Key de MercadoLibre",
  [SETTING_KEYS.mlSite]: "País de MercadoLibre",
  [SETTING_KEYS.mlAccessToken]: "Token de acceso de MercadoLibre",
  [SETTING_KEYS.mlRefreshToken]: "Refresh token de MercadoLibre",
  [SETTING_KEYS.mlUserId]: "Vendedor de MercadoLibre",
  [SETTING_KEYS.mlNickname]: "Nombre del vendedor (MercadoLibre)",
  [SETTING_KEYS.nightlyReportEnabled]: "Reporte nocturno activado",
  [SETTING_KEYS.nightlyReportChannel]: "Canal del reporte nocturno",
  [SETTING_KEYS.moduleUnlocks]: "Módulos de pago desbloqueados",
  [SETTING_KEYS.agentPersona]: "Persona del bot",
  [SETTING_KEYS.reviewLink]: "Link de reseñas",
  [SETTING_KEYS.paymentLink]: "Link de pago",
  [SETTING_KEYS.cazadorResource]: "Recurso del Cazador",
  [SETTING_KEYS.reengancheResource]: "Recurso del Reenganche",
  [SETTING_KEYS.seguimientoCustom]: "Personalizar mensajes de seguimiento",
  [SETTING_KEYS.seguimientoMessage1]: "Mensaje de seguimiento 1",
  [SETTING_KEYS.seguimientoMessage2]: "Mensaje de seguimiento 2",
  [SETTING_KEYS.seguimientoMessage3]: "Mensaje de seguimiento 3",
  [SETTING_KEYS.seguimientoResource1]: "Recurso del mensaje 1",
  [SETTING_KEYS.seguimientoResource2]: "Recurso del mensaje 2",
  [SETTING_KEYS.seguimientoResource3]: "Recurso del mensaje 3",
  [SETTING_KEYS.quoteTemplateHtml]: "Plantilla HTML de la cotización",
  [SETTING_KEYS.quoteDefaults]: "Defaults de cotización",
  [SETTING_KEYS.quoteAutoSend]: "Enviar la cotización automáticamente",
  [SETTING_KEYS.quoteTemplateVersion]: "Versión de la plantilla de cotización",
  [SETTING_KEYS.captureAutoLabel]: "Etiqueta automática al capturar lead",
  [SETTING_KEYS.commentFallbackEnabled]: "Respuesta pública a comentarios sin regla",
  [SETTING_KEYS.commentFallbackMessage]: "Texto de la respuesta pública a comentarios",
  [SETTING_KEYS.commentAiFallbackEnabled]: "Respuesta con IA a comentarios sin regla",
  [SETTING_KEYS.commentAiFallbackPrompt]: "Instrucciones para la respuesta con IA a comentarios",
  [SETTING_KEYS.followGateNotFollowingMessage]: "Follow gate: mensaje si aún no sigue",
  [SETTING_KEYS.commentDefaultPublicReply]: "Respuesta pública por defecto (reglas sin texto público)",
  [SETTING_KEYS.inventoryPageSize]: "Autos por consulta de inventario (bot)",
  [SETTING_KEYS.panelLanguage]: "Idioma del panel del bot (es | en)",
  [SETTING_KEYS.webSyncEnabled]: "Web Sync activado",
  [SETTING_KEYS.webSyncAnalysisEnabled]: "Análisis IA del inventario (scraping)",
  [SETTING_KEYS.webSyncUrls]: "URLs de Web Sync",
  [SETTING_KEYS.webSyncVehicles]: "Inventario Web Sync (autos parseados)",
  [SETTING_KEYS.webSyncProperties]: "Inventario de propiedades (giro inmobiliaria)",
  [SETTING_KEYS.propertiesPageSize]: "Propiedades por consulta del bot",
  [SETTING_KEYS.decodoAuth]: "Decodo — API key (scraping)",
  [SETTING_KEYS.scrapeProvider]: "Proveedor de scraping (auto | aisa | decodo)",
  [SETTING_KEYS.aisaApiKey]: "AIsa — API key (scraping)",
  [SETTING_KEYS.wahaApiUrl]: "URL del servidor WAHA",
  [SETTING_KEYS.wahaSession]: "Sesión de WAHA",
  [SETTING_KEYS.wahaApiKey]: "API key de WAHA",
  [SETTING_KEYS.wahaWebhookToken]: "Webhook token de WAHA",
  [SETTING_KEYS.voiceProvider]: "Proveedor de voz (cobros)",
  [SETTING_KEYS.vapiApiKey]: "Vapi — API key",
  [SETTING_KEYS.vapiAssistantId]: "Vapi — Assistant ID",
  [SETTING_KEYS.vapiPhoneNumberId]: "Vapi — Phone Number ID",
  [SETTING_KEYS.vapiWebhookSecret]: "Vapi — Webhook secret",
  [SETTING_KEYS.vapiApiBaseUrl]: "Vapi — API base URL",
  [SETTING_KEYS.retellApiKey]: "Retell — API key",
  [SETTING_KEYS.retellAgentId]: "Retell — Agent ID",
  [SETTING_KEYS.retellPhoneNumber]: "Retell — número saliente",
  [SETTING_KEYS.retellWebhookSecret]: "Retell — Webhook secret",
  [SETTING_KEYS.retellApiBaseUrl]: "Retell — API base URL",
  [SETTING_KEYS.cobrosVoiceObjective]: "Cobros por voz — objetivo/tono",
  [SETTING_KEYS.cobrosVoiceMaxAttempts]: "Cobros por voz — intentos por deudor",
  [SETTING_KEYS.collectionSendFromHour]: "Cobranza — hora local desde",
  [SETTING_KEYS.collectionSendToHour]: "Cobranza — hora local hasta",
  [SETTING_KEYS.collectionTzOffsetMinutes]: "Cobranza — offset UTC (min)",
};

/** Toggles del menú Extras (Kooni+) — etiquetas para el registro de auditoría. */
for (const [k, label] of [
  [SETTING_KEYS.featureBlindaje, "Extra: Blindaje"],
  [SETTING_KEYS.featureVigilante, "Extra: Vigilante"],
  [SETTING_KEYS.featureHandoff, "Extra: Handoff"],
  [SETTING_KEYS.featureCazador, "Extra: Cazador de ventas"],
  [SETTING_KEYS.featureOidoVista, "Extra: Oído y vista"],
  [SETTING_KEYS.featureVozMarca, "Extra: Voz de marca"],
  [SETTING_KEYS.featureMultiidioma, "Extra: Multiidioma"],
  [SETTING_KEYS.featureEncuestas, "Extra: Encuestas"],
  [SETTING_KEYS.featureReenganche, "Extra: Reenganche"],
  [SETTING_KEYS.featureResenas, "Extra: Pide reseñas"],
  [SETTING_KEYS.featureCobros, "Extra: Cobros"],
  [SETTING_KEYS.featureGaleria, "Extra: Galería"],
  [SETTING_KEYS.featureEtiquetas, "Extra: Etiquetado inteligente"],
  [SETTING_KEYS.featureCotizaciones, "Extra: Cotizaciones en PDF"],
  [SETTING_KEYS.featureArchivos, "Extra: Enviar archivos"],
  [SETTING_KEYS.featureFlujos, "Extra: Disparadores por palabra clave"],
] as const) {
  SETTING_LABELS[k] = label;
}

export function settingLabel(key: string): string {
  return SETTING_LABELS[key] ?? key;
}

interface SettingRow {
  key: string;
  value: string;
}

export class SettingsRepo {
  constructor(private readonly db: Db) {}

  async get(key: string): Promise<string | null> {
    const row = await this.db.first<SettingRow>(
      "SELECT value FROM settings WHERE key = ?",
      [key],
    );
    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    // Registro de auditoría (§ U): si hay un operador del panel en contexto,
    // capturamos el valor anterior para el "antes → después". Fuera del panel
    // (bot / cron) no hay actor y esto no cuesta nada.
    const actor = currentActor();
    const before = actor ? await this.get(key) : null;

    await this.db.run(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, Date.now()],
    );

    if (actor && before !== value) {
      await recordAudit(this.db, {
        action: "settings.update",
        target: key,
        targetLabel: settingLabel(key),
        beforeVal: redactValue(key, before),
        afterVal: redactValue(key, value),
      });
    }
  }

  async all(): Promise<Record<string, string>> {
    const rows = await this.db.all<SettingRow>(
      "SELECT key, value FROM settings",
    );
    const out: Record<string, string> = {};
    for (const row of rows) {
      out[row.key] = row.value;
    }
    return out;
  }
}
