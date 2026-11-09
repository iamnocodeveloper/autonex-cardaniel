// "Conexiones" tab — el mapa de canales del bot. Cada canal es una card con
// estado VERDE (conectado) o gris (sin conectar), qué falta exactamente para
// conectarlo, y su webhook URL lista para copiar. Es la vista que guía el
// paso 4 del onboarding (CLAUDE.md): conectar canales uno por uno y verlos
// ponerse verdes.
import type { Env } from "../../env";
import { layout } from "./layout";
import { makeT, panelI18n, type T } from "../i18n";
import type { ZernioAccount } from "../../channels/zernioAccounts";
import { zernioPlatformIcon, zernioPlatformLabel } from "../../channels/zernioAccounts";
import type { ZernioCredentials } from "../../channels/zernioCredentials";
import { mlConnected, ML_SITES, type MlCredentials } from "../../channels/mercadolibreCredentials";
import type { WahaConfig } from "../../channels/wahaCredentials";
import type { WahaSessionInfo } from "../../channels/wahaApi";
import { vapiConfigured, retellConfigured, type VoiceConfig } from "../../integrations/voiceProviders";
import { getNiche } from "../../niches";
import { isModuleUnlocked } from "../../modules";

interface ChannelStatus {
  id: string;
  name: string;
  icon: string; // lucide icon name
  desc: string;
  ok: boolean;
  /** Piezas faltantes (nombre de secret/var) cuando NO está conectado. */
  missing: string[];
  /** Ruta del webhook a registrar en el proveedor (si aplica). */
  webhookPath?: string;
  /** Nota de seguridad opcional (ej. secret del webhook sin configurar). */
  securityNote?: string;
  /** Cómo conectar, en 1-2 líneas. */
  howTo: string;
}

function channelStatuses(
  env: Env,
  zernioCreds: ZernioCredentials,
  t: T,
  telegramToken?: string,
  mlCreds?: MlCredentials,
  wahaCfg?: WahaConfig,
  showWaha?: boolean,
): ChannelStatus[] {
  const has = (v?: string) => Boolean(v && v.trim() !== "");

  const telegramMissing = [!has(telegramToken) && "TELEGRAM_BOT_TOKEN"].filter(
    Boolean,
  ) as string[];
  const twilioMissing = [
    !has(env.TWILIO_ACCOUNT_SID) && "TWILIO_ACCOUNT_SID",
    !has(env.TWILIO_AUTH_TOKEN) && "TWILIO_AUTH_TOKEN",
    !has(env.TWILIO_WA_FROM) && "TWILIO_WA_FROM",
  ].filter(Boolean) as string[];
  const metaMissing = [
    !has(env.META_PAGE_ACCESS_TOKEN) && "META_PAGE_ACCESS_TOKEN",
    !has(env.META_VERIFY_TOKEN) && "META_VERIFY_TOKEN",
    !has(env.META_APP_SECRET) && "META_APP_SECRET",
  ].filter(Boolean) as string[];
  const manychatMissing = [!has(env.MANYCHAT_API_KEY) && "MANYCHAT_API_KEY"].filter(
    Boolean,
  ) as string[];
  // La API key es lo único que conecta Zernio de verdad. El webhook secret es
  // opcional (valida la firma), pero NO bloquea la conexión.
  const zernioMissing = [!has(zernioCreds.apiKey) && "ZERNIO_API_KEY"].filter(
    Boolean,
  ) as string[];
  // MercadoLibre: la app (App ID + Secret) más la autorización del vendedor
  // (tokens). El país tiene default, no bloquea.
  const ml = mlCreds ?? { site: "MLA", expiresAt: 0 } as MlCredentials;
  const mlMissing = [
    !has(ml.clientId) && "App ID",
    !has(ml.clientSecret) && "Secret Key",
    has(ml.clientId) && has(ml.clientSecret) && !mlConnected(ml) && t("cx.ml.missingAuth"),
  ].filter(Boolean) as string[];
  const whatsappCloudMissing = [
    !has(env.WHATSAPP_PHONE_NUMBER_ID) && "WHATSAPP_PHONE_NUMBER_ID",
    !has(env.WHATSAPP_ACCESS_TOKEN) && "WHATSAPP_ACCESS_TOKEN",
    !has(env.WHATSAPP_VERIFY_TOKEN || env.META_VERIFY_TOKEN) && "WHATSAPP_VERIFY_TOKEN",
    !has(env.WHATSAPP_APP_SECRET || env.META_APP_SECRET) && "WHATSAPP_APP_SECRET",
  ].filter(Boolean) as string[];
  const waha = wahaCfg ?? { base: "", session: "default" };
  const wahaMissing = [
    !has(waha.base) && t("cx.waha.missingUrl"),
    !has(waha.apiKey) && t("cx.waha.missingKey"),
  ].filter(Boolean) as string[];

  const channels: ChannelStatus[] = [
    {
      id: "telegram",
      name: "Telegram",
      icon: "send",
      desc: t("cx.telegram.desc"),
      ok: telegramMissing.length === 0,
      missing: telegramMissing,
      webhookPath: "/webhooks/telegram",
      howTo: t("cx.telegram.howTo"),
    },
    {
      id: "whatsapp",
      name: "WhatsApp (Twilio)",
      icon: "phone",
      desc: t("cx.twilio.desc"),
      ok: twilioMissing.length === 0,
      missing: twilioMissing,
      webhookPath: "/webhooks/twilio",
      securityNote:
        twilioMissing.length === 0 && !has(env.TWILIO_HANDOFF_CONTENT_SID)
          ? t("cx.twilio.security")
          : undefined,
      howTo: t("cx.twilio.howTo"),
    },
    {
      id: "whatsapp-cloud",
      name: t("cx.name.wacloud"),
      icon: "message-circle",
      desc: t("cx.wacloud.desc"),
      ok: whatsappCloudMissing.length === 0,
      missing: whatsappCloudMissing,
      webhookPath: "/webhooks/whatsapp",
      howTo: t("cx.wacloud.howTo"),
    },
    {
      id: "meta",
      name: "Instagram + Messenger (Meta)",
      icon: "instagram",
      desc: t("cx.meta.desc"),
      ok: metaMissing.length === 0,
      missing: metaMissing,
      webhookPath: "/webhooks/meta",
      howTo: t("cx.meta.howTo"),
    },
    {
      id: "manychat",
      name: "ManyChat",
      icon: "bot",
      desc: t("cx.manychat.desc"),
      ok: manychatMissing.length === 0,
      missing: manychatMissing,
      webhookPath: "/webhooks/manychat",
      howTo: t("cx.manychat.howTo"),
    },
    {
      id: "zernio",
      name: t("cx.name.zernio"),
      icon: "globe",
      desc: t("cx.zernio.desc"),
      ok: zernioMissing.length === 0,
      missing: zernioMissing,
      webhookPath: "/webhooks/zernio",
      securityNote:
        !has(zernioCreds.webhookSecret)
          ? t("cx.zernio.security")
          : undefined,
      howTo: t("cx.zernio.howTo"),
    },
    {
      id: "mercadolibre",
      name: "MercadoLibre",
      icon: "shopping-bag",
      desc: t("cx.ml.desc"),
      ok: mlMissing.length === 0,
      missing: mlMissing,
      webhookPath: "/webhooks/mercadolibre",
      howTo: t("cx.ml.howTo"),
    },
    {
      id: "waha",
      name: "WhatsApp (WAHA · self-hosted)",
      icon: "qr-code",
      desc: t("cx.waha.desc"),
      ok: wahaMissing.length === 0,
      missing: wahaMissing,
      webhookPath: "/webhooks/waha",
      securityNote:
        wahaMissing.length === 0 && !waha.webhookToken
          ? t("cx.waha.security")
          : undefined,
      howTo: t("cx.waha.howTo"),
    },
    {
      id: "webchat",
      name: t("cx.name.webchat"),
      icon: "globe",
      desc: t("cx.webchat.desc"),
      ok: true,
      missing: [],
      webhookPath: "/webhooks/webchat",
      howTo: t("cx.webchat.howTo"),
    },
  ];
  // WAHA NO es parte de las instalaciones normales: la card se muestra si ESA
  // instalación lo configuró (WAHA_API_URL) O si el módulo de canal está
  // desbloqueado por el super admin — así el dueño puede cargar los datos.
  const wahaVisible = showWaha ?? has(waha.base);
  return channels.filter((ch) => ch.id !== "waha" || wahaVisible);
}

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!),
  );
}

export async function renderConexiones(
  env: Env,
  pausedChannels: string[] = [],
  zernioAccounts: ZernioAccount[] = [],
  rateUsage: Record<string, { used: number; windowStart: number }> = {},
  opts: {
    zernioCreds?: ZernioCredentials;
    telegramToken?: string;
    ownerChatId?: string;
    mlCreds?: MlCredentials;
    wahaCfg?: WahaConfig;
    wahaStatus?: WahaSessionInfo | null;
    voiceCfg?: VoiceConfig;
    baseUrl?: string;
    savedKind?: "telegram" | "zernio" | "mercadolibre" | "waha" | "vapi" | "retell" | "voz";
    error?: string;
  } = {},
): Promise<string> {
  const { t } = await panelI18n(env);
  const zernioCreds = opts.zernioCreds ?? {
    apiKey: env.ZERNIO_API_KEY,
    webhookSecret: env.ZERNIO_WEBHOOK_SECRET,
  };
  const telegramToken = opts.telegramToken ?? env.TELEGRAM_BOT_TOKEN;
  const ownerChatId = opts.ownerChatId ?? env.OWNER_TELEGRAM_CHAT_ID;
  const mlCreds = opts.mlCreds ?? ({ site: "MLA", expiresAt: 0 } as MlCredentials);
  const wahaCfg = opts.wahaCfg ?? { base: env.WAHA_API_URL ?? "", session: env.WAHA_SESSION || "default", apiKey: env.WAHA_API_KEY, webhookToken: env.WAHA_WEBHOOK_TOKEN };
  const wahaStatus = opts.wahaStatus ?? null;
  const voiceCfg: VoiceConfig =
    opts.voiceCfg ??
    ({
      provider: "",
      vapi: { baseUrl: "https://api.vapi.ai" },
      retell: { baseUrl: "https://api.retellai.com" },
      objective: "",
      maxAttempts: 3,
    } as VoiceConfig);
  // Nicho taxis: solo se ofrecen canales de WhatsApp (oficial + WAHA). El resto
  // sigue en el código, pero no se muestra en esta instalación.
  const taxiOnly = getNiche(env).hooks?.taxiEngine === true;
  // Tarjeta de WAHA: se muestra si ya está configurado o si el super admin
  // desbloqueó el módulo `canal_waha` (fail-open: sin poder leer módulos, visible
  // solo si ya está configurado, como antes).
  const wahaUnlocked = await isModuleUnlocked(env, "canal_waha").catch(() => false);
  const showWaha = Boolean((wahaCfg.base ?? "").trim()) || wahaUnlocked;
  const allChannels = channelStatuses(env, zernioCreds, t, telegramToken, mlCreds, wahaCfg, showWaha);
  const channels = taxiOnly ? allChannels.filter((ch) => ch.id === "whatsapp" || ch.id === "waha") : allChannels;
  const connected = channels.filter((ch) => ch.ok).length;
  // Fallback de base: la ruta GET pasa el origin real si DASHBOARD_BASE_URL está
  // vacío, para que las cards SIEMPRE muestren su webhook URL.
  const base = (opts.baseUrl ?? env.DASHBOARD_BASE_URL ?? "").replace(/\/$/, "");

  // Formulario de conexión de Zernio: pegar API key + webhook secret y listo.
  // Se guarda en D1 (settings) y el canal se pone verde SIN redeploy.
  const zernioForm = (ch: ChannelStatus) => {
    if (ch.id !== "zernio") return "";
    const keyTail = (zernioCreds.apiKey ?? "").trim().slice(-4);
    const hasSecret = (zernioCreds.webhookSecret ?? "").trim() !== "";
    return `
      <form method="POST" action="/admin/conexiones/zernio" style="display:flex;flex-direction:column;gap:10px;margin-top:4px">
        <div style="display:flex;flex-direction:column;gap:6px">
          <label class="font-display font-semibold text-[12.5px] text-cream">${t("cx.zernio.apiKeyLabel")}</label>
          <input type="password" name="zernio_api_key" value="" autocomplete="off"
                 placeholder="${keyTail ? t("cx.zernio.phKeySaved", { tail: keyTail }) : t("cx.zernio.phKey")}"
                 style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none">
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <label class="font-display font-semibold text-[12.5px] text-cream">${t("cx.zernio.secretLabel")}</label>
          <input type="password" name="zernio_webhook_secret" value="" autocomplete="off"
                 placeholder="${hasSecret ? t("cx.phSecretSaved") : t("cx.zernio.phSecret")}"
                 style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none">
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <button type="submit" class="text-[12px] font-display font-semibold"
                  style="border:1px solid var(--line);color:var(--cream);padding:9px 14px;cursor:pointer;background:none">${ch.ok ? t("cx.update") : t("cx.zernio.connect")}</button>
          ${ch.ok ? `<label class="text-dim text-[11.5px]" style="display:flex;align-items:center;gap:7px;cursor:pointer"><input type="checkbox" name="clear" value="1"> ${t("cx.clear")}</label>` : ""}
        </div>
      </form>`;
  };

  // Formulario de Telegram: token del bot (validado con getMe + webhook
  // registrado solo) y chat id del dueño para avisos de handoff.
  const telegramForm = (ch: ChannelStatus) => {
    if (ch.id !== "telegram") return "";
    const hasToken = (telegramToken ?? "").trim() !== "";
    const hasOwner = (ownerChatId ?? "").trim() !== "";
    const ownerTail = hasOwner ? String(ownerChatId ?? "").trim().slice(-4) : "";
    return `
      <form method="POST" action="/admin/conexiones/telegram" style="display:flex;flex-direction:column;gap:10px;margin-top:4px">
        <div style="display:flex;flex-direction:column;gap:6px">
          <label class="font-display font-semibold text-[12.5px] text-cream">${t("cx.telegram.tokenLabel")}</label>
          <input type="password" name="telegram_bot_token" value="" autocomplete="off"
                 placeholder="${hasToken ? t("cx.telegram.phTokenSaved") : t("cx.telegram.phToken")}"
                 style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none">
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <label class="font-display font-semibold text-[12.5px] text-cream">${t("cx.telegram.chatLabel")}</label>
          <input type="text" name="owner_telegram_chat_id" value="" autocomplete="off"
                 placeholder="${hasOwner ? t("cx.telegram.phChatSaved", { tail: ownerTail }) : t("cx.telegram.phChat")}"
                 style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none">
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <button type="submit" class="text-[12px] font-display font-semibold"
                  style="border:1px solid var(--line);color:var(--cream);padding:9px 14px;cursor:pointer;background:none">${ch.ok ? t("cx.update") : t("cx.telegram.connect")}</button>
          ${ch.ok ? `<label class="text-dim text-[11.5px]" style="display:flex;align-items:center;gap:7px;cursor:pointer"><input type="checkbox" name="clear" value="1"> ${t("cx.clear")}</label>` : ""}
          ${hasOwner ? `<label class="text-dim text-[11.5px]" style="display:flex;align-items:center;gap:7px;cursor:pointer"><input type="checkbox" name="clear_owner" value="1"> ${t("cx.telegram.clearOwner")}</label>` : ""}
        </div>
      </form>`;
  };

  // Formulario de MercadoLibre: App ID + Secret + país (se guardan en D1), y
  // luego el botón "Autorizar" arranca el OAuth. Los tokens se guardan solos
  // en el callback. Todo sin `wrangler secret put` ni redeploy.
  const mercadolibreForm = (ch: ChannelStatus) => {
    if (ch.id !== "mercadolibre") return "";
    const hasId = (mlCreds.clientId ?? "").trim() !== "";
    const hasSecret = (mlCreds.clientSecret ?? "").trim() !== "";
    const canAuthorize = hasId && hasSecret;
    const oauthUrl = `${base}/webhooks/mercadolibre/oauth`;
    const options = ML_SITES.map(
      (s) => `<option value="${s.id}"${mlCreds.site === s.id ? " selected" : ""}>${esc(s.label)} (${s.id})</option>`,
    ).join("");
    return `
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">
        <div class="text-dim text-[10.5px] font-mono" style="display:flex;flex-direction:column;gap:5px">
          <span>${t("cx.ml.redirectHint")}</span>
          <span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span style="border:1px solid var(--line);padding:4px 8px;background:var(--bg)">${esc(oauthUrl)}</span>
            <button type="button" class="text-[10.5px]" style="border:1px solid var(--line);color:var(--cream);padding:4px 8px;cursor:pointer;background:none"
                    onclick="navigator.clipboard.writeText('${esc(oauthUrl)}');this.textContent='${t("cx.copied")}'">${t("cx.copy")}</button>
          </span>
        </div>
        <form method="POST" action="/admin/conexiones/mercadolibre" style="display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;flex-direction:column;gap:6px">
            <label class="font-display font-semibold text-[12.5px] text-cream">${t("cx.ml.country")}</label>
            <select name="ml_site" style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none">${options}</select>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <label class="font-display font-semibold text-[12.5px] text-cream">${t("cx.ml.appId")}</label>
            <input type="text" name="ml_client_id" value="" autocomplete="off"
                   placeholder="${hasId ? t("cx.ml.phAppIdSaved") : t("cx.ml.phAppId")}"
                   style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none">
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <label class="font-display font-semibold text-[12.5px] text-cream">${t("cx.ml.secret")}</label>
            <input type="password" name="ml_client_secret" value="" autocomplete="off"
                   placeholder="${hasSecret ? t("cx.phSecretSaved") : t("cx.ml.phSecret")}"
                   style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none">
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <button type="submit" class="text-[12px] font-display font-semibold"
                    style="border:1px solid var(--line);color:var(--cream);padding:9px 14px;cursor:pointer;background:none">${t("cx.ml.save")}</button>
            ${
              canAuthorize
                ? `<a href="/admin/conexiones/mercadolibre/oauth" class="text-[12px] font-display font-semibold" style="border:1px solid var(--accent);color:var(--accent);padding:9px 14px;text-decoration:none">${mlConnected(mlCreds) ? t("cx.ml.reauth") : t("cx.ml.authorize")} →</a>`
                : ""
            }
            ${ch.ok || mlConnected(mlCreds) ? `<label class="text-dim text-[11.5px]" style="display:flex;align-items:center;gap:7px;cursor:pointer"><input type="checkbox" name="clear" value="1"> ${t("cx.clear")}</label>` : ""}
          </div>
          ${
            mlConnected(mlCreds)
              ? `<div class="text-[11.5px]" style="color:var(--ok)">✓ ${t("cx.ml.authorized")}${mlCreds.nickname ? `: <span class="font-mono">${esc(mlCreds.nickname)}</span>` : ` (id ${esc(mlCreds.userId ?? "")})`}</div>`
              : ""
          }
        </form>
      </div>`;
  };

  // Formulario de WAHA: URL del servidor + API key + sesión (se guardan en
  // D1). Al guardar, el worker crea/actualiza la sesión en WAHA y registra su
  // webhook automáticamente (POST /api/sessions o PUT + start). Si la sesión
  // queda esperando el QR, se muestra la imagen (proxiada por el worker, la
  // API key nunca viaja al navegador).
  const wahaForm = (ch: ChannelStatus) => {
    if (ch.id !== "waha") return "";
    const hasKey = (wahaCfg.apiKey ?? "").trim() !== "";
    const keyTail = (wahaCfg.apiKey ?? "").trim().slice(-4);
    const status = wahaStatus?.status ?? "";
    const working = status === "WORKING";
    // Tener URL + API key NO significa que el WhatsApp esté emparejado. La
    // sesión puede estar esperando el QR (SCAN_QR_CODE), arrancando (STARTING),
    // deslogueada (FAILED/STOPPED) o inalcanzable (no se pudo consultar → "").
    // Antes solo SCAN_QR_CODE/STARTING pintaban el QR, así que una sesión
    // FAILED/STOPPED dejaba la card muda: el dueño veía "CONECTADO" y ningún
    // QR, sin pista de qué hacer. Ahora CUALQUIER estado configurado muestra
    // algo (el QR, o una explicación + botón para reiniciar la sesión).
    const configured = ch.ok && hasKey;
    const showQr = configured && (status === "SCAN_QR_CODE" || status === "STARTING");
    const needsRelink = configured && (status === "FAILED" || status === "STOPPED");
    const unreachable = configured && !working && !showQr && !needsRelink;
    const restartBtn = `<form method="POST" action="/admin/conexiones/waha/restart" style="margin:0">
        <button type="submit" class="text-[12px] font-display font-semibold"
                style="border:1px solid var(--line);color:var(--cream);padding:9px 14px;cursor:pointer;background:none">${t("cx.waha.restart")}</button>
      </form>`;
    const statusLine = status
      ? t("cx.waha.statusLine", { status: `<span class="font-mono">${esc(status)}</span>` })
      : t("cx.waha.statusUnknown");
    const qrBlock = showQr
      ? `<div style="display:flex;flex-direction:column;gap:8px">
           <div class="text-[11.5px]" style="color:var(--warn)">${t("cx.waha.qrWarn")}</div>
           <img id="waha-qr" src="/admin/conexiones/waha/qr?t=${Date.now()}" width="220" height="220" style="border:1px solid var(--line);background:#fff;padding:6px" alt="${t("cx.waha.qrAlt")}"
                onload="var e=document.getElementById('waha-qr-err');if(e)e.style.display='none'"
                onerror="var e=document.getElementById('waha-qr-err');if(e)e.style.display='block'">
           <div id="waha-qr-err" class="text-[11.5px]" style="color:var(--bad);display:none">${t("cx.waha.qrError")}</div>
           <div class="text-dim text-[10.5px]">${t("cx.waha.qrHint")}</div>
           ${restartBtn}
         </div>
         <script>(function(){setInterval(function(){var img=document.getElementById('waha-qr');if(img){img.src='/admin/conexiones/waha/qr?t='+Date.now();}},20000);})();</script>`
      : "";
    return `
      <form method="POST" action="/admin/conexiones/waha" style="display:flex;flex-direction:column;gap:10px;margin-top:4px">
        <div style="display:flex;flex-direction:column;gap:6px">
          <label class="font-display font-semibold text-[12.5px] text-cream">${t("cx.waha.urlLabel")}</label>
          <input type="text" name="waha_api_url" value="" autocomplete="off"
                 placeholder="${wahaCfg.base ? t("cx.waha.phUrlSaved", { url: esc(wahaCfg.base) }) : t("cx.waha.phUrl")}"
                 style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none">
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <label class="font-display font-semibold text-[12.5px] text-cream">${t("cx.waha.keyLabel")}</label>
          <input type="password" name="waha_api_key" value="" autocomplete="off"
                 placeholder="${hasKey ? t("cx.phKeySaved", { tail: keyTail }) : t("cx.waha.phKey")}"
                 style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none">
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <label class="font-display font-semibold text-[12.5px] text-cream">${t("cx.waha.session")}</label>
          <input type="text" name="waha_session" value="" autocomplete="off"
                 placeholder="${esc(wahaCfg.session || "default")}"
                 style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none">
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <button type="submit" class="text-[12px] font-display font-semibold"
                  style="border:1px solid var(--line);color:var(--cream);padding:9px 14px;cursor:pointer;background:none">${ch.ok ? t("cx.update") : t("cx.waha.connect")}</button>
          ${ch.ok ? `<label class="text-dim text-[11.5px]" style="display:flex;align-items:center;gap:7px;cursor:pointer"><input type="checkbox" name="clear" value="1"> ${t("cx.clear")}</label>` : ""}
        </div>
      </form>
      ${
        working
          ? `<div class="text-[11.5px]" style="color:var(--ok)">${t("cx.waha.working")}${wahaCfg.session ? t("cx.waha.sessionSuffix", { session: `<span class="font-mono">${esc(wahaCfg.session)}</span>` }) : ""}</div>`
          : needsRelink
            ? `<div style="display:flex;flex-direction:column;gap:8px">
                 <div class="text-[11.5px]" style="color:var(--warn)">${t("cx.waha.closed")}${statusLine}${t("cx.waha.relinkHint")}</div>
                 ${restartBtn}
               </div>`
            : unreachable
              ? `<div style="display:flex;flex-direction:column;gap:8px">
                   <div class="text-[11.5px]" style="color:var(--warn)">${t("cx.waha.unreachable")}${statusLine}${t("cx.waha.unreachableHint")}</div>
                   ${restartBtn}
                 </div>`
              : qrBlock
      }`;
  };

  const cards = channels
    .map((ch) => {
      const badge = ch.ok
        ? `<span style="font-size:10px;letter-spacing:.14em;color:var(--ok);border:1px solid var(--ok);background:var(--ok-soft);padding:3px 10px;font-weight:700">${t("cx.connected")}</span>`
        : `<span style="font-size:10px;letter-spacing:.14em;color:var(--dim);border:1px solid var(--line);padding:3px 10px;font-weight:600">${t("cx.disconnected")}</span>`;

      const missing = ch.ok
        ? ""
        : `<div class="text-[11.5px]" style="color:var(--bad)">${t("cx.missing")} <span class="font-mono">${ch.missing
            .map(esc)
            .join(", ")}</span></div>
           <div class="text-dim text-[11.5px]">${esc(ch.howTo)}</div>`;

      const webhook =
        ch.webhookPath
          ? `<div class="text-dim text-[10.5px] font-mono" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
               <span style="border:1px solid var(--line);padding:4px 8px;background:var(--bg)">${esc(base + ch.webhookPath)}</span>
               <button type="button" class="text-[10.5px]" style="border:1px solid var(--line);color:var(--cream);padding:4px 8px;cursor:pointer;background:none"
                       onclick="navigator.clipboard.writeText('${esc(base + ch.webhookPath)}');this.textContent='${t("cx.copied")}'">${t("cx.copy")}</button>
             </div>`
          : "";

      const security = ch.securityNote
        ? `<div class="text-[11px]" style="color:var(--warn)">⚠ ${esc(ch.securityNote)}</div>`
        : "";

      const isPaused = pausedChannels.includes(ch.id);
      const pauseBtn = ch.ok
        ? `<form method="POST" action="/admin/config" style="margin-top:4px;display:flex;gap:8px;align-items:center">
             <input type="hidden" name="channel_pause" value="${esc(ch.id)}">
             <input type="hidden" name="channel_paused" value="${isPaused ? "0" : "1"}">
             <button type="submit" class="text-[11px]" style="border:1px solid ${isPaused ? "var(--bad)" : "var(--line)"};color:${isPaused ? "var(--bad)" : "var(--muted)"};padding:5px 11px;cursor:pointer;background:${isPaused ? "var(--bad-soft)" : "none"}">
               ${isPaused ? t("cx.resume") : t("cx.pause")}
             </button>
             ${isPaused ? `<span class="text-[10.5px]" style="color:var(--bad)">${t("cx.pausedNote")}</span>` : ""}
           </form>`
        : "";

      // Cuentas conectadas de Zernio (Instagram, TikTok, etc.) — solo en la card Zernio.
      const zernioBlock =
        ch.id === "zernio" && zernioAccounts.length > 0
          ? `<div style="margin-top:4px;display:flex;flex-direction:column;gap:6px">
               <div class="text-[10.5px]" style="letter-spacing:.14em;color:var(--dim);font-weight:700">${t("cx.za.title")}</div>
               ${zernioAccounts
                 .map((a) => {
                   const icon = zernioPlatformIcon(a.platform);
                   const label = zernioPlatformLabel(a.platform);
                   const name = a.displayName || a.username || "—";
                   const status = a.needsReconnection
                     ? `<span class="text-[10px]" style="color:var(--bad)">${t("cx.za.reconnect")}</span>`
                     : a.isActive === false
                       ? `<span class="text-[10px]" style="color:var(--dim)">${t("cx.za.inactive")}</span>`
                       : `<span class="text-[10px]" style="color:var(--ok)">${t("cx.za.active")}</span>`;
                   const followers =
                     typeof a.followersCount === "number" && a.followersCount > 0
                       ? `<span class="text-[10px] font-mono" style="color:var(--muted)">${t("cx.za.followers", { n: a.followersCount.toLocaleString("es") })}</span>`
                       : "";
                   // Barra de rate limit (DM de esta hora / 700).
                   const usage = rateUsage[a.id];
                   const rateBar = usage
                     ? (() => {
                         const max = 700;
                         const pct = Math.min(100, Math.round((usage.used / max) * 100));
                         const color = pct >= 90 ? "var(--bad)" : pct >= 60 ? "var(--warn)" : "var(--ok)";
                         return `<div style="margin-top:5px">
                           <div style="display:flex;justify-content:space-between" class="text-[10px] font-mono" style="color:var(--dim)">
                             <span>${t("cx.za.dmThisHour")}</span><span style="color:${color}">${usage.used}/${max}</span>
                           </div>
                           <div style="height:4px;background:var(--line);margin-top:2px"><div style="height:4px;width:${pct}%;background:${color}"></div></div>
                         </div>`;
                       })()
                     : "";
                   return `<div style="display:flex;align-items:center;gap:8px;border:1px solid var(--line);background:var(--panel2);padding:7px 10px">
                     <i data-lucide="${icon}" width="14" height="14" class="text-accent" style="flex:none"></i>
                     <span style="flex:1;min-width:0">
                       <span class="text-[12px] text-cream" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(label)} — ${esc(name)}</span>
                       <span style="display:flex;gap:6px;flex-wrap:wrap">${status}${followers}</span>
                       ${rateBar}
                     </span>
                   </div>`;
                 })
                 .join("")}
             </div>`
          : ch.id === "zernio" && zernioAccounts.length === 0 && env.ZERNIO_API_KEY?.trim()
            ? `<div class="text-[11px]" style="color:var(--dim);margin-top:4px">${t("cx.za.empty")}</div>`
            : "";

      return `
        <div class="bg-panel border ${ch.ok ? "" : "border-line"}" style="padding:18px 20px;display:flex;flex-direction:column;gap:10px;${ch.ok ? "border-color:var(--ok)" : ""}">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
            <div class="font-display font-semibold text-[13.5px] text-cream" style="display:flex;align-items:center;gap:9px">
              <i data-lucide="${ch.icon}" width="16" height="16" class="${ch.ok ? "text-accent" : "text-dim"}"></i>
              ${esc(ch.name)}
            </div>
            ${badge}
          </div>
          <p class="text-dim text-[12px]" style="margin:0">${esc(ch.desc)}</p>
          ${missing}
          ${security}
          ${webhook}
          ${zernioForm(ch)}
          ${telegramForm(ch)}
          ${mercadolibreForm(ch)}
          ${wahaForm(ch)}
          ${zernioBlock}
          ${pauseBtn}
        </div>`;
    })
    .join("");

  const savedBanner = opts.savedKind === "telegram"
    ? `<div style="border:1px solid var(--ok);background:var(--ok-soft);color:var(--ok);padding:10px 14px;font-size:12.5px;font-weight:600">${t("cx.saved.telegram")}</div>`
    : opts.savedKind === "zernio"
      ? `<div style="border:1px solid var(--ok);background:var(--ok-soft);color:var(--ok);padding:10px 14px;font-size:12.5px;font-weight:600">${t("cx.saved.zernio")}</div>`
      : opts.savedKind === "mercadolibre"
        ? `<div style="border:1px solid var(--ok);background:var(--ok-soft);color:var(--ok);padding:10px 14px;font-size:12.5px;font-weight:600">${t("cx.saved.mercadolibre")}</div>`
        : opts.savedKind === "waha"
          ? `<div style="border:1px solid var(--ok);background:var(--ok-soft);color:var(--ok);padding:10px 14px;font-size:12.5px;font-weight:600">${t("cx.saved.waha")}</div>`
          : opts.savedKind === "vapi"
            ? `<div style="border:1px solid var(--ok);background:var(--ok-soft);color:var(--ok);padding:10px 14px;font-size:12.5px;font-weight:600">${t("cx.saved.vapi")}</div>`
            : opts.savedKind === "retell"
              ? `<div style="border:1px solid var(--ok);background:var(--ok-soft);color:var(--ok);padding:10px 14px;font-size:12.5px;font-weight:600">${t("cx.saved.retell")}</div>`
              : opts.savedKind === "voz"
                ? `<div style="border:1px solid var(--ok);background:var(--ok-soft);color:var(--ok);padding:10px 14px;font-size:12.5px;font-weight:600">${t("cx.saved.voz")}</div>`
                : "";
  const errorBanner = opts.error
    ? `<div style="border:1px solid var(--bad);background:var(--bad-soft);color:var(--bad);padding:10px 14px;font-size:12.5px;font-weight:600">✕ ${esc(opts.error)}</div>`
    : "";

  // ── Cobros por voz (Vapi / Retell) ────────────────────────────────────────
  // Solo configuración: deja todos los campos listos para conectar cada
  // proveedor (API key, assistant/agent, número, webhook secret y la URL del
  // webhook a pegar en su dashboard).
  const voiceInputStyle =
    "background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:9px 11px;font-size:12.5px;outline:none;width:100%";
  const vField = (label: string, html: string, hint?: string) => `
    <label style="display:flex;flex-direction:column;gap:4px">
      <span class="text-[11px]" style="color:var(--muted)">${label}</span>
      ${html}
      ${hint ? `<span class="text-[10.5px] text-dim">${hint}</span>` : ""}
    </label>`;
  const vBadge = (ok: boolean) =>
    ok
      ? `<span class="text-[10px]" style="border:1px solid var(--ok);color:var(--ok);background:var(--ok-soft);padding:3px 9px;letter-spacing:.08em">${t("cx.vReady")}</span>`
      : `<span class="text-[10px] text-dim" style="border:1px solid var(--line);padding:3px 9px;letter-spacing:.08em">${t("cx.vMissing")}</span>`;
  const vWebhook = (path: string) => `
    <div class="text-dim text-[10.5px] font-mono" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span>${t("cx.webhookUrl")}</span>
      <span style="border:1px solid var(--line);padding:4px 8px;background:var(--bg);word-break:break-all">${esc((base || "") + path)}</span>
      <button type="button" class="text-[10.5px]" style="border:1px solid var(--line);color:var(--cream);padding:4px 8px;cursor:pointer;background:none"
              onclick="navigator.clipboard.writeText('${esc((base || "") + path)}');this.textContent='${t("cx.copied")}'">${t("cx.copy")}</button>
    </div>`;
  const vapiOk = vapiConfigured(voiceCfg.vapi);
  const retellOk = retellConfigured(voiceCfg.retell);

  const vapiCard = `
    <div class="bg-panel border" style="padding:18px 20px;display:flex;flex-direction:column;gap:10px;border-color:${vapiOk ? "var(--ok)" : "var(--line)"}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div class="font-display font-semibold text-[13.5px] text-cream">${t("cx.vapi.title")}</div>
        ${vBadge(vapiOk)}
      </div>
      <p class="text-dim text-[12px]" style="margin:0">${t("cx.vapi.help")}</p>
      ${vWebhook("/webhooks/vapi")}
      <form method="POST" action="/admin/conexiones/vapi" style="display:flex;flex-direction:column;gap:10px;margin-top:4px">
        ${vField("Private API key", `<input type="password" name="vapi_api_key" value="" autocomplete="off" placeholder="${t("cx.vapi.keyPh")}" style="${voiceInputStyle}">`, "dashboard.vapi.ai → API Keys")}
        ${vField("Assistant ID", `<input type="text" name="vapi_assistant_id" value="${esc(voiceCfg.vapi.assistantId ?? "")}" autocomplete="off" placeholder="asst_…" style="${voiceInputStyle}">`, t("cx.vapi.assistantHint"))}
        ${vField("Phone Number ID", `<input type="text" name="vapi_phone_number_id" value="${esc(voiceCfg.vapi.phoneNumberId ?? "")}" autocomplete="off" placeholder="pn_…" style="${voiceInputStyle}">`, t("cx.vapi.phoneHint"))}
        ${vField("Webhook secret", `<input type="password" name="vapi_webhook_secret" value="" autocomplete="off" placeholder="${t("cx.vapi.secretPh")}" style="${voiceInputStyle}">`, t("cx.vapi.secretHint"))}
        ${vField("API base URL", `<input type="text" name="vapi_api_base_url" value="${esc(voiceCfg.vapi.baseUrl ?? "")}" autocomplete="off" placeholder="https://api.vapi.ai" style="${voiceInputStyle}">`)}
        <label class="text-dim text-[11.5px]" style="display:flex;align-items:center;gap:7px;cursor:pointer">
          <input type="checkbox" name="make_active" value="1" ${voiceCfg.provider === "vapi" ? "checked" : ""}> ${t("cx.vapi.useActive")}
        </label>
        <div style="display:flex;gap:12px;align-items:center">
          <button type="submit" class="font-display font-semibold text-[12px]" style="background:var(--accent);color:var(--on-accent);border:none;padding:9px 16px;cursor:pointer">${t("cx.vapi.save")}</button>
          ${vapiOk ? `<label class="text-dim text-[11.5px]" style="display:flex;align-items:center;gap:7px;cursor:pointer"><input type="checkbox" name="clear" value="1"> ${t("cx.clear")}</label>` : ""}
        </div>
      </form>
    </div>`;

  const retellCard = `
    <div class="bg-panel border" style="padding:18px 20px;display:flex;flex-direction:column;gap:10px;border-color:${retellOk ? "var(--ok)" : "var(--line)"}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div class="font-display font-semibold text-[13.5px] text-cream">${t("cx.retell.title")}</div>
        ${vBadge(retellOk)}
      </div>
      <p class="text-dim text-[12px]" style="margin:0">${t("cx.retell.help")}</p>
      ${vWebhook("/webhooks/retell")}
      <form method="POST" action="/admin/conexiones/retell" style="display:flex;flex-direction:column;gap:10px;margin-top:4px">
        ${vField("API key", `<input type="password" name="retell_api_key" value="" autocomplete="off" placeholder="${t("cx.retell.keyPh")}" style="${voiceInputStyle}">`, "dashboard.retellai.com → API Keys")}
        ${vField("Agent ID", `<input type="text" name="retell_agent_id" value="${esc(voiceCfg.retell.agentId ?? "")}" autocomplete="off" placeholder="agent_…" style="${voiceInputStyle}">`, t("cx.retell.agentHint"))}
        ${vField(t("cx.retell.phoneLabel"), `<input type="text" name="retell_phone_number" value="${esc(voiceCfg.retell.phoneNumber ?? "")}" autocomplete="off" placeholder="+1561…" style="${voiceInputStyle}">`, t("cx.retell.phoneHint"))}
        ${vField("Webhook secret", `<input type="password" name="retell_webhook_secret" value="" autocomplete="off" placeholder="${t("cx.retell.secretPh")}" style="${voiceInputStyle}">`, t("cx.retell.secretHint"))}
        ${vField("API base URL", `<input type="text" name="retell_api_base_url" value="${esc(voiceCfg.retell.baseUrl ?? "")}" autocomplete="off" placeholder="https://api.retellai.com" style="${voiceInputStyle}">`)}
        <label class="text-dim text-[11.5px]" style="display:flex;align-items:center;gap:7px;cursor:pointer">
          <input type="checkbox" name="make_active" value="1" ${voiceCfg.provider === "retell" ? "checked" : ""}> ${t("cx.retell.useActive")}
        </label>
        <div style="display:flex;gap:12px;align-items:center">
          <button type="submit" class="font-display font-semibold text-[12px]" style="background:var(--accent);color:var(--on-accent);border:none;padding:9px 16px;cursor:pointer">${t("cx.retell.save")}</button>
          ${retellOk ? `<label class="text-dim text-[11.5px]" style="display:flex;align-items:center;gap:7px;cursor:pointer"><input type="checkbox" name="clear" value="1"> ${t("cx.clear")}</label>` : ""}
        </div>
      </form>
    </div>`;

  const vozComun = `
    <div class="bg-panel border border-line" style="padding:18px 20px;display:flex;flex-direction:column;gap:10px">
      <div class="font-display font-semibold text-[13.5px] text-cream">${t("cx.voz.title")}</div>
      <form method="POST" action="/admin/conexiones/voz" style="display:flex;flex-direction:column;gap:10px">
        ${vField(t("cx.voz.objectiveLabel"), `<textarea name="cobros_voice_objective" rows="3" style="${voiceInputStyle};resize:vertical" placeholder="${t("cx.voz.objectivePh")}">${esc(voiceCfg.objective)}</textarea>`, t("cx.voz.objectiveHint"))}
        ${vField(t("cx.voz.attemptsLabel"), `<input type="number" name="cobros_voice_max_attempts" min="1" max="10" value="${voiceCfg.maxAttempts}" style="${voiceInputStyle}">`)}
        <button type="submit" class="font-display font-semibold text-[12px]" style="background:var(--accent);color:var(--on-accent);border:none;padding:9px 16px;cursor:pointer;align-self:flex-start">${t("cx.voz.save")}</button>
      </form>
    </div>`;

  const body = `
    <div style="display:flex;flex-direction:column;gap:18px">
      ${savedBanner}
      ${errorBanner}
      <div style="display:flex;flex-direction:column;gap:2px">
        <h2 class="font-display font-semibold text-[15px] text-cream">${t("cx.heading", { connected, total: channels.length })}</h2>
        <p class="text-muted text-[12.5px]">${t("cx.subtitle")}</p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px">
        ${cards}
      </div>
      ${taxiOnly ? "" : `<div style="display:flex;flex-direction:column;gap:2px;margin-top:6px">
        <h2 class="font-display font-semibold text-[15px] text-cream">${t("cx.voice.title")}</h2>
        <p class="text-muted text-[12.5px]">${t("cx.voice.help")}</p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px">
        ${vapiCard}
        ${retellCard}
        ${vozComun}
      </div>`}
    </div>`;

  return layout({ title: t("cx.title"), activeTab: "conexiones", body, env });
}

/** Resumen corto para el badge de salud del Resumen. */
export function connectionsSummary(
  env: Env,
  zernioCreds: ZernioCredentials,
  telegramToken?: string,
  mlCreds?: MlCredentials,
  wahaCfg?: WahaConfig,
): { connected: number; total: number } {
  const channels = channelStatuses(env, zernioCreds, makeT("es"), telegramToken, mlCreds, wahaCfg);
  return { connected: channels.filter((ch) => ch.ok).length, total: channels.length };
}

/**
 * Cuenta cuántos canales están conectados AHORA — resuelve las credenciales por
 * su cuenta. Lo usa el gate del límite de canales del plan gratis
 * (`checkChannelLimit`) en las rutas POST de Conexiones. `byId` dice qué canal
 * está conectado, para saber si el que se intenta guardar ya estaba.
 */
export async function countConnectedChannels(
  env: Env,
): Promise<{ connected: number; byId: Record<string, boolean> }> {
  const { resolveZernioCredentials } = await import("../../channels/zernioCredentials");
  const { resolveTelegramToken } = await import("../../channels/telegramCredentials");
  const { loadMlCredentials } = await import("../../channels/mercadolibreCredentials");
  const { resolveWahaConfig } = await import("../../channels/wahaCredentials");
  const [zernioCreds, telegramToken, mlCreds, wahaCfg] = await Promise.all([
    resolveZernioCredentials(env),
    resolveTelegramToken(env),
    loadMlCredentials(env),
    resolveWahaConfig(env),
  ]);
  const channels = channelStatuses(env, zernioCreds, makeT("es"), telegramToken, mlCreds, wahaCfg);
  const byId: Record<string, boolean> = {};
  for (const ch of channels) byId[ch.id] = ch.ok;
  return { connected: channels.filter((ch) => ch.ok).length, byId };
}
