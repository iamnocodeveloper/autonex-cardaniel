// Área: Configuración e integraciones.
// Claves `cfg.*`, `cx.*`, `extras.*`, `lic.*`, `eq.*`, `cmd.*`, `auto.*`.
// El ESPAÑOL es la fuente de verdad y el default: cada valor es el TEXTO
// ORIGINAL de la vista, verbatim (los tests que esperan textos en español
// siguen pasando). El inglés debe cubrir TODAS las claves.
export const configEs = {
  // ── Configuración (config.ts) ──────────────────────────────────────────────
  "cfg.title": "Config",
  "cfg.saved": "Guardado ✓",
  "cfg.history.title": "Historial del prompt",
  "cfg.history.help": 'Últimas {n} versiones. "Volver" restaura esa versión.',
  "cfg.history.restore": "Volver a esta",
  "cfg.heading": "Panel de control de {name}",
  "cfg.subtitle":
    "Ajuste cómo se comporta su bot. Los cambios se guardan al presionar el botón de abajo.",
  "cfg.botName.label": "Nombre del bot",
  "cfg.botName.help": "Cómo se presenta su asistente con los clientes.",
  "cfg.botName.ph": "Mi asistente",
  "cfg.persona.label": "¿Quién responde los chats?",
  "cfg.persona.help":
    "Por defecto el bot se presenta como asistente del negocio. Si eliges “Tú mismo”, el bot habla en primera persona como el dueño (no dice “soy el asistente”).",
  "cfg.persona.business": "Asistente del negocio",
  "cfg.persona.you": "Tú mismo (primera persona)",
  "cfg.business.label": "Información del negocio",
  "cfg.business.help":
    "Horarios, servicios, precios, ubicación. El bot responde con esto. Editable en vivo — se aplica al guardar, sin re-desplegar.",
  "cfg.business.ph":
    "Ej. Abrimos lunes a sábado de 9 a 7. Corte $150, barba $100. Estamos en Av. Reforma 123.",
  "cfg.prompt.label": "Prompt del agente (avanzado)",
  "cfg.prompt.helpManual":
    "✍ Modo manual: su bot está usando este texto como prompt completo, en lugar del automático. Para verlo entero o volver al automático: Mi Agente → Flujo → Agente.",
  "cfg.prompt.helpDefault":
    "⚠️ Lo que escriba aquí REEMPLAZA el prompt completo del bot — incluida la información del negocio de arriba, su base de conocimiento y sus reglas de seguridad. No agrega instrucciones: las sustituye. Déjelo vacío para usar el prompt automático. Para editar sobre el prompt real, vaya a Mi Agente → Flujo → Agente.",
  "cfg.prompt.ph":
    "Vacío = el bot usa su prompt automático completo: la información del negocio, su base de conocimiento y sus reglas de seguridad.",
  // Barra de inserción del prompt manual (chips + "/"): ver prompt-tokens.ts.
  "pt.tokensHelp":
    "Puede insertar estas etiquetas: se sustituyen por su contenido real al guardar.",
  "pt.tokensLabel": "Etiquetas del prompt:",
  "pt.toolsLabel": "Herramientas:",
  "pt.slashHint": "Tip: escriba / en el campo para insertar una etiqueta o herramienta.",
  "pt.tok.business": "Toda su información del negocio (horarios, precios, ubicación).",
  "pt.tok.tools": "Lista de herramientas disponibles del bot.",
  "pt.tok.playbook": "Playbook del giro (diagnóstico y buenas prácticas).",
  "pt.tok.lessons": "Lecciones aprendidas de cómo atiende el dueño.",
  "pt.tok.instr": "Sus instrucciones adicionales (Mi Agente → Flujo → Cerebro).",
  "pt.tok.botName": "Nombre con el que se presenta el bot.",
  "pt.tok.bizName": "Nombre del negocio.",
  "pt.tok.lang": "Idioma base del bot.",
  "pt.tok.tool": "Herramienta del bot (el modelo la llama por su nombre).",
  "cfg.escalation.label": "Palabras que piden un humano",
  "cfg.escalation.help":
    "Si el cliente escribe alguna, el bot avisa a una persona. Sepárelas con comas.",
  "cfg.escalation.ph": "queja, reembolso, hablar con alguien",
  "cfg.media.title": "Botones y multimedia",
  "cfg.media.help":
    "El bot puede enviar botones, imágenes y audios en los canales que lo soporten (Telegram, Zernio, WhatsApp…). Actívelo aquí.",
  "cfg.media.allow": "Permitir que el bot envíe botones, imágenes y audios",
  "cfg.media.allowHint": "(en los canales que lo soporten; si no, degrada a texto)",
  "cfg.menu.label": "Botones del menú (opcional)",
  "cfg.menu.help":
    'Botones que se muestran con cada respuesta de saludo. Formato JSON: [{"text":"💬 Precios","callback":"precios"},{"text":"📅 Agendar","callback":"agendar"}] — usá "url" para un link.',
  "cfg.menu.ph":
    '[{"text":"💬 Precios","callback":"precios"},{"text":"📅 Agendar","callback":"agendar"}]',
  "cfg.resources.label": "Biblioteca de recursos (opcional)",
  "cfg.resources.help":
    'Imágenes/audios/botones que el bot puede enviar cuando el cliente los pida. Formato JSON: {"catalogo":{"image":"https://...","caption":"Nuestro catálogo 👇","buttons":[{"text":"Cotizar","url":"https://wa.me/..."}]},"bienvenida":{"audio":"https://..."}}. El bot los elige por nombre.',
  "cfg.resources.ph":
    '{"catalogo":{"image":"https://...","caption":"Nuestro catálogo 👇","buttons":[{"text":"Cotizar","url":"https://wa.me/..."}]}}',
  "cfg.saveChanges": "Guardar cambios",

  // ── Galería de recursos (views/recursos.ts) ────────────────────────────────
  "rec.title": "Galería de recursos",
  "rec.subtitle":
    "Subí imágenes, notas de voz y PDF que el bot puede enviar cuando el cliente los pida. Cada recurso lleva un «cuándo usarlo» para que el bot sepa cuándo mandarlo.",
  "rec.new": "Nuevo recurso",
  "rec.editing": "Editando: {name}",
  "rec.namePh": "nombre (ej. ofertas, bienvenida, menu)",
  "rec.kind.image": "Imagen",
  "rec.kind.audio": "Audio",
  "rec.kind.voice": "Nota de voz",
  "rec.kind.video": "Video",
  "rec.kind.document": "Documento (PDF)",
  "rec.file": "Archivo (máx {mb} MB; las imágenes se comprimen solas)",
  "rec.urlPh": "o pegá una URL: https://…",
  "rec.captionPh": "Texto que acompaña (opcional)",
  "rec.whenPh": "cuándo usarlo (ej. cuando pidan ofertas o promos)",
  "rec.keywordsPh": "palabras clave separadas por coma (opcional)",
  "rec.asVoice": "Enviar el audio como nota de voz",
  "rec.create": "Agregar",
  "rec.update": "Guardar cambios",
  "rec.cancel": "Cancelar",
  "rec.edit": "Editar",
  "rec.delete": "Borrar",
  "rec.when": "Cuándo",
  "rec.keywords": "Palabras",
  "rec.saved": "Guardado ✓",
  "rec.deleted": "Recurso eliminado",
  "rec.empty": "Todavía no hay recursos. Agregá uno arriba.",
  "rec.hint":
    "El bot los elige por nombre. Necesitás «Permitir multimedia» activo en Configuración y el módulo Galería desbloqueado.",
  "rec.footer":
    "Los recursos también se pueden usar en pasos de un disparador y en los seguimientos (Cazador), indicando el nombre del recurso.",
  "rec.firstMessage": "Enviar en el primer mensaje del cliente (campañas)",
  "rec.firstMessageHint":
    "Si lo marcás, el bot manda este recurso apenas el cliente escribe por primera vez (no lo decide la IA). Ideal para quienes llegan de una campaña.",
  "rec.badgeFirst": "1er mensaje",

  // Config · Tarjetas de control (control-levels.ts → renderCardGroup). El ES es
  // el TEXTO ORIGINAL verbatim; `label`/`title`/`help`/`desc` siguen siendo los
  // valores ES + las claves de matcheo, y estas `cl.*` son solo para mostrar.
  "cl.tone.title": "Tono",
  "cl.tone.help": "Cómo le habla el bot a sus clientes.",
  "cl.tone.calido.label": "Cálido",
  "cl.tone.calido.desc": "Amable y cercano, como un amigo.",
  "cl.tone.formal.label": "Formal",
  "cl.tone.formal.desc": "Serio y profesional, trato de usted.",
  "cl.tone.divertido.label": "Divertido",
  "cl.tone.divertido.desc": "Relajado y con buen humor.",
  "cl.speed.title": "Velocidad de respuesta",
  "cl.speed.help": "Qué tanto espera el bot a que el cliente termine de escribir.",
  "cl.speed.rapido.label": "Rápido",
  "cl.speed.rapido.desc": "Responde casi al instante (5 segundos).",
  "cl.speed.normal.label": "Normal",
  "cl.speed.normal.desc": "Espera un poco por si siguen escribiendo (15 segundos).",
  "cl.speed.pausado.label": "Pausado",
  "cl.speed.pausado.desc": "Espera más para juntar todo el mensaje (30 segundos).",
  "cl.style.title": "Estilo de mensajes",
  "cl.style.help": "En cuántas burbujas parte su respuesta.",
  "cl.style.unico.label": "Un mensaje",
  "cl.style.unico.desc": "Todo en una sola burbuja.",
  "cl.style.pocos.label": "2-3 cortos",
  "cl.style.pocos.desc": "Parte la respuesta en pocas burbujas.",
  "cl.style.varios.label": "Varios cortos",
  "cl.style.varios.desc": "Muchas burbujas cortas, estilo chat.",
  "cl.model.title": "Cerebro del bot",
  "cl.model.help": "Más barato vs más inteligente.",
  "cl.model.economico.label": "Económico",
  "cl.model.economico.desc": "El más barato, ideal para preguntas simples.",
  "cl.model.equilibrado.label": "Equilibrado",
  "cl.model.equilibrado.desc": "Elige solo según la dificultad de cada mensaje.",
  "cl.model.maximo.label": "Máximo",
  "cl.model.maximo.desc": "El más inteligente, para conversaciones complejas.",
  "cl.status.title": "Estado",
  "cl.status.help": "Encienda o apague el bot (ej. en vacaciones).",
  "cl.status.activo.label": "Activo",
  "cl.status.activo.desc": "El bot responde a sus clientes.",
  "cl.status.pausa.label": "En pausa",
  "cl.status.pausa.desc": "El bot no responde (útil en vacaciones).",

  // Config · Scraping web (Decodo)
  "cfg.scrape.providerLabel": "Proveedor de scraping",
  "cfg.scrape.help": "Quién lee el sitio del negocio. En «Auto» Decodo es el principal; si falla, se intenta bajar el sitemap directo (gratis) y por último AIsa.",
  "cfg.scrape.opt.auto": "Auto (Decodo primero · recomendado)",
  "cfg.scrape.opt.aisa": "AIsa (Firecrawl)",
  "cfg.scrape.opt.decodo": "Decodo",
  "cfg.scrape.aisaKeyLabel": "AIsa — API key (vacío = usa la del LLM)",
  "cfg.scrape.phAisa": "sk-… (se guarda, nunca se muestra)",
  "cfg.scrape.aisaOk": "AIsa lista",
  "cfg.scrape.aisaOrigin": "(origen: {src}, …{tail})",
  "cfg.scrape.aisaMissing": "Sin key de AIsa: se usará solo Decodo / el intento directo.",
  "cfg.scrape.clear": "Borrar (volver a heredar la del LLM)",

  // Config · Scraping web: qué hace cada proveedor (mapa visual)
  "scrape.prov.title": "Quién lee el sitio del negocio",
  "scrape.prov.help": "Dos proveedores hacen el trabajo, cada uno a su manera. Abajo eliges el modo; los dos cobran por uso.",
  "scrape.prov.now": "Trabajando: {name}",
  "scrape.prov.inUse": "EN USO",
  "scrape.prov.keyOk": "llave lista · …{tail} · {src}",
  "scrape.prov.keyMissing": "sin llave",
  "scrape.prov.mode.auto": "Automático",
  "scrape.prov.chain": "Orden de lectura",
  "scrape.prov.chain.decodo": "1 · Decodo",
  "scrape.prov.chain.direct": "2 · Sitemap directo",
  "scrape.prov.chain.aisa": "3 · AIsa",
  "scrape.prov.decodo.name": "Decodo",
  "scrape.prov.decodo.tag": "Scraper API · abre la URL exacta",
  "scrape.prov.decodo.what": "Abre una página concreta (el listado o la ficha de un auto) y devuelve su contenido real: HTML con datos estructurados, precio, millas y foto. Pasa por proxies, así que también entra en sitios que bloquean al bot.",
  "scrape.prov.decodo.role.auto": "Rol: primero en «Auto» — es el que lee las fichas de los autos.",
  "scrape.prov.decodo.role.only": "Rol: único proveedor. Si falla o se queda sin cuota, la corrida falla.",
  "scrape.prov.decodo.role.off": "Rol: no participa con el modo «Solo AIsa».",
  "scrape.prov.aisa.name": "AIsa · Firecrawl",
  "scrape.prov.aisa.tag": "Descubre links + convierte a texto",
  "scrape.prov.aisa.what": "Primero recorre el sitio y arma la lista de fichas (map). Después convierte cada página en Markdown limpio: texto, precios y fotos.",
  "scrape.prov.aisa.role.auto": "Rol: respaldo en «Auto» — entra si Decodo falla o no tiene cuota.",
  "scrape.prov.aisa.role.only": "Rol: único proveedor. Decodo no se usa en esta instalación.",
  "scrape.prov.aisa.role.off": "Rol: no participa con el modo «Solo Decodo».",
  "scrape.prov.note.auto": "Si el primero falla, el sistema sigue con el siguiente: nunca se queda sin leer el sitio.",
  "scrape.prov.note.aisa": "Con «Solo AIsa» no hay respaldo: si AIsa falla, la corrida falla.",
  "scrape.prov.note.decodo": "Con «Solo Decodo» no hay respaldo: si falla o se queda sin cuota, la corrida falla.",
  "cfg.decodo.title": "Scraping web — llaves y proveedor",
  "cfg.decodo.help":
    'Con esto el bot lee tu sitio (Web Sync / inventario). <b>Decodo</b>: se saca en <span class="font-mono">decodo.com</span> → Scraper API (usuario y contraseña, o el Basic en base64). <b>AIsa</b>: la misma key del gateway de IA. Cada uno cobra por uso.',
  "cfg.decodo.configured": "Configurada",
  "cfg.decodo.source": "· origen: {src} · termina en …{tail}",
  "cfg.decodo.notConfigured":
    "Sin configurar — el scraping queda apagado hasta que la pongas",
  "cfg.decodo.apiKeyLabel": "API key (usuario:contraseña o base64)",
  "cfg.decodo.phKeep": "vacío = conservar la actual",
  "cfg.decodo.phUserPass": "usuario:contraseña",
  "cfg.decodo.useWorker": "Usar la del worker",
  "cfg.decodo.clear": "Quitar la guardada",
  "cfg.decodo.viewLog": "Ver registro de scraping",
  "cfg.decodo.viewLogHint":
    "qué entró, salió o cambió en cada corrida (nuevos, vendidos, precios).",

  // Config · Modelo de IA
  "cfg.llm.title": "🧠 Modelo de IA",
  "cfg.llm.help":
    "Elige qué inteligencia artificial usa tu bot. Puedes usar tu propia API key para pagar tú el consumo directamente. Si lo dejas en automático, el bot usa la configuración incluida (rápido para lo simple, inteligente para lo difícil).",
  "cfg.llm.testOk": "✓ Conexión exitosa — respondió {model}",
  "cfg.llm.testErr": "✕ Falló la prueba: {msg}",
  "cfg.llm.provider": "Proveedor",
  "cfg.llm.model": "Modelo",
  "cfg.llm.providerAuto": "Automático (recomendado)",
  "cfg.llm.providerSameBot": "Igual que el bot (recomendado)",
  "cfg.llm.optClaude": "Claude (Anthropic)",
  "cfg.llm.optOpenai": "ChatGPT (OpenAI)",
  "cfg.llm.optAisa": "AIsa (gateway)",
  "cfg.llm.optXai": "Grok (xAI)",
  "cfg.llm.optMinimax": "MiniMax",
  "cfg.llm.optGoogle": "Google (Gemini)",
  "cfg.llm.modelAuto": "Automático (rápido ⇄ inteligente)",
  "cfg.llm.baseUrlLabel": "URL base del gateway (solo si usas AIsa/OpenRouter)",
  "cfg.llm.baseUrlHelp":
    "Vacío = OpenAI directo o la config del deploy. Para AIsa: https://api.aisa.one/v1 — se cambia aquí sin re-desplegar.",
  "cfg.llm.keyLabel": "Tu API key (opcional)",
  "cfg.llm.keyHelpSaved":
    "Hay una key guardada (termina en …{tail}). Escribe una nueva para reemplazarla, o marca la casilla para quitarla.",
  "cfg.llm.keyHelpEmpty":
    "Pégala aquí para que el consumo se cobre a tu cuenta. Vacío = usar la key incluida del sistema.",
  "cfg.llm.phKey": "sk-ant-… o sk-…",
  "cfg.llm.phMask": "••••••••••••",
  "cfg.llm.clearKey": "Quitar mi API key y volver a la del sistema",
  "cfg.llm.testLink": "⚡ Probar mi configuración (guarda primero)",

  // Config · Zona horaria
  "cfg.tz.title": "🕐 Zona horaria del negocio",
  "cfg.tz.help":
    'La hora y la fecha que usa tu bot para entender "hoy", "mañana" o "el viernes", y para agendar citas. Poné la zona donde atiende el negocio, no la tuya: si no coincide, las citas se agendan con la hora equivocada.',
  "cfg.tz.label": "Zona horaria",
  "cfg.tz.default": "Por defecto ({tz})",

  // Config · Modelo de análisis (scraping)
  "cfg.analysis.title": "🧪 Modelo de análisis (scraping)",
  "cfg.analysis.help":
    "El inventario que se scrapea del sitio se revisa con un modelo para corregir títulos, precios y millas mal parseados. Deja todo vacío para usar la misma configuración del bot, o elige aquí un modelo distinto — por ejemplo Claude Opus para el análisis y un modelo barato para chatear.",
  "cfg.analysis.sameBot": "Igual que el bot",
  "cfg.analysis.baseUrlLabel": "URL base del gateway (opcional)",
  "cfg.analysis.baseUrlHelp": "Vacío = la misma del bot. Para AIsa: https://api.aisa.one/v1",
  "cfg.analysis.keyLabel": "API key del análisis (opcional)",
  "cfg.analysis.keyHelpSaved":
    "Hay una key guardada (termina en …{tail}). Escribe una nueva para reemplazarla.",
  "cfg.analysis.keyHelpEmpty":
    "Vacío = usa la misma API del bot. Si eliges OTRO proveedor arriba, pega aquí su key: la del bot no sirve para otro proveedor.",
  "cfg.analysis.clearKey": "Quitar esta API key y volver a la del bot",

  // ── Conexiones (conexiones.ts) ─────────────────────────────────────────────
  "cx.title": "Conexiones",
  "cx.heading": "Canales conectados: {connected} de {total}",
  "cx.subtitle":
    'Conecta los canales donde están tus clientes. Cuando un canal queda listo, su tarjeta se pone verde. Zernio se conecta pegando su API key aquí mismo; los demás canales se configuran con <span class="font-mono">wrangler secret put NOMBRE</span>.',
  "cx.connected": "● CONECTADO",
  "cx.disconnected": "○ SIN CONECTAR",
  "cx.missing": "Falta configurar:",
  "cx.copy": "copiar",
  "cx.copied": "copiado ✓",
  "cx.pause": "⏸ Pausar canal",
  "cx.resume": "▶ Reanudar canal",
  "cx.pausedNote": "Este canal está pausado: los mensajes se ignoran.",
  "cx.clear": "Quitar conexión",
  "cx.update": "Actualizar conexión",
  "cx.webhookUrl": "Webhook URL:",

  // Conexiones · nombres de canal con texto traducible
  "cx.name.wacloud": "WhatsApp (Oficial · Cloud API)",
  "cx.name.zernio": "Zernio (multicanal)",
  "cx.name.webchat": "Sitio web (chat propio)",

  // Conexiones · descripción y guía de cada canal
  "cx.telegram.desc": "Bot de Telegram — gratis y el más rápido de conectar.",
  "cx.telegram.howTo":
    "Crea el bot con @BotFather y pega el token abajo: lo valida y registra el webhook automáticamente. Opcional: tu chat id para los avisos al dueño.",
  "cx.twilio.desc": "WhatsApp Business vía Twilio — el canal que más venden.",
  "cx.twilio.howTo":
    "En Twilio: número WhatsApp aprobado → apunta el webhook de mensajes entrantes a la URL de abajo.",
  "cx.twilio.security":
    "Sin TWILIO_HANDOFF_CONTENT_SID: el aviso de handoff por WhatsApp requiere una plantilla (HSM) aprobada.",
  "cx.wacloud.desc": "WhatsApp directo con Meta, sin intermediario — mejor margen.",
  "cx.wacloud.howTo":
    "App de Meta → WhatsApp → Configuration: apunta el webhook a la URL de abajo, suscribe el campo messages, y guarda tu Phone Number ID y token. Pruébalo con el número de prueba gratis.",
  "cx.meta.desc": "DMs de Instagram y Messenger con la API oficial de Meta.",
  "cx.meta.howTo":
    "App de Meta → Webhooks → suscribe messages con tu VERIFY_TOKEN; la firma se valida sola.",
  "cx.manychat.desc": "Si ya usas ManyChat, el bot puede vivir detrás de tus flujos.",
  "cx.manychat.howTo": "En ManyChat: External Request hacia la URL de abajo.",
  "cx.zernio.desc":
    "Todas tus redes con una api key: Instagram, Facebook/Messenger, X, Telegram, WhatsApp, Bluesky, Reddit… Conecta TU cuenta personal (no el bot) — la IA responde tus DMs y quedan en el panel.",
  "cx.zernio.howTo":
    "zernio.com → copia tu API key y pégala aquí. El canal queda conectado y su webhook se registra automáticamente (message.received + comment.received); el webhook secret es opcional para validar la firma.",
  "cx.zernio.security":
    "Sin ZERNIO_WEBHOOK_SECRET el webhook acepta todo (fail-open). Recomendado: ponlo para validar la firma.",
  "cx.ml.desc":
    "La IA responde las preguntas de tus publicaciones y los mensajes post-venta con el comprador. Necesita una app propia (gratis) en tu cuenta de vendedor.",
  "cx.ml.howTo":
    "1) developers.mercadolibre.com → Crear aplicación (con tu cuenta de vendedor, necesita 2FA). 2) En 'URI de redirect' pega la URL de OAuth de abajo. 3) En 'Notificaciones (callbacks)' pega la URL de webhook de abajo y activa los tópicos 'questions' y 'messages'. 4) Marca los permisos read, write y offline_access. 5) Copia el App ID y la Secret Key, elige tu país y guárdalos aquí. Luego toca 'Autorizar con MercadoLibre'.",
  "cx.waha.desc":
    "Tu propio WhatsApp por QR, sin Meta ni Twilio — corre en un servidor WAHA (Docker) que tú controlas.",
  "cx.waha.howTo":
    "Pega la URL de tu servidor WAHA y su API key (X-Api-Key). El bot crea/arranca la sesión y registra el webhook solo — después escaneas el QR aquí mismo con tu WhatsApp.",
  "cx.waha.security":
    "Sin webhook token: el webhook acepta cualquier request (fail-open). Se genera solo al guardar la conexión.",
  "cx.webchat.desc":
    "El chat en tu propia página. Sin tokens ni verificación — el más fácil de todos.",
  "cx.webchat.howTo":
    'Pegá esta línea en tu web, antes de </body>: <script src="<tu-worker>/chat.js" async></script> — ya queda una burbuja de chat que contesta tu bot.',

  // Conexiones · piezas faltantes (etiquetas traducibles)
  "cx.ml.missingAuth": "autorización del vendedor",
  "cx.waha.missingUrl": "URL del servidor WAHA",
  "cx.waha.missingKey": "API key de WAHA",

  // Conexiones · formulario Zernio
  "cx.zernio.apiKeyLabel": "API key de Zernio",
  "cx.zernio.phKeySaved": "hay una key guardada (…{tail})",
  "cx.zernio.phKey": "Pega tu API key de zernio.com",
  "cx.zernio.secretLabel": "Webhook secret (recomendado)",
  "cx.phSecretSaved": "secreto guardado — escribe para reemplazar",
  "cx.zernio.phSecret": "opcional: firma HMAC de los webhooks",
  "cx.zernio.connect": "Conectar Zernio",

  // Conexiones · formulario Telegram
  "cx.telegram.tokenLabel": "Token del bot (BotFather)",
  "cx.telegram.phTokenSaved": "token guardado — escribe para reemplazar",
  "cx.telegram.phToken": "Pega el token de @BotFather",
  "cx.telegram.chatLabel": "Tu chat id de Telegram (avisos al dueño)",
  "cx.telegram.phChatSaved": "hay un id guardado (…{tail}) — escribe para reemplazar",
  "cx.telegram.phChat":
    "opcional: mándale /start a tu bot y mira tu id con @userinfobot",
  "cx.telegram.connect": "Conectar Telegram",
  "cx.telegram.clearOwner": "Quitar aviso",

  // Conexiones · formulario MercadoLibre
  "cx.ml.redirectHint": "URI de redirect (OAuth) — pégala en tu app de MercadoLibre:",
  "cx.ml.country": "País de tu cuenta",
  "cx.ml.appId": "App ID (client_id)",
  "cx.ml.phAppIdSaved": "hay un App ID guardado — escribe para reemplazar",
  "cx.ml.phAppId": "número de tu app en developers.mercadolibre.com",
  "cx.ml.secret": "Secret Key (client_secret)",
  "cx.ml.phSecret": "Secret Key de tu app",
  "cx.ml.save": "Guardar datos",
  "cx.ml.reauth": "Volver a autorizar",
  "cx.ml.authorize": "Autorizar con MercadoLibre",
  "cx.ml.authorized": "Vendedor autorizado",

  // Conexiones · formulario WAHA
  "cx.waha.urlLabel": "URL del servidor WAHA",
  "cx.waha.phUrlSaved": "hay una URL guardada ({url}) — escribe para reemplazar",
  "cx.waha.phUrl": "http://tu-servidor-waha:3000",
  "cx.waha.keyLabel": "API key (X-Api-Key)",
  "cx.phKeySaved": "hay una key guardada (…{tail})",
  "cx.waha.phKey": "la API key de tu servidor WAHA",
  "cx.waha.session": "Sesión",
  "cx.waha.connect": "Conectar WAHA",
  "cx.waha.restart": "Reiniciar sesión y generar QR",
  "cx.waha.statusLine": " (estado: {status})",
  "cx.waha.statusUnknown": " (no pude consultar el estado de WAHA)",
  "cx.waha.qrWarn":
    "⚠ Falta emparejar: escanea este QR con WhatsApp (Dispositivos vinculados → Vincular dispositivo).",
  "cx.waha.qrAlt": "QR de WhatsApp (WAHA)",
  "cx.waha.qrError":
    "No pude cargar la imagen del QR. Reinicia la sesión e inténtalo de nuevo.",
  "cx.waha.qrHint":
    "El QR se renueva solo cada 20 seg (WhatsApp lo rota): escanéalo apenas aparezca.",
  "cx.waha.working": "✓ WhatsApp emparejado y activo",
  "cx.waha.sessionSuffix": " (sesión {session})",
  "cx.waha.closed": "⚠ La sesión de WAHA está cerrada",
  "cx.waha.relinkHint":
    ": hay que volver a vincular WhatsApp. Reinicia la sesión y escanea el QR nuevo.",
  "cx.waha.unreachable": "⚠ No pude leer el estado de la sesión en WAHA",
  "cx.waha.unreachableHint":
    ". Revisa que el servidor esté encendido y que la URL y la API key sean correctas.",

  // Conexiones · cuentas Zernio
  "cx.za.title": "CUENTAS CONECTADAS EN ZERNIO",
  "cx.za.reconnect": "· reconectar",
  "cx.za.inactive": "· inactiva",
  "cx.za.active": "· activa",
  "cx.za.followers": "· {n} seguidores",
  "cx.za.dmThisHour": "DM esta hora",
  "cx.za.empty":
    "No se pudieron listar tus cuentas de Zernio (o no hay cuentas conectadas aún). Conéctalas en zernio.com.",

  // Conexiones · banners de guardado
  "cx.saved.telegram":
    "✓ Telegram conectado: webhook registrado automáticamente. Envía un mensaje a tu bot para probarlo.",
  "cx.saved.zernio":
    "✓ Zernio conectado: webhook registrado automáticamente (message.received + comment.received). Los comentarios/DMs ya deberían fluir.",
  "cx.saved.mercadolibre":
    "✓ MercadoLibre: datos guardados. Si ya autorizaste al vendedor, la IA responderá las preguntas y mensajes post-venta. Falta activar los tópicos 'questions' y 'messages' en las notificaciones de tu app.",
  "cx.saved.waha":
    "✓ WAHA conectado: sesión creada/actualizada y webhook registrado. Si te pide QR, bájalo en la card de WAHA aquí abajo.",
  "cx.saved.vapi":
    "✓ Vapi guardado. Pegá el Server URL de arriba en el dashboard de Vapi (Assistant → Server URL).",
  "cx.saved.retell":
    "✓ Retell guardado. Pegá el Webhook URL de arriba en el dashboard de Retell.",
  "cx.saved.voz": "✓ Parámetros de la cartera por voz guardados.",

  // Conexiones · cobros por voz (Vapi / Retell)
  "cx.voice.title": "Cobros por voz: Vapi / Retell",
  "cx.voice.help":
    "Llamadas con IA para la cartera de cobros. Elegí el proveedor activo y pegá sus datos; el webhook de cada plataforma ya está listo para pegar en su dashboard.",
  "cx.vReady": "LISTO",
  "cx.vMissing": "FALTA",
  "cx.vapi.title": "Vapi (voz)",
  "cx.vapi.help":
    "Agente de voz para llamar a los deudores de la cartera. Créalo en dashboard.vapi.ai, pega aquí sus datos y su Server URL abajo.",
  "cx.vapi.keyPh": "sk_live_… (vacío = conservar)",
  "cx.vapi.assistantHint": "El asistente que contesta la llamada",
  "cx.vapi.phoneHint": "Phone Numbers → id del número saliente",
  "cx.vapi.secretPh": "(secreto del Server URL, opcional)",
  "cx.vapi.secretHint": "Se recibe en el header X-Vapi-Secret y se valida el webhook",
  "cx.vapi.useActive": "Usar Vapi como proveedor activo de cobros",
  "cx.vapi.save": "Guardar Vapi",
  "cx.retell.title": "Retell (voz)",
  "cx.retell.help":
    "Alternativa a Vapi para las llamadas de cobranza. Crea el agente en dashboard.retellai.com y pega aquí sus datos.",
  "cx.retell.keyPh": "key_… (vacío = conservar)",
  "cx.retell.agentHint": "El agente que contesta la llamada",
  "cx.retell.phoneLabel": "Número saliente",
  "cx.retell.phoneHint":
    "Número comprado en Retell (E.164). Opcional si el agente ya lo trae.",
  "cx.retell.secretPh": "(secreto del webhook, opcional)",
  "cx.retell.secretHint": "Se usa para verificar los webhooks de Retell",
  "cx.retell.useActive": "Usar Retell como proveedor activo de cobros",
  "cx.retell.save": "Guardar Retell",
  "cx.voz.title": "Cartera de cobros — parámetros",
  "cx.voz.objectiveLabel": "Objetivo / tono del guion",
  "cx.voz.objectivePh":
    "Ej: recordar el saldo, ofrecer plan de pagos, tono firme pero respetuoso",
  "cx.voz.objectiveHint": "Contexto que el agente de voz usa durante la llamada",
  "cx.voz.attemptsLabel": "Intentos máximos por deudor",
  "cx.voz.save": "Guardar parámetros",

  // ── Extras / Habilidades (extras.ts) ───────────────────────────────────────
  "extras.title": "Extras",
  "extras.saved": "Guardado ✓",
  "extras.reportOk": "✓ Reporte enviado por: {channels}",
  "extras.actua.bot": "Actúa en el bot",
  "extras.actua.panel": "Actúa en el panel",
  "extras.actua.both": "Actúa en bot y panel",
  "extras.locked": "🔒 BLOQUEADO",
  "extras.active": "● ACTIVO",
  "extras.inactive": "○ DESACTIVADO",
  "extras.on": "Encendida",
  "extras.off": "Apagada",
  "extras.requiresLicense": "Requiere licencia →",
  "extras.license": "Licencia",
  "extras.report.channelLabel": "¿Por dónde te lo mando?",
  "extras.report.email": "Correo",
  "extras.report.both": "Telegram + correo",
  "extras.report.testBtn": "📨 Enviar prueba ahora",
  "extras.singlePayment": "PAGO ÚNICO",
  "extras.membership": "MEMBRESÍA",
  "extras.included.title": "Habilidades — incluidas",
  "extras.included.help":
    "Esto lo hace tu bot desde el primer día, sin costo extra. No hay nada que encender.",
  "extras.paid.title": "Superpoderes — funciones de pago",
  "extras.paid.help":
    "Enciende o apaga cada superpoder con su interruptor. Las bloqueadas (🔒) necesitan una licencia que las incluya — revisa la pestaña Licencia. Los cambios se guardan al presionar el botón de abajo.",
  "extras.save": "Guardar cambios",

  // ── Licencia (licencia.ts) ─────────────────────────────────────────────────
  "lic.title": "Licencia",
  "lic.heading": "Licencia",
  "lic.subtitle":
    "Todas las funciones vienen activas en el plan gratis. Pro solo quita los límites de cantidad. Se valida localmente (sin servidores).",
  "lic.forever": "de por vida",
  "lic.monthlyExpiresToday": "mensual · vence hoy ({date})",
  "lic.monthlyExpiresInDays": "mensual · vence en {n} {days} ({date})",
  "lic.day": "día",
  "lic.days": "días",
  "lic.grace": "venció el {date} · periodo de gracia ({n} {days})",
  "lic.expired": "venció el {date}",
  "lic.badge.grace": "⚠ LICENCIA VENCIDA — GRACIA",
  "lic.badge.pro": "● PRO ACTIVO",
  "lic.badge.free": "○ PLAN GRATIS",
  "lic.badge.unlimited": "● TODO DESBLOQUEADO",
  "lic.unlimited.state": "instalación sin licencia",
  "lic.unlimited.help":
    "Esta instalación está fuera del esquema de licencias: todas las funciones están desbloqueadas y no hay límites de uso (contactos, mensajes, canales, reglas). No hace falta ningún código.",
  "lic.grace.help":
    "El Pro sigue activo por ahora. Pídele a tu proveedor el código nuevo y pégalo abajo, o el bot pasará al plan gratis con sus límites.",
  "lic.pro.help":
    'Todas las funciones activas y <b class="text-cream">sin límites de uso</b>: contactos, mensajes/mes, canales, automatizaciones y links trackeados.{soon}',
  "lic.pro.soon":
    ' <b class="text-cream">Tu código vence pronto</b> — pídele el nuevo a tu proveedor.',
  "lic.expired.help":
    "Tu licencia venció. Pega un código nuevo para volver a Pro.",
  "lic.free.help":
    '<b class="text-cream">Todas las funciones están activas</b> — igual que en Pro. El plan gratis solo tiene límites de cantidad (abajo); Pro los quita.',
  "lic.overlay.badge": "SINCRONIZADO CON EL PANEL",
  "lic.overlay.info": "plan {plan} · {state} · {modules} módulos",
  "lic.overlay.lastSync":
    "Última sincronización: {date}. El super admin controla plan, módulos, límites y marca; se aplica solo en el próximo sync.",
  "lic.overlay.none": "Este bot todavía no sincronizó con el panel. Si te asignaron Pro, tocá Sincronizar ahora.",
  "lic.overlay.sync": "Sincronizar ahora",
  "lic.code.active": "Tu código activo",
  "lic.code.activate": "Activar Pro con un código",
  "lic.code.replace": "Reemplazar código",
  "lic.code.activateBtn": "Activar Pro",
  "lic.code.remove": "Quitar licencia",
  "lic.limits.title": "Límites del plan gratis",
  "lic.limits.help":
    "Ninguna función está bloqueada — estos son los únicos topes. Pro los quita todos.",
  "lic.limit.contacts": "Contactos únicos",
  "lic.limit.messages": "Mensajes IA / mes",
  "lic.limit.channels": "Canales conectados",
  "lic.limit.rules": "Reglas de automatización",
  "lic.limit.autoDms": "Respuestas automáticas / mes",
  "lic.limit.links": "Links trackeados",
  "lic.limit.zernio": "Cuentas Zernio",
  "lic.limit.logs": "Historial de logs",
  "lic.limit.logsValue": "{n} días",

  // ── Equipo (equipo.ts) ─────────────────────────────────────────────────────
  "eq.title": "Equipo",
  "eq.heading": "Equipo",
  "eq.subtitle":
    'Entrega el panel a tu gente sin darle tu contraseña. Agregá su correo y su rol; cada quien entra con su propio acceso. Tú seguís entrando igual (admin + tu contraseña) y ves quién hizo qué en <b class="text-cream">Auditoría</b>.',
  "eq.empty":
    "Aún no tienes colaboradores. Tu acceso (admin + contraseña) sigue funcionando igual.",
  "eq.role.owner": "Administrador — ve todo",
  "eq.role.staff": "Equipo — solo opera",
  "eq.remove": "Quitar",
  "eq.emailLabel": "Correo",
  "eq.emailPh": "carlos@ejemplo.com",
  "eq.roleLabel": "Rol",
  "eq.roleOpt.staff": "Equipo (solo opera)",
  "eq.roleOpt.owner": "Administrador (ve todo)",
  "eq.add": "Agregar",
  "eq.members": "Colaboradores",

  // ── Comandos (comandos.ts) ─────────────────────────────────────────────────
  "cmd.title": "Comandos",
  "cmd.heading": "Comandos",
  "cmd.subtitle":
    'El cheat sheet completo. Los de terminal se corren directo; los que empiezan con <span class="font-mono">/</span> son prompts — copialos y pegáselos a tu agente (Claude Code / Codex) en la carpeta del bot.',
  "cmd.terminal.title": "Terminal · CLI",
  "cmd.agent.title": "Agente · prompts",
  "cmd.copy": "Copiar",
  "cmd.copied": "✓ Copiado",
  "cmd.terminal.init": "Instala: descarga el template, configura el bot y despliega.",
  "cmd.terminal.list": "Lista los giros (nichos) disponibles.",
  "cmd.terminal.install": "Instala el bot de un giro (ej. restaurante).",
  "cmd.terminal.login": "Conecta el CLI a tu cuenta Kooni (abre el navegador).",
  "cmd.terminal.whoami": "Muestra con qué cuenta estás conectado.",
  "cmd.terminal.pair": "Vincula un bot ya desplegado a tu cuenta.",
  "cmd.terminal.update": "Actualiza tu bot sin perder tu config ni tus datos.",
  "cmd.terminal.deploy": "Provisiona Cloudflare y publica el worker.",
  "cmd.terminal.doctor": "Diagnóstico del bot instalado.",
  "cmd.terminal.version": "Versión del CLI.",
  "cmd.agent.setup": "Setup inicial completo (negocio, canales, deploy).",
  "cmd.agent.report": "Informe de valor de lo que hizo tu bot.",
  "cmd.agent.export": "Exporta tus datos (leads, conversaciones).",
  "cmd.agent.update": "Actualiza el bot a la última versión.",
  "cmd.agent.prompt": "Ve y editá tu prompt por secciones (puerta de entrada).",
  "cmd.agent.cleanPrompt":
    "Desinfla un prompt largo: mueve datos a la KB y quita duplicados.",
  "cmd.agent.versionPrompt":
    "Historial del prompt: guardá versiones y volvé a cualquiera.",
  "cmd.agent.labPrompt": "A/B del prompt: variantes + conversaciones simuladas.",
  "cmd.agent.perChannel": "Una personalidad por canal (WhatsApp, Instagram…).",
  "cmd.agent.audit": "Califica tu prompt contra las buenas prácticas.",
  "cmd.agent.examples": "Convierte tus mejores chats en ejemplos (few-shot).",

  // ── Automatizaciones (automatizaciones.ts) ─────────────────────────────────
  "auto.title": "Automatizaciones",
  "auto.heading": "Automatizaciones",
  "auto.subtitle":
    "Reglas keyword → respuesta para comentarios y DMs. Cuando una regla matchea, gana ella (la IA no interviene). Se aplican en Instagram, Facebook y más vía Zernio.",
  "auto.saved": "✓ Guardado",
  "auto.loadError": "No se pudieron cargar las reglas: {msg}",
  "auto.kind.commentDm": "Comentario → DM privado",
  "auto.kind.commentDmDesc":
    "Alguien comenta una keyword en tu post → le envías un DM privado (+ botón) y opcionalmente respondes su comentario en público.",
  "auto.kind.commentDmPublic": "Comentario → respuesta pública + DM",
  "auto.kind.commentDmPublicDesc":
    "Alguien comenta una keyword → respondes su comentario en público Y le envías un DM privado. Ideal para promocionar y captar a la vez.",
  "auto.kind.commentReply": "Comentario → respuesta pública",
  "auto.kind.commentReplyDesc":
    "Alguien comenta una keyword → respondes su comentario en público (visible para todos). Sin DM privado.",
  "auto.kind.dmReply": "DM → respuesta automática",
  "auto.kind.dmReplyDesc":
    "Alguien te escribe por privado una keyword → le respondes al momento, sin pasar por la IA.",
  "auto.platform.all": "Todas las plataformas",
  "auto.edit": "✏️ Editar",
  "auto.pause": "⏸ Pausar",
  "auto.activate": "▶ Activar",
  "auto.delete": "🗑 Eliminar",
  "auto.keywords": "keywords:",
  "auto.clicks.one": "👆 {n} click en los links de esta regla",
  "auto.clicks.many": "👆 {n} clicks en los links de esta regla",
  "auto.replyPublic": "↩ Respuesta pública:",
  "auto.followGate":
    "🔒 Follow gate: exige follow antes de entregar el link",
  "auto.fallbackAi.title":
    "✨ Responder con IA los comentarios sin automatización",
  "auto.fallbackAi.help":
    "El bot genera la respuesta pública con tu modelo (en el idioma del comentario). <b>Tiene prioridad</b> sobre el texto fijo de abajo. <b>Nunca DM.</b> Con tope de seguridad por día.",
  "auto.fallbackAi.ph":
    "Instrucciones para la IA (opcional). Ej: responde en tono cercano y ofrece escribir por privado.",
  "auto.fallbackFixed.title": "Responder en público con un texto fijo",
  "auto.fallbackFixed.help":
    "Si la IA de arriba está apagada, un comentario sin regla recibe esta respuesta pública. <b>Nunca DM.</b> Apágalo y esos comentarios se ignoran.",
  "auto.fallbackFixed.ph": "¡Gracias por tu comentario! 🙌 Te leemos.",
  "auto.followGate.notFollowing": "Follow gate: mensaje si todavía no te sigue",
  "auto.followGate.notFollowingPh":
    "Todavía no me apareces como seguidor 🙏 Sígueme y toca el botón otra vez para recibir el link 👇",
  "auto.followGate.notFollowingHelp":
    "Se le manda a quien tocó “Ya te sigo” pero la verificación dice que aún no te sigue (o no se pudo comprobar). Vacío = se usa el mensaje de follow de la regla. El botón de confirmación se agrega solo.",
  "auto.empty":
    "Aún no hay automatizaciones. Crea la primera con el formulario de abajo.",
  "auto.editTitle": "✏️ Editar automatización",
  "auto.newTitle": "Nueva automatización",
  "auto.templateLabel": "O empezar de una plantilla",
  "auto.clear": "✕ Vaciar",
  "auto.templateHint":
    "Toca una plantilla y el formulario se rellena solo; ajusta keywords y mensajes a tu negocio.",
  "auto.form.kind": "Tipo de flujo",
  "auto.form.platform": "Plataforma",
  "auto.form.keywords": "Keywords (separadas por coma)",
  "auto.form.keywordsPh": "precio, cuánto cuesta, cotización",
  "auto.form.message": "Mensaje del DM / respuesta",
  "auto.form.messagePh":
    "¡Hola {username}! 👋 Gracias por tu interés. Te mando el catálogo:",
  "auto.form.usernameHint":
    'Puedes usar <span class="font-mono">{"{username}"}</span> para saludar al cliente por su nombre.',
  "auto.form.wholeWord":
    'La keyword debe ser palabra completa (recomendado). Desmárcalo para matchear también dentro de otras palabras (ej. "link" matchea "linking").',
  "auto.form.requireFollow":
    "Follow gate: exigir que el cliente siga la cuenta antes de entregar el link (hace crecer tu cuenta).",
  "auto.form.followPrompt": "Mensaje para pedir el follow (opcional)",
  "auto.form.followPromptPh":
    "Hola {username}! Sígueme y toca el botón para recibir el link 👇",
  "auto.form.followButton": "Texto del botón de confirmación (opcional)",
  "auto.form.followButtonPh": "Ya te sigo",
  "auto.form.buttonLabel": "Texto del botón (opcional)",
  "auto.form.buttonLabelPh": "Ver catálogo",
  "auto.form.buttonUrl": "Link del botón (opcional)",
  "auto.form.buttonUrlPh": "https://tusitio.com/catalogo",
  "auto.form.replyComment": "Respuesta pública fija (opcional)",
  "auto.form.replyCommentPh": "¡Gracias por preguntar! Te escribí por privado ✨",
  "auto.form.aiReply": "Respuesta pública con IA (opcional, reemplaza la fija)",
  "auto.form.aiReplyPh":
    "Ej. Responde breve y cálido, en mi tono, agradeciendo el comentario e invitando a escribir por privado. Máximo 2 oraciones.",
  "auto.form.aiReplyHint":
    "La IA genera la respuesta pública usando la llave/configuración del bot, en tu tono. Si falla, usa la respuesta fija de arriba (si la hay).",
  "auto.form.save": "💾 Guardar cambios",
  "auto.form.create": "+ Crear automatización",
  "auto.form.cancel": "Cancelar",
  "auto.form.immediate": "La regla queda activa de inmediato.",
  "auto.logs.title": "Historial de envíos",
  "auto.logs.help":
    'Cada intento de DM o respuesta pública: quién, qué, estado y motivo. <span class="font-mono">sent</span> = enviado · <span class="font-mono">skipped</span> = omitido (dedup/regla) · <span class="font-mono">failed</span> = falló.',
  "auto.logs.empty": "Aún no hay envíos registrados.",
  "auto.logKind.commentDm": "comentario→DM",
  "auto.logKind.commentReply": "comentario→público",
  "auto.logKind.commentDmPublic": "comentario→DM+público",
  "auto.logKind.dmReply": "DM→respuesta",
} as const;
