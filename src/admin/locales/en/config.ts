import type { configEs } from "../es/config";

// English mirror of `configEs`. Must cover EVERY key of the ES dict (enforced by
// the type). Keys grouped the same way as the Spanish source.
export const configEn: Record<keyof typeof configEs, string> = {
  // ── Settings (config.ts) ───────────────────────────────────────────────────
  "cfg.title": "Config",
  "cfg.saved": "Saved ✓",
  "cfg.history.title": "Prompt history",
  "cfg.history.help": 'Last {n} versions. "Restore" brings that version back.',
  "cfg.history.restore": "Restore this one",
  "cfg.heading": "Control panel for {name}",
  "cfg.subtitle":
    "Adjust how your bot behaves. Changes are saved when you press the button below.",
  "cfg.botName.label": "Bot name",
  "cfg.botName.help": "How your assistant introduces itself to customers.",
  "cfg.botName.ph": "My assistant",
  "cfg.persona.label": "Who answers the chats?",
  "cfg.persona.help":
    "By default the bot introduces itself as the business's assistant. If you pick “You yourself”, the bot speaks in the first person as the owner (it doesn't say “I'm the assistant”).",
  "cfg.persona.business": "Business assistant",
  "cfg.persona.you": "You yourself (first person)",
  "cfg.business.label": "Business information",
  "cfg.business.help":
    "Hours, services, prices, location. The bot answers with this. Editable live — it applies when you save, no redeploy needed.",
  "cfg.business.ph":
    "e.g. We're open Monday to Saturday, 9 to 7. Haircut $150, beard $100. We're at Av. Reforma 123.",
  "cfg.prompt.label": "Agent prompt (advanced)",
  "cfg.prompt.helpManual":
    "✍ Manual mode: your bot is using this text as its full prompt, instead of the automatic one. To see it in full or go back to automatic: My Agent → Flow → Agent.",
  "cfg.prompt.helpDefault":
    "⚠️ What you write here REPLACES the bot's full prompt — including the business information above, its knowledge base and its safety rules. It doesn't add instructions: it replaces them. Leave it empty to use the automatic prompt. To edit on top of the real prompt, go to My Agent → Flow → Agent.",
  "cfg.prompt.ph":
    "Empty = the bot uses its full automatic prompt: the business information, its knowledge base and its safety rules.",
  // Insert bar for the manual prompt (chips + "/"): see prompt-tokens.ts.
  "pt.tokensHelp":
    "You can insert these tags: they get replaced with their real content when you save.",
  "pt.tokensLabel": "Prompt tags:",
  "pt.toolsLabel": "Tools:",
  "pt.slashHint": "Tip: type / in the field to insert a tag or tool.",
  "pt.tok.business": "All your business information (hours, prices, location).",
  "pt.tok.tools": "List of the bot's available tools.",
  "pt.tok.playbook": "Industry playbook (diagnostics and best practices).",
  "pt.tok.lessons": "Lessons learned from how the owner handles cases.",
  "pt.tok.instr": "Your additional instructions (My Agent → Flow → Brain).",
  "pt.tok.botName": "Name the bot introduces itself with.",
  "pt.tok.bizName": "Business name.",
  "pt.tok.lang": "The bot's base language.",
  "pt.tok.tool": "Bot tool (the model calls it by name).",
  "cfg.escalation.label": "Words that ask for a human",
  "cfg.escalation.help":
    "If the customer writes any of these, the bot notifies a person. Separate them with commas.",
  "cfg.escalation.ph": "complaint, refund, talk to someone",
  "cfg.media.title": "Buttons and media",
  "cfg.media.help":
    "The bot can send buttons, images and audio on the channels that support it (Telegram, Zernio, WhatsApp…). Turn it on here.",
  "cfg.media.allow": "Let the bot send buttons, images and audio",
  "cfg.media.allowHint": "(on the channels that support it; otherwise it falls back to text)",
  "cfg.menu.label": "Menu buttons (optional)",
  "cfg.menu.help":
    'Buttons shown with every greeting reply. JSON format: [{"text":"💬 Prices","callback":"prices"},{"text":"📅 Book","callback":"book"}] — use "url" for a link.',
  "cfg.menu.ph":
    '[{"text":"💬 Prices","callback":"prices"},{"text":"📅 Book","callback":"book"}]',
  "cfg.resources.label": "Resource library (optional)",
  "cfg.resources.help":
    'Images/audio/buttons the bot can send when the customer asks for them. JSON format: {"catalog":{"image":"https://...","caption":"Our catalog 👇","buttons":[{"text":"Get a quote","url":"https://wa.me/..."}]},"welcome":{"audio":"https://..."}}. The bot picks them by name.',
  "cfg.resources.ph":
    '{"catalog":{"image":"https://...","caption":"Our catalog 👇","buttons":[{"text":"Get a quote","url":"https://wa.me/..."}]}}',
  "cfg.saveChanges": "Save changes",

  // ── Resource gallery (views/recursos.ts) ───────────────────────────────────
  "rec.title": "Resource gallery",
  "rec.subtitle":
    "Upload images, voice notes and PDFs the bot can send when the customer asks. Each resource has a \"when to use it\" so the bot knows when to send it.",
  "rec.new": "New resource",
  "rec.editing": "Editing: {name}",
  "rec.namePh": "name (e.g. offers, welcome, menu)",
  "rec.kind.image": "Image",
  "rec.kind.audio": "Audio",
  "rec.kind.voice": "Voice note",
  "rec.kind.video": "Video",
  "rec.kind.document": "Document (PDF)",
  "rec.file": "File (max {mb} MB; images are compressed automatically)",
  "rec.urlPh": "or paste a URL: https://…",
  "rec.captionPh": "Text that goes with it (optional)",
  "rec.whenPh": "when to use it (e.g. when they ask about offers or promos)",
  "rec.keywordsPh": "keywords separated by commas (optional)",
  "rec.asVoice": "Send the audio as a voice note",
  "rec.create": "Add",
  "rec.update": "Save changes",
  "rec.cancel": "Cancel",
  "rec.edit": "Edit",
  "rec.delete": "Delete",
  "rec.when": "When",
  "rec.keywords": "Keywords",
  "rec.saved": "Saved ✓",
  "rec.deleted": "Resource deleted",
  "rec.empty": "No resources yet. Add one above.",
  "rec.hint":
    "The bot picks them by name. You need \"Allow media\" on in Settings and the Gallery module unlocked.",
  "rec.footer":
    "Resources can also be used in trigger steps and in follow-ups (Hunter), by referencing the resource name.",
  "rec.firstMessage": "Send on the customer's first message (campaigns)",
  "rec.firstMessageHint":
    "If checked, the bot sends this resource as soon as the customer writes for the first time (no AI decision). Great for people coming from a campaign.",
  "rec.badgeFirst": "1st message",

  // Settings · Control cards (control-levels.ts → renderCardGroup). Display-only
  // keys; `label`/`title`/`help`/`desc` stay as the ES source + match keys.
  "cl.tone.title": "Tone",
  "cl.tone.help": "How the bot talks to your customers.",
  "cl.tone.calido.label": "Warm",
  "cl.tone.calido.desc": "Friendly and warm, like a friend.",
  "cl.tone.formal.label": "Formal",
  "cl.tone.formal.desc": "Serious and professional, formal address.",
  "cl.tone.divertido.label": "Fun",
  "cl.tone.divertido.desc": "Relaxed and with a good sense of humor.",
  "cl.speed.title": "Response speed",
  "cl.speed.help": "How long the bot waits for the customer to finish typing.",
  "cl.speed.rapido.label": "Fast",
  "cl.speed.rapido.desc": "Replies almost instantly (5 seconds).",
  "cl.speed.normal.label": "Normal",
  "cl.speed.normal.desc": "Waits a bit in case they keep typing (15 seconds).",
  "cl.speed.pausado.label": "Relaxed",
  "cl.speed.pausado.desc": "Waits longer to gather the whole message (30 seconds).",
  "cl.style.title": "Message style",
  "cl.style.help": "How many bubbles it splits its reply into.",
  "cl.style.unico.label": "One message",
  "cl.style.unico.desc": "Everything in a single bubble.",
  "cl.style.pocos.label": "2-3 short",
  "cl.style.pocos.desc": "Splits the reply into a few bubbles.",
  "cl.style.varios.label": "Several short",
  "cl.style.varios.desc": "Many short bubbles, chat style.",
  "cl.model.title": "Bot brain",
  "cl.model.help": "Cheaper vs smarter.",
  "cl.model.economico.label": "Economical",
  "cl.model.economico.desc": "The cheapest, ideal for simple questions.",
  "cl.model.equilibrado.label": "Balanced",
  "cl.model.equilibrado.desc": "Picks on its own based on each message's difficulty.",
  "cl.model.maximo.label": "Maximum",
  "cl.model.maximo.desc": "The smartest, for complex conversations.",
  "cl.status.title": "Status",
  "cl.status.help": "Turn the bot on or off (e.g. on vacation).",
  "cl.status.activo.label": "Active",
  "cl.status.activo.desc": "The bot replies to your customers.",
  "cl.status.pausa.label": "Paused",
  "cl.status.pausa.desc": "The bot doesn't reply (useful on vacation).",

  // Settings · Web scraping (Decodo)
  "cfg.scrape.providerLabel": "Scraping provider",
  "cfg.scrape.help": "Who reads the business site. In “Auto” Decodo is the primary provider; if it fails, it tries a direct sitemap fetch (free) and finally AIsa.",
  "cfg.scrape.opt.auto": "Auto (Decodo first · recommended)",
  "cfg.scrape.opt.aisa": "AIsa (Firecrawl)",
  "cfg.scrape.opt.decodo": "Decodo",
  "cfg.scrape.aisaKeyLabel": "AIsa — API key (empty = uses the LLM one)",
  "cfg.scrape.phAisa": "sk-… (stored, never shown)",
  "cfg.scrape.aisaOk": "AIsa ready",
  "cfg.scrape.aisaOrigin": "(source: {src}, …{tail})",
  "cfg.scrape.aisaMissing": "No AIsa key: only Decodo / the direct attempt will be used.",
  "cfg.scrape.clear": "Clear (inherit the LLM one again)",

  // Settings · Web scraping: what each provider does (visual map)
  "scrape.prov.title": "Who reads the business site",
  "scrape.prov.help": "Two providers do the work, each in its own way. You pick the mode below; both charge per use.",
  "scrape.prov.now": "Working: {name}",
  "scrape.prov.inUse": "IN USE",
  "scrape.prov.keyOk": "key ready · …{tail} · {src}",
  "scrape.prov.keyMissing": "no key",
  "scrape.prov.mode.auto": "Automatic",
  "scrape.prov.chain": "Read order",
  "scrape.prov.chain.decodo": "1 · Decodo",
  "scrape.prov.chain.direct": "2 · Direct sitemap",
  "scrape.prov.chain.aisa": "3 · AIsa",
  "scrape.prov.decodo.name": "Decodo",
  "scrape.prov.decodo.tag": "Scraper API · opens the exact URL",
  "scrape.prov.decodo.what": "Opens one specific page (the listing or a car's detail page) and returns its real content: HTML with structured data, price, mileage and photo. It goes through proxies, so it also gets into sites that block the bot.",
  "scrape.prov.decodo.role.auto": "Role: first in “Auto” — it is the one that reads the car detail pages.",
  "scrape.prov.decodo.role.only": "Role: only provider. If it fails or runs out of quota, the run fails.",
  "scrape.prov.decodo.role.off": "Role: not used in “AIsa only” mode.",
  "scrape.prov.aisa.name": "AIsa · Firecrawl",
  "scrape.prov.aisa.tag": "Discovers links + converts to text",
  "scrape.prov.aisa.what": "First it crawls the site and builds the list of detail pages (map). Then it converts each page into clean Markdown: text, prices and photos.",
  "scrape.prov.aisa.role.auto": "Role: fallback in “Auto” — steps in if Decodo fails or has no quota.",
  "scrape.prov.aisa.role.only": "Role: only provider. Decodo is not used in this installation.",
  "scrape.prov.aisa.role.off": "Role: not used in “Decodo only” mode.",
  "scrape.prov.note.auto": "If the first one fails, the system moves to the next: it never stops reading the site.",
  "scrape.prov.note.aisa": "In “AIsa only” there is no fallback: if AIsa fails, the run fails.",
  "scrape.prov.note.decodo": "In “Decodo only” there is no fallback: if it fails or has no quota, the run fails.",
  "cfg.decodo.title": "Web scraping — keys and provider",
  "cfg.decodo.help":
    'This is how the bot reads your site (Web Sync / inventory). <b>Decodo</b>: get it from <span class="font-mono">decodo.com</span> → Scraper API (username and password, or the Basic value already in base64). <b>AIsa</b>: the same key as the AI gateway. Each one charges per use.',
  "cfg.decodo.configured": "Configured",
  "cfg.decodo.source": "· source: {src} · ends in …{tail}",
  "cfg.decodo.notConfigured":
    "Not configured — scraping stays off until you set it",
  "cfg.decodo.apiKeyLabel": "API key (username:password or base64)",
  "cfg.decodo.phKeep": "empty = keep the current one",
  "cfg.decodo.phUserPass": "username:password",
  "cfg.decodo.useWorker": "Use the worker's",
  "cfg.decodo.clear": "Remove the saved one",
  "cfg.decodo.viewLog": "View scraping log",
  "cfg.decodo.viewLogHint":
    "what came in, went out or changed on each run (new, sold, prices).",

  // Settings · AI model
  "cfg.llm.title": "🧠 AI model",
  "cfg.llm.help":
    "Choose which AI your bot uses. You can use your own API key so you pay for usage directly. If you leave it on automatic, the bot uses the included configuration (fast for the simple stuff, smart for the hard stuff).",
  "cfg.llm.testOk": "✓ Connection successful — replied {model}",
  "cfg.llm.testErr": "✕ Test failed: {msg}",
  "cfg.llm.provider": "Provider",
  "cfg.llm.model": "Model",
  "cfg.llm.providerAuto": "Automatic (recommended)",
  "cfg.llm.providerSameBot": "Same as the bot (recommended)",
  "cfg.llm.optClaude": "Claude (Anthropic)",
  "cfg.llm.optOpenai": "ChatGPT (OpenAI)",
  "cfg.llm.optAisa": "AIsa (gateway)",
  "cfg.llm.optXai": "Grok (xAI)",
  "cfg.llm.optMinimax": "MiniMax",
  "cfg.llm.optGoogle": "Google (Gemini)",
  "cfg.llm.modelAuto": "Automatic (fast ⇄ smart)",
  "cfg.llm.baseUrlLabel": "Gateway base URL (only if you use AIsa/OpenRouter)",
  "cfg.llm.baseUrlHelp":
    "Empty = direct OpenAI or the deploy config. For AIsa: https://api.aisa.one/v1 — change it here without redeploying.",
  "cfg.llm.keyLabel": "Your API key (optional)",
  "cfg.llm.keyHelpSaved":
    "There's a saved key (ends in …{tail}). Type a new one to replace it, or check the box to remove it.",
  "cfg.llm.keyHelpEmpty":
    "Paste it here so usage is charged to your account. Empty = use the system's included key.",
  "cfg.llm.phKey": "sk-ant-… or sk-…",
  "cfg.llm.phMask": "••••••••••••",
  "cfg.llm.clearKey": "Remove my API key and go back to the system's",
  "cfg.llm.testLink": "⚡ Test my configuration (saves first)",

  // Settings · Time zone
  "cfg.tz.title": "🕐 Business time zone",
  "cfg.tz.help":
    'The time and date your bot uses to understand "today", "tomorrow" or "Friday", and to schedule appointments. Set the zone where the business operates, not yours: if they don\'t match, appointments get scheduled at the wrong time.',
  "cfg.tz.label": "Time zone",
  "cfg.tz.default": "Default ({tz})",

  // Settings · Analysis model (scraping)
  "cfg.analysis.title": "🧪 Analysis model (scraping)",
  "cfg.analysis.help":
    "The inventory scraped from your site is reviewed with a model to fix badly parsed titles, prices and mileage. Leave everything empty to use the bot's same configuration, or pick a different model here — for example Claude Opus for the analysis and a cheap model for chatting.",
  "cfg.analysis.sameBot": "Same as the bot",
  "cfg.analysis.baseUrlLabel": "Gateway base URL (optional)",
  "cfg.analysis.baseUrlHelp": "Empty = the bot's. For AIsa: https://api.aisa.one/v1",
  "cfg.analysis.keyLabel": "Analysis API key (optional)",
  "cfg.analysis.keyHelpSaved":
    "There's a saved key (ends in …{tail}). Type a new one to replace it.",
  "cfg.analysis.keyHelpEmpty":
    "Empty = use the bot's same API. If you pick ANOTHER provider above, paste its key here: the bot's key won't work for another provider.",
  "cfg.analysis.clearKey": "Remove this API key and go back to the bot's",

  // ── Connections (conexiones.ts) ────────────────────────────────────────────
  "cx.title": "Connections",
  "cx.heading": "Connected channels: {connected} of {total}",
  "cx.subtitle":
    'Connect the channels where your customers are. When a channel is ready, its card turns green. Zernio is connected by pasting its API key right here; the other channels are configured with <span class="font-mono">wrangler secret put NAME</span>.',
  "cx.connected": "● CONNECTED",
  "cx.disconnected": "○ NOT CONNECTED",
  "cx.missing": "Missing setup:",
  "cx.copy": "copy",
  "cx.copied": "copied ✓",
  "cx.pause": "⏸ Pause channel",
  "cx.resume": "▶ Resume channel",
  "cx.pausedNote": "This channel is paused: messages are ignored.",
  "cx.clear": "Remove connection",
  "cx.update": "Update connection",
  "cx.webhookUrl": "Webhook URL:",

  // Connections · channel names with translatable text
  "cx.name.wacloud": "WhatsApp (Official · Cloud API)",
  "cx.name.zernio": "Zernio (multichannel)",
  "cx.name.webchat": "Website (own chat)",

  // Connections · per-channel description and guide
  "cx.telegram.desc": "Telegram bot — free and the quickest to connect.",
  "cx.telegram.howTo":
    "Create the bot with @BotFather and paste the token below: it validates it and registers the webhook automatically. Optional: your chat id for owner notifications.",
  "cx.twilio.desc": "WhatsApp Business via Twilio — the channel that sells the most.",
  "cx.twilio.howTo":
    "In Twilio: approved WhatsApp number → point the incoming-message webhook to the URL below.",
  "cx.twilio.security":
    "Without TWILIO_HANDOFF_CONTENT_SID: the WhatsApp handoff notice requires an approved template (HSM).",
  "cx.wacloud.desc": "WhatsApp directly with Meta, no middleman — better margin.",
  "cx.wacloud.howTo":
    "Meta app → WhatsApp → Configuration: point the webhook to the URL below, subscribe the messages field, and save your Phone Number ID and token. Try it with the free test number.",
  "cx.meta.desc": "Instagram and Messenger DMs with Meta's official API.",
  "cx.meta.howTo":
    "Meta app → Webhooks → subscribe messages with your VERIFY_TOKEN; the signature is validated automatically.",
  "cx.manychat.desc": "If you already use ManyChat, the bot can live behind your flows.",
  "cx.manychat.howTo": "In ManyChat: External Request to the URL below.",
  "cx.zernio.desc":
    "All your networks with one api key: Instagram, Facebook/Messenger, X, Telegram, WhatsApp, Bluesky, Reddit… Connect YOUR personal account (not the bot) — the AI answers your DMs and they land in the panel.",
  "cx.zernio.howTo":
    "zernio.com → copy your API key and paste it here. The channel becomes connected and its webhook is registered automatically (message.received + comment.received); the webhook secret is optional to validate the signature.",
  "cx.zernio.security":
    "Without ZERNIO_WEBHOOK_SECRET the webhook accepts everything (fail-open). Recommended: set it to validate the signature.",
  "cx.ml.desc":
    "The AI answers questions on your listings and post-sale messages with the buyer. It needs its own app (free) in your seller account.",
  "cx.ml.howTo":
    "1) developers.mercadolibre.com → Create application (with your seller account, needs 2FA). 2) In 'Redirect URI' paste the OAuth URL below. 3) In 'Notifications (callbacks)' paste the webhook URL below and enable the 'questions' and 'messages' topics. 4) Check the read, write and offline_access permissions. 5) Copy the App ID and Secret Key, pick your country and save them here. Then tap 'Authorize with MercadoLibre'.",
  "cx.waha.desc":
    "Your own WhatsApp by QR, without Meta or Twilio — it runs on a WAHA server (Docker) that you control.",
  "cx.waha.howTo":
    "Paste your WAHA server URL and its API key (X-Api-Key). The bot creates/starts the session and registers the webhook on its own — then you scan the QR right here with your WhatsApp.",
  "cx.waha.security":
    "Without a webhook token: the webhook accepts any request (fail-open). It's generated automatically when you save the connection.",
  "cx.webchat.desc":
    "The chat on your own page. No tokens or verification — the easiest of all.",
  "cx.webchat.howTo":
    'Paste this line into your site, before </body>: <script src="<your-worker>/chat.js" async></script> — you get a chat bubble that your bot answers.',

  // Connections · missing pieces (translatable labels)
  "cx.ml.missingAuth": "seller authorization",
  "cx.waha.missingUrl": "WAHA server URL",
  "cx.waha.missingKey": "WAHA API key",

  // Connections · Zernio form
  "cx.zernio.apiKeyLabel": "Zernio API key",
  "cx.zernio.phKeySaved": "there's a saved key (…{tail})",
  "cx.zernio.phKey": "Paste your API key from zernio.com",
  "cx.zernio.secretLabel": "Webhook secret (recommended)",
  "cx.phSecretSaved": "saved secret — type to replace",
  "cx.zernio.phSecret": "optional: HMAC signature of the webhooks",
  "cx.zernio.connect": "Connect Zernio",

  // Connections · Telegram form
  "cx.telegram.tokenLabel": "Bot token (BotFather)",
  "cx.telegram.phTokenSaved": "saved token — type to replace",
  "cx.telegram.phToken": "Paste the token from @BotFather",
  "cx.telegram.chatLabel": "Your Telegram chat id (owner notifications)",
  "cx.telegram.phChatSaved": "there's a saved id (…{tail}) — type to replace",
  "cx.telegram.phChat":
    "optional: send /start to your bot and check your id with @userinfobot",
  "cx.telegram.connect": "Connect Telegram",
  "cx.telegram.clearOwner": "Remove notice",

  // Connections · MercadoLibre form
  "cx.ml.redirectHint": "Redirect URI (OAuth) — paste it in your MercadoLibre app:",
  "cx.ml.country": "Your account country",
  "cx.ml.appId": "App ID (client_id)",
  "cx.ml.phAppIdSaved": "there's a saved App ID — type to replace",
  "cx.ml.phAppId": "your app number on developers.mercadolibre.com",
  "cx.ml.secret": "Secret Key (client_secret)",
  "cx.ml.phSecret": "Your app's Secret Key",
  "cx.ml.save": "Save details",
  "cx.ml.reauth": "Authorize again",
  "cx.ml.authorize": "Authorize with MercadoLibre",
  "cx.ml.authorized": "Seller authorized",

  // Connections · WAHA form
  "cx.waha.urlLabel": "WAHA server URL",
  "cx.waha.phUrlSaved": "there's a saved URL ({url}) — type to replace",
  "cx.waha.phUrl": "http://your-waha-server:3000",
  "cx.waha.keyLabel": "API key (X-Api-Key)",
  "cx.phKeySaved": "there's a saved key (…{tail})",
  "cx.waha.phKey": "your WAHA server API key",
  "cx.waha.session": "Session",
  "cx.waha.connect": "Connect WAHA",
  "cx.waha.restart": "Restart session and generate QR",
  "cx.waha.statusLine": " (status: {status})",
  "cx.waha.statusUnknown": " (couldn't check WAHA's status)",
  "cx.waha.qrWarn":
    "⚠ Still needs pairing: scan this QR with WhatsApp (Linked devices → Link a device).",
  "cx.waha.qrAlt": "WhatsApp QR (WAHA)",
  "cx.waha.qrError":
    "Couldn't load the QR image. Restart the session and try again.",
  "cx.waha.qrHint":
    "The QR refreshes on its own every 20 sec (WhatsApp rotates it): scan it as soon as it appears.",
  "cx.waha.working": "✓ WhatsApp paired and active",
  "cx.waha.sessionSuffix": " (session {session})",
  "cx.waha.closed": "⚠ The WAHA session is closed",
  "cx.waha.relinkHint":
    ": you need to link WhatsApp again. Restart the session and scan the new QR.",
  "cx.waha.unreachable": "⚠ Couldn't read the session status on WAHA",
  "cx.waha.unreachableHint":
    ". Check that the server is on and that the URL and API key are correct.",

  // Connections · Zernio accounts
  "cx.za.title": "ACCOUNTS CONNECTED IN ZERNIO",
  "cx.za.reconnect": "· reconnect",
  "cx.za.inactive": "· inactive",
  "cx.za.active": "· active",
  "cx.za.followers": "· {n} followers",
  "cx.za.dmThisHour": "DMs this hour",
  "cx.za.empty":
    "Couldn't list your Zernio accounts (or there are no connected accounts yet). Connect them on zernio.com.",

  // Connections · save banners
  "cx.saved.telegram":
    "✓ Telegram connected: webhook registered automatically. Send your bot a message to try it.",
  "cx.saved.zernio":
    "✓ Zernio connected: webhook registered automatically (message.received + comment.received). Comments/DMs should flow now.",
  "cx.saved.mercadolibre":
    "✓ MercadoLibre: details saved. If you've already authorized the seller, the AI will answer questions and post-sale messages. You still need to enable the 'questions' and 'messages' topics in your app's notifications.",
  "cx.saved.waha":
    "✓ WAHA connected: session created/updated and webhook registered. If it asks for a QR, scan it from the WAHA card below.",
  "cx.saved.vapi":
    "✓ Vapi saved. Paste the Server URL above into the Vapi dashboard (Assistant → Server URL).",
  "cx.saved.retell":
    "✓ Retell saved. Paste the Webhook URL above into the Retell dashboard.",
  "cx.saved.voz": "✓ Voice collections parameters saved.",

  // Connections · voice collections (Vapi / Retell)
  "cx.voice.title": "Voice collections: Vapi / Retell",
  "cx.voice.help":
    "AI calls for the collections portfolio. Pick the active provider and paste its details; each platform's webhook is ready to paste into its dashboard.",
  "cx.vReady": "READY",
  "cx.vMissing": "MISSING",
  "cx.vapi.title": "Vapi (voice)",
  "cx.vapi.help":
    "Voice agent to call the portfolio's debtors. Create it on dashboard.vapi.ai, paste its details here and its Server URL below.",
  "cx.vapi.keyPh": "sk_live_… (empty = keep)",
  "cx.vapi.assistantHint": "The assistant that answers the call",
  "cx.vapi.phoneHint": "Phone Numbers → id of the outbound number",
  "cx.vapi.secretPh": "(Server URL secret, optional)",
  "cx.vapi.secretHint": "Received in the X-Vapi-Secret header to validate the webhook",
  "cx.vapi.useActive": "Use Vapi as the active collections provider",
  "cx.vapi.save": "Save Vapi",
  "cx.retell.title": "Retell (voice)",
  "cx.retell.help":
    "An alternative to Vapi for collections calls. Create the agent on dashboard.retellai.com and paste its details here.",
  "cx.retell.keyPh": "key_… (empty = keep)",
  "cx.retell.agentHint": "The agent that answers the call",
  "cx.retell.phoneLabel": "Outbound number",
  "cx.retell.phoneHint":
    "Number bought in Retell (E.164). Optional if the agent already includes it.",
  "cx.retell.secretPh": "(webhook secret, optional)",
  "cx.retell.secretHint": "Used to verify Retell's webhooks",
  "cx.retell.useActive": "Use Retell as the active collections provider",
  "cx.retell.save": "Save Retell",
  "cx.voz.title": "Collections portfolio — parameters",
  "cx.voz.objectiveLabel": "Objective / script tone",
  "cx.voz.objectivePh":
    "e.g. remind them of the balance, offer a payment plan, firm but respectful tone",
  "cx.voz.objectiveHint": "Context the voice agent uses during the call",
  "cx.voz.attemptsLabel": "Max attempts per debtor",
  "cx.voz.save": "Save parameters",

  // ── Extras / Skills (extras.ts) ────────────────────────────────────────────
  "extras.title": "Extras",
  "extras.saved": "Saved ✓",
  "extras.reportOk": "✓ Report sent via: {channels}",
  "extras.actua.bot": "Acts on the bot",
  "extras.actua.panel": "Acts on the panel",
  "extras.actua.both": "Acts on bot and panel",
  "extras.locked": "🔒 LOCKED",
  "extras.active": "● ACTIVE",
  "extras.inactive": "○ OFF",
  "extras.on": "On",
  "extras.off": "Off",
  "extras.requiresLicense": "Requires a license →",
  "extras.license": "License",
  "extras.report.channelLabel": "Where should I send it to you?",
  "extras.report.email": "Email",
  "extras.report.both": "Telegram + email",
  "extras.report.testBtn": "📨 Send a test now",
  "extras.singlePayment": "ONE-TIME",
  "extras.membership": "MEMBERSHIP",
  "extras.included.title": "Skills — included",
  "extras.included.help":
    "Your bot does this from day one, at no extra cost. There's nothing to turn on.",
  "extras.paid.title": "Superpowers — paid features",
  "extras.paid.help":
    "Turn each superpower on or off with its switch. The locked ones (🔒) need a license that includes them — check the License tab. Changes are saved when you press the button below.",
  "extras.save": "Save changes",

  // ── License (licencia.ts) ──────────────────────────────────────────────────
  "lic.title": "License",
  "lic.heading": "License",
  "lic.subtitle":
    "All features come enabled on the free plan. Pro only removes the quantity limits. It's validated locally (no servers).",
  "lic.forever": "lifetime",
  "lic.monthlyExpiresToday": "monthly · expires today ({date})",
  "lic.monthlyExpiresInDays": "monthly · expires in {n} {days} ({date})",
  "lic.day": "day",
  "lic.days": "days",
  "lic.grace": "expired on {date} · grace period ({n} {days})",
  "lic.expired": "expired on {date}",
  "lic.badge.grace": "⚠ LICENSE EXPIRED — GRACE",
  "lic.badge.pro": "● PRO ACTIVE",
  "lic.badge.free": "○ FREE PLAN",
  "lic.badge.unlimited": "● EVERYTHING UNLOCKED",
  "lic.unlimited.state": "license-free installation",
  "lic.unlimited.help":
    "This installation is outside the licensing scheme: every feature is unlocked and there are no usage limits (contacts, messages, channels, rules). No code needed.",
  "lic.grace.help":
    "Pro stays active for now. Ask your provider for the new code and paste it below, or the bot will fall back to the free plan with its limits.",
  "lic.pro.help":
    'All features active and <b class="text-cream">no usage limits</b>: contacts, messages/month, channels, automations and tracked links.{soon}',
  "lic.pro.soon":
    ' <b class="text-cream">Your code expires soon</b> — ask your provider for the new one.',
  "lic.expired.help":
    "Your license expired. Paste a new code to go back to Pro.",
  "lic.free.help":
    '<b class="text-cream">All features are active</b> — just like Pro. The free plan only has quantity limits (below); Pro removes them.',
  "lic.overlay.badge": "SYNCED WITH THE PANEL",
  "lic.overlay.info": "plan {plan} · {state} · {modules} modules",
  "lic.overlay.lastSync":
    "Last sync: {date}. The super admin controls plan, modules, limits and branding; it applies on the next sync.",
  "lic.overlay.none": "This bot hasn't synced with the panel yet. If you were assigned Pro, tap Sync now.",
  "lic.overlay.sync": "Sync now",
  "lic.code.active": "Your active code",
  "lic.code.activate": "Activate Pro with a code",
  "lic.code.replace": "Replace code",
  "lic.code.activateBtn": "Activate Pro",
  "lic.code.remove": "Remove license",
  "lic.limits.title": "Free plan limits",
  "lic.limits.help":
    "No feature is locked — these are the only caps. Pro removes them all.",
  "lic.limit.contacts": "Unique contacts",
  "lic.limit.messages": "AI messages / month",
  "lic.limit.channels": "Connected channels",
  "lic.limit.rules": "Automation rules",
  "lic.limit.autoDms": "Automated replies / month",
  "lic.limit.links": "Tracked links",
  "lic.limit.zernio": "Zernio accounts",
  "lic.limit.logs": "Log history",
  "lic.limit.logsValue": "{n} days",

  // ── Team (equipo.ts) ───────────────────────────────────────────────────────
  "eq.title": "Team",
  "eq.heading": "Team",
  "eq.subtitle":
    'Hand the panel to your people without giving them your password. Add their email and their role; each one signs in with their own access. You keep signing in the same way (admin + your password) and see who did what in <b class="text-cream">Audit log</b>.',
  "eq.empty":
    "You don't have any collaborators yet. Your access (admin + password) keeps working the same.",
  "eq.role.owner": "Administrator — sees everything",
  "eq.role.staff": "Team — operates only",
  "eq.remove": "Remove",
  "eq.emailLabel": "Email",
  "eq.emailPh": "carlos@example.com",
  "eq.roleLabel": "Role",
  "eq.roleOpt.staff": "Team (operates only)",
  "eq.roleOpt.owner": "Administrator (sees everything)",
  "eq.add": "Add",
  "eq.members": "Collaborators",

  // ── Commands (comandos.ts) ─────────────────────────────────────────────────
  "cmd.title": "Commands",
  "cmd.heading": "Commands",
  "cmd.subtitle":
    'The full cheat sheet. The terminal ones run directly; the ones starting with <span class="font-mono">/</span> are prompts — copy them and paste them into your agent (Claude Code / Codex) in the bot folder.',
  "cmd.terminal.title": "Terminal · CLI",
  "cmd.agent.title": "Agent · prompts",
  "cmd.copy": "Copy",
  "cmd.copied": "✓ Copied",
  "cmd.terminal.init": "Installs: downloads the template, configures the bot and deploys.",
  "cmd.terminal.list": "Lists the available industries (niches).",
  "cmd.terminal.install": "Installs the bot for one industry (e.g. restaurant).",
  "cmd.terminal.login": "Connects the CLI to your Kooni account (opens the browser).",
  "cmd.terminal.whoami": "Shows which account you're connected with.",
  "cmd.terminal.pair": "Links an already deployed bot to your account.",
  "cmd.terminal.update": "Updates your bot without losing your config or your data.",
  "cmd.terminal.deploy": "Provisions Cloudflare and publishes the worker.",
  "cmd.terminal.doctor": "Diagnostics for the installed bot.",
  "cmd.terminal.version": "CLI version.",
  "cmd.agent.setup": "Complete initial setup (business, channels, deploy).",
  "cmd.agent.report": "Value report of what your bot did.",
  "cmd.agent.export": "Exports your data (leads, conversations).",
  "cmd.agent.update": "Updates the bot to the latest version.",
  "cmd.agent.prompt": "View and edit your prompt section by section (entry point).",
  "cmd.agent.cleanPrompt":
    "Slims down a long prompt: moves data to the KB and removes duplicates.",
  "cmd.agent.versionPrompt":
    "Prompt history: save versions and restore any of them.",
  "cmd.agent.labPrompt": "Prompt A/B: variants + simulated conversations.",
  "cmd.agent.perChannel": "One personality per channel (WhatsApp, Instagram…).",
  "cmd.agent.audit": "Scores your prompt against best practices.",
  "cmd.agent.examples": "Turns your best chats into examples (few-shot).",

  // ── Automations (automatizaciones.ts) ──────────────────────────────────────
  "auto.title": "Automations",
  "auto.heading": "Automations",
  "auto.subtitle":
    "Keyword → reply rules for comments and DMs. When a rule matches, it wins (the AI doesn't step in). They apply to Instagram, Facebook and more via Zernio.",
  "auto.saved": "✓ Saved",
  "auto.loadError": "Couldn't load the rules: {msg}",
  "auto.kind.commentDm": "Comment → private DM",
  "auto.kind.commentDmDesc":
    "Someone comments a keyword on your post → you send them a private DM (+ button) and optionally reply to their comment publicly.",
  "auto.kind.commentDmPublic": "Comment → public reply + DM",
  "auto.kind.commentDmPublicDesc":
    "Someone comments a keyword → you reply to their comment publicly AND send them a private DM. Perfect for promoting and capturing leads at once.",
  "auto.kind.commentReply": "Comment → public reply",
  "auto.kind.commentReplyDesc":
    "Someone comments a keyword → you reply to their comment publicly (visible to everyone). No private DM.",
  "auto.kind.dmReply": "DM → automatic reply",
  "auto.kind.dmReplyDesc":
    "Someone sends you a keyword privately → you reply right away, without going through the AI.",
  "auto.platform.all": "All platforms",
  "auto.edit": "✏️ Edit",
  "auto.pause": "⏸ Pause",
  "auto.activate": "▶ Activate",
  "auto.delete": "🗑 Delete",
  "auto.keywords": "keywords:",
  "auto.clicks.one": "👆 {n} click on this rule's links",
  "auto.clicks.many": "👆 {n} clicks on this rule's links",
  "auto.replyPublic": "↩ Public reply:",
  "auto.followGate":
    "🔒 Follow gate: requires a follow before handing over the link",
  "auto.fallbackAi.title":
    "✨ Reply to comments with no automation using AI",
  "auto.fallbackAi.help":
    "The bot generates the public reply with your model (in the comment's language). It <b>takes priority</b> over the fixed text below. <b>Never DMs.</b> With a daily safety cap.",
  "auto.fallbackAi.ph":
    "Instructions for the AI (optional). E.g. reply in a friendly tone and offer to write privately.",
  "auto.fallbackFixed.title": "Reply publicly with fixed text",
  "auto.fallbackFixed.help":
    "If the AI above is off, a comment with no rule gets this public reply. <b>Never DMs.</b> Turn it off and those comments are ignored.",
  "auto.fallbackFixed.ph": "Thanks for your comment! 🙌 We're reading.",
  "auto.followGate.notFollowing": "Follow gate: message when they don't follow yet",
  "auto.followGate.notFollowingPh":
    "I still don't see you as a follower 🙏 Follow me and tap the button again to get the link 👇",
  "auto.followGate.notFollowingHelp":
    "Sent to whoever tapped “I follow you now” but verification says they still don't follow you (or it couldn't be checked). Empty = the rule's follow message is used. The confirm button is added automatically.",
  "auto.missingPublic":
    "The public reply is missing: this type replies publicly + DMs, but without that text only the DM is sent. Edit the rule and write it.",
  "auto.empty":
    "There are no automations yet. Create the first one with the form below.",
  "auto.editTitle": "✏️ Edit automation",
  "auto.newTitle": "New automation",
  "auto.templateLabel": "Or start from a template",
  "auto.clear": "✕ Clear",
  "auto.templateHint":
    "Tap a template and the form fills itself in; adjust keywords and messages to your business.",
  "auto.form.kind": "Flow type",
  "auto.form.platform": "Platform",
  "auto.form.keywords": "Keywords (comma-separated)",
  "auto.form.keywordsPh": "price, how much is it, quote",
  "auto.form.message": "DM message / reply",
  "auto.form.messagePh":
    "Hi {username}! 👋 Thanks for your interest. Here's the catalog:",
  "auto.form.usernameHint":
    'You can use <span class="font-mono">{"{username}"}</span> to greet the customer by name.',
  "auto.form.wholeWord":
    'The keyword must be a whole word (recommended). Uncheck it to also match inside other words (e.g. "link" matches "linking").',
  "auto.form.requireFollow":
    "Follow gate: require the customer to follow the account before handing over the link (it grows your account).",
  "auto.form.followPrompt": "Message to ask for the follow (optional)",
  "auto.form.followPromptPh":
    "Hi {username}! Follow me and tap the button to get the link 👇",
  "auto.form.followButton": "Confirmation button text (optional)",
  "auto.form.followButtonPh": "I'm following now",
  "auto.form.buttonLabel": "Button text (optional)",
  "auto.form.buttonLabelPh": "See catalog",
  "auto.form.buttonUrl": "Button link (optional)",
  "auto.form.buttonUrlPh": "https://yoursite.com/catalog",
  "auto.form.replyComment": "Fixed public reply (optional)",
  "auto.form.replyCommentPh": "Thanks for asking! I sent you a private message ✨",
  "auto.form.aiReply": "AI public reply (optional, replaces the fixed one)",
  "auto.form.aiReplyPh":
    "E.g. Reply briefly and warmly, in my tone, thanking them for the comment and inviting them to write privately. Two sentences max.",
  "auto.form.aiReplyHint":
    "The AI generates the public reply using the bot's key/configuration, in your tone. If it fails, it uses the fixed reply above (if there is one).",
  "auto.form.save": "💾 Save changes",
  "auto.form.create": "+ Create automation",
  "auto.form.cancel": "Cancel",
  "auto.form.immediate": "The rule is active immediately.",
  "auto.logs.title": "Send history",
  "auto.logs.help":
    'Every DM or public-reply attempt: who, what, status and reason. <span class="font-mono">sent</span> = sent · <span class="font-mono">skipped</span> = skipped (dedup/rule) · <span class="font-mono">failed</span> = failed.',
  "auto.logs.empty": "No sends logged yet.",
  "auto.logKind.commentDm": "comment→DM",
  "auto.logKind.commentReply": "comment→public",
  "auto.logKind.commentDmPublic": "comment→DM+public",
  "auto.logKind.dmReply": "DM→reply",
};
