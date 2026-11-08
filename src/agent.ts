import { Agent } from "agents";
import { streamText } from "ai";
import type { SystemModelMessage } from "ai";
import type { Env } from "./env";
import { Db } from "./db/client";
import { ConversationsRepo, PAUSE_INDEFINITE } from "./db/conversations";
import { MessagesRepo } from "./db/messages";
import { isContactBlocked, isConversationSilent } from "./silence";
import { resolveAgentConfig } from "./settings-loader";
import { buildTools } from "./tools";
import { buildMultimodalUserMessage } from "./media/vision";
import { chunkReply } from "./replies/chunker";
import { toPlainLinks } from "./replies/format";
import { pickAdapter, sendReplyCapped } from "./replies/sender";
import { selectModel } from "./upgrade/modelSelector";
import type { Tier } from "./upgrade/modelSelector";
import { monthIaCostUsd, applyBudgetGuard } from "./budget";
import { CustomerFactsRepo } from "./db/facts";
import { createModel } from "./llm/provider";
import { detectLanguage, baseLangCode, LANG_LABEL } from "./lang/detect";
import type { LangCode } from "./lang/detect";
import { nowInTz } from "./timezone";
import { costOfUsage } from "./pricing";
import type { ChannelId, ReplyButton } from "./channels/shared";
import type { ResourceMediaOpts } from "./resources/library";
import { maskTelegramToken } from "./telegramFiles";
import { refFor } from "./channels/mediaRef";

export { refFor, stripRef } from "./channels/mediaRef";

export interface SupportAgentState {
  conversationId: string | null;
  channel: string;
  channelUserId: string;
  pendingMessages: { text: string; receivedAt: number }[];
  lastAlarmAt: number;
  lastUserLang: string;
  /**
   * Idioma del CLIENTE detectado en esta conversación (es|en|pt). Se fija una
   * sola vez, con su primer mensaje, y se mantiene: es exactamente lo que pide
   * la regla de multi-idioma ("reconoce el cambio una sola vez y luego síguelo").
   * null = no se pudo determinar con certeza.
   */
  detectedLang?: LangCode | null;
  toolCallsInLast2Turns: number;
  lastSearchKbScore: number;
  imageRetryCount: number;
  /** Para responder en el hilo del último mensaje entrante (Telegram grupos). */
  lastReplyToMessageId?: number;
  /**
   * Última ubicación compartida por el cliente (pin de WhatsApp). La usa el
   * nicho de taxis para calcular la base más cercana (ver src/taxi/dispatch.ts).
   */
  lastLocation?: { lat: number; lng: number; name?: string; address?: string } | null;
}

export interface AgentIncomingPayload {
  channel: string;
  channelUserId: string;
  displayName?: string;
  text?: string;
  audioUrl?: string;
  imageUrl?: string;
  isOwnerMessage?: boolean;
  /** El negocio respondió desde la app nativa — registrar + pausar, no contestar. */
  ownerEcho?: boolean;
  /** Rol del eco saliente: `owner` (persona) | `assistant` (bot/automatización). */
  echoRole?: "owner" | "assistant";
  /** Para responder en el hilo (Telegram grupos). */
  replyToMessageId?: number;
  /** Ubicación compartida por el cliente (pin de WhatsApp) — nicho taxis. */
  location?: { lat: number; lng: number; name?: string; address?: string };
}

/**
 * Texto mínimo para registrar un entrante en los caminos que todavía no
 * procesaron el medio (pausas, spam, tope diario, límites). El camino normal usa
 * el `processedText` completo (transcripción + marcadores [AUDIO_URL]/[IMAGE_URL]).
 */
function inboundLabel(p: AgentIncomingPayload): string {
  const t = (p.text ?? "").trim();
  if (t) return t;
  if (p.audioUrl) return "(audio)";
  if (p.imageUrl) return "(imagen)";
  return "";
}

export class SupportAgent extends Agent<Env, SupportAgentState> {
  initialState: SupportAgentState = {
    conversationId: null,
    channel: "",
    channelUserId: "",
    pendingMessages: [],
    lastAlarmAt: 0,
    lastUserLang: "es",
    detectedLang: null,
    toolCallsInLast2Turns: 0,
    lastSearchKbScore: 1,
    imageRetryCount: 0,
  };

  /**
   * Guarda el mensaje del CLIENTE en el hilo apenas lo recibimos, ANTES de
   * decidir si el bot responde. Es la regla que garantiza que una conversación
   * nunca quede vacía: sin esto, cualquier pausa (global, por canal, takeover,
   * spam o tope diario) creaba el hilo en el panel pero lo dejaba SIN ningún
   * mensaje — el dueño no veía ni lo recibido ni lo enviado.
   *
   * Contrato: guardar ≠ responder. La pausa apaga la respuesta, nunca el registro.
   */
  private async persistInbound(convId: string, text: string | undefined): Promise<void> {
    const content = (text ?? "").trim();
    if (!content) return;
    const db = new Db(this.env.DB);
    await new MessagesRepo(db).append(convId, "user", content);
    await new ConversationsRepo(db).touchLastMessage(convId);
  }

  /**
   * Called by the Worker fetch handler when a webhook arrives for this user.
   * Buffers the message, schedules/resets an alarm.
   */
  async ingest(payload: AgentIncomingPayload): Promise<{ acknowledged: true }> {
    const db = new Db(this.env.DB);
    const convs = new ConversationsRepo(db);
    const conv = await convs.getOrCreate(
      payload.channel,
      payload.channelUserId,
      payload.displayName,
    );
    this.setState({
      ...this.state,
      channel: payload.channel,
      channelUserId: payload.channelUserId,
      conversationId: conv.id,
      lastReplyToMessageId: payload.replyToMessageId,
    });

    // Contacto BLOQUEADO al bot: silencio total. El mensaje se registra para que
    // el panel muestre el hilo, pero no se marca como leído, no se mandan
    // recursos de primer mensaje, no se evalúan límites y no se arma el alarm.
    if (await isContactBlocked(this.env, payload.channel, payload.channelUserId)) {
      await this.persistInbound(conv.id, inboundLabel(payload));
      console.warn(`[ingest] contacto bloqueado (${conv.id}) — mensaje registrado sin respuesta`);
      return { acknowledged: true };
    }

    // Confirmación de lectura (doble tilde) donde el canal lo soporte (WAHA).
    // Best-effort: nunca frena el ingest.
    if (!payload.isOwnerMessage && payload.channel !== "webchat") {
      try {
        await pickAdapter(payload.channel as ChannelId).markSeen?.(payload.channelUserId, this.env);
      } catch (e) {
        console.warn("[ingest] markSeen falló:", e);
      }
    }

    // Recursos de CAMPAÑA: en el PRIMER mensaje del cliente (conversación sin
    // mensajes previos) la Galería manda los recursos marcados `firstMessage`,
    // de forma determinista (no depende de la IA). Van ANTES de la respuesta.
    if (!payload.isOwnerMessage && payload.channel !== "webchat") {
      try {
        await this.sendFirstMessageResources(conv.id, payload.channel as ChannelId, payload.channelUserId);
      } catch (e) {
        console.warn("[ingest] firstMessage resources:", e);
      }
    }

    // Registrar contacto (todos los que interactúan, separado de Leads).
    try {
      const { ContactsRepo } = await import("./db/contacts");
      await new ContactsRepo(db).touch({
        channel: payload.channel,
        channelUserId: payload.channelUserId,
        displayName: payload.displayName,
        username: payload.displayName,
      });
    } catch (e) {
      console.warn("[contacts] no se pudo registrar el contacto:", e);
    }

    // ── Límites de uso del plan (free): contactos (solo en conversación nueva)
    // y mensajes/mes (en cada entrante). Si se llegó al tope, se responde
    // amablemente UNA vez y no se procesa con la IA. Fail-open: cualquier error
    // en el chequeo deja pasar el mensaje.
    if (payload.text && !payload.isOwnerMessage) {
      try {
        const { checkLimit, limitMessage } = await import("./limits");
        const convCount = await convs.count();
        const isNew = convCount > 0 && conv.started_at === conv.last_message_at; // recién creada
        // Conversación nueva: contactos + mensajes/mes. Conversación existente:
        // solo mensajes/mes.
        const checks = isNew
          ? (["contacts", "messagesThisMonth"] as const)
          : (["messagesThisMonth"] as const);
        for (const res of checks) {
          const check = await checkLimit(this.env, res);
          if (!check.allowed) {
            // El entrante se registra igual: topar el límite frena la respuesta,
            // no la visibilidad de lo que el cliente escribió.
            await this.persistInbound(conv.id, inboundLabel(payload));
            // El aviso de plan es INTERNO. Antes se le mandaba al cliente como
            // si fuera la respuesta del bot ("llegaste al límite… activa Pro"),
            // que no le dice nada y delata la licencia. Ahora se avisa al dueño.
            const msg = limitMessage(res, check.used, check.limit ?? 0);
            try {
              const { notifyOwnerPush } = await import("./push");
              await notifyOwnerPush(this.env, {
                title: "⚠️ Límite del plan alcanzado",
                body: msg,
                url: "/admin/licencia",
              });
            } catch (e) {
              console.warn("[limits] no se pudo avisar al dueño:", e);
            }
            console.warn(`[limits] ${res} al tope (${check.used}/${check.limit}) — conversación ${conv.id} no procesada`);
            return { acknowledged: true };
          }
        }
      } catch (e) {
        console.warn("[limits] chequeo de uso falló — fail-open:", e);
      }
    }

    // Owner escribió al bot (mismo chat donde prueba). ANTES pausaba la
    // conversación 1h por cada mensaje del dueño — el bot "se detenía" y cada
    // mensaje suyo re-pausaba (bug reportado). Ahora: el dueño NO pausa nada;
    // su mensaje se procesa normal (el bot le responde). El takeover manual de
    // una conversación de cliente se hace desde el panel (admin/takeover).
    if (payload.isOwnerMessage) {
      // solo marca de contexto, sin pausar
    }

    // Conversación pausada (takeover del dueño, spam o tope diario) o contacto
    // bloqueado: el bot calla, pero el mensaje del cliente se registra igual
    // para que el panel muestre el hilo completo mientras el humano atiende.
    if ((await convs.isPaused(conv.id)) || (await isContactBlocked(this.env, conv.channel, conv.channel_user_id))) {
      await this.persistInbound(conv.id, inboundLabel(payload));
      return { acknowledged: true };
    }

    // Guardrail anti-spam: el mismo mensaje por 3ª vez entre los últimos 5 →
    // la conversación descansa 1 hora, sin respuesta y sin gastar LLM.
    if (payload.text && !payload.audioUrl && !payload.imageUrl) {
      try {
        const { isRepeatSpam, SPAM_SNOOZE_MS, isOverDailyCap, DAILY_CAP_SNOOZE_MS, DAILY_CAP_MESSAGE } =
          await import("./spam");
        if (await isRepeatSpam(db, conv.id, payload.text)) {
          // Se registra DESPUÉS del chequeo (para no alterar el conteo de
          // repeticiones) pero ANTES de salir: el panel muestra el mensaje.
          await this.persistInbound(conv.id, payload.text);
          await convs.setPausedUntil(conv.id, Date.now() + SPAM_SNOOZE_MS);
          console.warn(`[spam-guard] conv ${conv.id} en cooldown 1h (mensaje repetido)`);
          return { acknowledged: true };
        }
        // Tope diario de turnos: despedida amable UNA vez + descanso 12h. La
        // pausa garantiza que no se repita (los siguientes mensajes mueren en
        // isPaused antes de llegar aquí).
        if (await isOverDailyCap(db, conv.id)) {
          await this.persistInbound(conv.id, payload.text);
          await convs.setPausedUntil(conv.id, Date.now() + DAILY_CAP_SNOOZE_MS);
          await new MessagesRepo(db).append(conv.id, "assistant", DAILY_CAP_MESSAGE);
          const channel = payload.channel as ChannelId;
          await pickAdapter(channel).sendReply(
            { channel, channelUserId: payload.channelUserId, chunks: [DAILY_CAP_MESSAGE] },
            this.env,
          );
          console.warn(`[spam-guard] conv ${conv.id} tope diario de turnos → descanso 12h`);
          return { acknowledged: true };
        }
      } catch (e) {
        // El guard es un extra, nunca la ruta crítica: si falla, se responde normal.
        console.warn("[spam-guard] check failed:", e);
      }
    }

    // Config efectiva (D1 settings sobre los defaults del env). Se resuelve ACÁ
    // —y no más abajo— porque el gate de 'Oído y vista' la necesita; antes se
    // releían los settings aparte (isFeatureActive) para lo mismo.
    const cfg = await resolveAgentConfig(this.env, []);

    // Process media (audio → transcription, image → Pro-gated multimodal marker)
    // Menú Extras (Kooni+): 'Oído y vista' enciende el entendimiento de audio y
    // fotos. Si está apagado (o el módulo no está desbloqueado), se le pide al
    // cliente que escriba — no se procesa el medio.
    // `cfg.oidoVistaEnabled` es la ÚNICA fuente de verdad de este toggle.
    let processedText = payload.text ?? "";
    let hasImage = false;
    const oidoVistaOn = Boolean(payload.audioUrl || payload.imageUrl) && cfg.oidoVistaEnabled;

    if (payload.audioUrl) {
      if (oidoVistaOn) {
        try {
          const { transcribeAudio } = await import("./media/transcribe");
          const result = await transcribeAudio(refFor(payload.channel, payload.audioUrl), this.env);
          processedText = result.text || "(audio sin transcripción)";
        } catch (e) {
          console.error("[ingest] transcription failed:", e);
          processedText = "(no pude entender el audio)";
        }
        // Marcador de previsualización (§ V Fase 2): el panel puede reproducir
        // el audio original además de mostrar la transcripción. Mismo mecanismo
        // que [IMAGE_URL: ...] — enmascarado, nunca el token/URL crudo en D1.
        // `waha:` distingue el único otro canal cuyo archivo necesita un proxy
        // con credencial propia (ver src/admin/media.ts); el resto pasa directo.
        processedText += `\n[AUDIO_URL: ${maskTelegramToken(refFor(payload.channel, payload.audioUrl))}]`;
      } else {
        processedText = (processedText || "") + "\n(El cliente mandó un audio; esta instalación no tiene 'Oído y vista' activado. Pídele que escriba.)";
      }
    }

    if (payload.imageUrl) {
      if (oidoVistaOn) {
        hasImage = true;
        // Análisis de imágenes disponible en todos los planes (gate solo el
        // toggle "Oído y vista" del dueño). El límite de plan es de cantidad,
        // no de features — ver src/limits.ts.
        processedText =
          (processedText || "(imagen sin caption)") +
          // MASKED: a Telegram file URL carries the bot token inside, and this
          // marker gets persisted in D1 (and shown in the dashboard, and
          // included in exports). See src/telegramFiles.ts.
          `\n[IMAGE_URL: ${maskTelegramToken(refFor(payload.channel, payload.imageUrl))}]`;
      } else {
        processedText = (processedText || "") + "\n(El cliente mandó una foto; esta instalación no tiene 'Oído y vista' activado. Pídele que describa.)";
      }
    }

    // Ubicación compartida (pin de WhatsApp). Sin esto, un mensaje que SOLO trae
    // la ubicación llegaría con texto vacío y se descartaría en processBuffer.
    // Se deja un marcador legible para el modelo y se guarda la coordenada en el
    // estado para que la tool del nicho (solicitarTaxi) la use tal cual.
    if (payload.location && Number.isFinite(payload.location.lat) && Number.isFinite(payload.location.lng)) {
      const loc = payload.location;
      processedText =
        (processedText || "El cliente compartió su ubicación.") +
        `\n[UBICACION_COMPARTIDA lat=${loc.lat} lng=${loc.lng}` +
        `${loc.name ? ` lugar=${loc.name}` : ""}${loc.address ? ` direccion=${loc.address}` : ""}]`;
    }

    // El mensaje del cliente (ya con transcripción y marcadores de media) se
    // persiste ACÁ, siempre, antes de armar el buffer. Es lo que hace que el
    // panel lo muestre al instante aunque después una pausa impida responder.
    // processBuffer NO vuelve a guardarlo (evita el duplicado).
    await this.persistInbound(conv.id, processedText);

    // Etiquetado inteligente (módulo etiquetas_ia): reglas por palabra clave,
    // en tiempo real. Barato y fail-open — nunca bloquea la respuesta.
    if (cfg.etiquetasEnabled && processedText.trim()) {
      try {
        const { applyKeywordRules } = await import("./labels/engine");
        await applyKeywordRules(this.env, conv.id, processedText);
      } catch (e) {
        console.warn("[ingest] etiquetado por keyword falló:", e);
      }
    }

    // Disparadores keyword→flujo (módulo flujos): si alguno responde YA, el
    // mensaje NO entra al buffer (evita doble respuesta). Los que solo etiquetan
    // o capturan dejan seguir el flujo normal del agente.
    if (cfg.flujosEnabled && processedText.trim()) {
      try {
        const { evaluateTriggers } = await import("./triggers/engine");
        const outcome = await evaluateTriggers(this.env, {
          conversationId: conv.id,
          channel: payload.channel as ChannelId,
          channelUserId: payload.channelUserId,
          text: processedText,
          // Los pasos de un `flow` con demora se agendan en el DO (scheduler).
          scheduleFlow: (steps) =>
            void this.scheduleFlowSteps(conv.id, payload.channel as ChannelId, payload.channelUserId, steps),
        });
        if (outcome.replied) return { acknowledged: true };
      } catch (e) {
        console.warn("[ingest] disparadores fallaron (fail-open):", e);
      }
    }

    // Append to buffer
    const pending = [
      ...this.state.pendingMessages,
      { text: processedText, receivedAt: Date.now() },
    ];
    this.setState({
      ...this.state,
      pendingMessages: pending,
      imageRetryCount: hasImage ? 0 : this.state.imageRetryCount,
      lastLocation: payload.location ?? this.state.lastLocation ?? null,
    });

    // Owner paused the bot via the dashboard → keep the message buffered but
    // stay silent: do NOT arm the alarm, so alarm() never runs.
    // Global (bot_paused) o por canal (paused_channels: ej. solo telegram).
    if (cfg.botPaused || cfg.pausedChannels.includes(payload.channel)) {
      if (cfg.pausedChannels.includes(payload.channel)) {
        console.warn(`[ingest] canal pausado: ${payload.channel} — no se responde (el mensaje queda registrado)`);
      }
      return { acknowledged: true };
    }

    // Schedule buffer processing via the agents SDK scheduler.
    // The SDK overrides alarm() to dispatch named callbacks from its
    // cf_agents_schedules table, so raw ctx.storage.setAlarm() alone won't
    // invoke our code. We upsert a fixed 'msg-buffer' row (so rapid messages
    // debounce to a single fire) and set the raw alarm as the trigger.
    // Rescue for stranded messages: a Cloudflare alarm can silently fail to
    // fire. When that happens the customer's message sits in the buffer until
    // they write again — we saw a real customer wait 11 minutes before typing
    // "Hola?". If the oldest buffered message is already older than 2x the
    // normal wait, don't wait a whole buffer window again: process almost
    // immediately.
    const oldestAt = pending[0]?.receivedAt ?? Date.now();
    const hasStranded = Date.now() - oldestAt > cfg.bufferMs * 2;
    const alarmAt = Date.now() + (hasStranded ? 500 : cfg.bufferMs);
    const alarmAtSec = Math.floor(alarmAt / 1000);
    this.sql`
      INSERT OR REPLACE INTO cf_agents_schedules
        (id, callback, payload, type, time, created_at)
      VALUES
        ('msg-buffer', 'processBuffer', '{}', 'delayed', ${alarmAtSec}, unixepoch())
    `;
    await this.ctx.storage.setAlarm(alarmAt);
    // Cheap guard against the lost alarm: if it didn't get registered, retry
    // once and leave a trace in the log.
    if ((await this.ctx.storage.getAlarm()) === null) {
      console.error("[ingest] alarm was not armed — retrying");
      await this.ctx.storage.setAlarm(alarmAt);
    }
    this.setState({ ...this.state, lastAlarmAt: alarmAt });

    return { acknowledged: true };
  }

  /**
   * Recursos de CAMPAÑA: en el PRIMER mensaje del cliente (conversación sin
   * mensajes previos) la Galería manda los recursos marcados `firstMessage`, de
   * forma determinista (no depende de la IA). No hace nada si la Galería está
   * apagada o la conversación ya tenía mensajes.
   */
  private async sendFirstMessageResources(
    conversationId: string,
    channel: ChannelId,
    channelUserId: string,
  ): Promise<void> {
    const db = new Db(this.env.DB);
    const msgs = new MessagesRepo(db);
    if ((await msgs.count(conversationId)) > 0) return; // solo el primer mensaje
    const cfg = await resolveAgentConfig(this.env, []);
    if (!cfg.galeriaEnabled || !cfg.allowMultimedia) return;

    const { SettingsRepo, SETTING_KEYS } = await import("./db/settings");
    const { firstMessageResources, resourceMediaOf } = await import("./resources/library");
    const raw = await new SettingsRepo(db).get(SETTING_KEYS.resourceLibrary);
    for (const r of firstMessageResources(raw)) {
      try {
        await sendReplyCapped(channel, channelUserId, [r.caption ?? ""], this.env, resourceMediaOf(r));
        if (r.caption) await msgs.append(conversationId, "assistant", r.caption);
      } catch (e) {
        console.warn("[ingest] firstMessage resource falló:", e);
      }
    }
  }

  /**
   * Agenda los pasos diferidos de un `flow` de disparadores (delay_minutes > 0)
   * con el scheduler del agente (`cf_agents_schedules` + setAlarm). Cada paso es
   * una fila con callback 'runFlowStep'; el SDK la despacha cuando vence.
   */
  private async scheduleFlowSteps(
    conversationId: string,
    channel: ChannelId,
    channelUserId: string,
    steps: { delayMinutes: number; text: string; resource?: string }[],
  ): Promise<void> {
    let earliest = Infinity;
    for (const step of steps) {
      const at = Date.now() + Math.max(0, step.delayMinutes) * 60_000;
      earliest = Math.min(earliest, at);
      const atSec = Math.floor(at / 1000);
      const payload = JSON.stringify({
        conversationId,
        channel,
        channelUserId,
        text: step.text,
        ...(step.resource ? { resource: step.resource } : {}),
      });
      const id = `flow-${crypto.randomUUID()}`;
      this.sql`
        INSERT INTO cf_agents_schedules (id, callback, payload, type, time, created_at)
        VALUES (${id}, 'runFlowStep', ${payload}, 'delayed', ${atSec}, unixepoch())
      `;
    }
    if (earliest !== Infinity) {
      const cur = await this.ctx.storage.getAlarm();
      if (cur === null || earliest < cur) await this.ctx.storage.setAlarm(earliest);
    }
  }

  /** Ejecuta un paso diferido de un `flow`: manda el texto y lo registra en el hilo. */
  async runFlowStep(payload: unknown): Promise<void> {
    let p: any = payload;
    if (typeof p === "string") {
      try { p = JSON.parse(p); } catch { return; }
    }
    if (!p?.channel || !p?.channelUserId || (!p?.text && !p?.resource)) return;
    try {
      let media: ResourceMediaOpts = {};
      if (p.resource) {
        const { SettingsRepo, SETTING_KEYS } = await import("./db/settings");
        const { parseResourceLibrary, findResource, resourceMediaOf } = await import("./resources/library");
        const lib = parseResourceLibrary(await new SettingsRepo(new Db(this.env.DB)).get(SETTING_KEYS.resourceLibrary));
        const r = findResource(lib, String(p.resource));
        if (r) media = resourceMediaOf(r);
      }
      await sendReplyCapped(p.channel as ChannelId, p.channelUserId, [String(p.text ?? "")], this.env, media);
      if (p.conversationId && String(p.text ?? "").trim()) {
        await new MessagesRepo(new Db(this.env.DB)).append(p.conversationId, "assistant", String(p.text));
      }
    } catch (e) {
      console.warn("[runFlowStep] falló (fail-open):", e);
    }
  }

  /**
   * El negocio respondió al cliente DESDE FUERA del panel (app nativa de
   * Instagram/Messenger/WhatsApp, u otra herramienta). Lo registramos en el
   * hilo como `owner` para que el CRM muestre la conversación completa, y
   * pausamos el bot HASTA QUE EL DUEÑO LO REACTIVE (pausa indefinida).
   *
   * De-duplicación: el bot y el panel también producen "echo" — si un mensaje
   * idéntico (assistant/owner) se guardó hace < 3 min, este echo es esa misma
   * respuesta que vuelve por el webhook y se ignora.
   */
  async recordOwnerEcho(payload: AgentIncomingPayload): Promise<{ acknowledged: true }> {
    const text = (payload.text ?? "").trim();
    // Un eco puede ser solo media (sticker/foto/audio). Guardamos un marcador
    // para que el hilo lo muestre: lo importante es que el dueño respondió.
    const marker = text || (payload.imageUrl ? "[imagen]" : payload.audioUrl ? "[audio]" : "");
    if (!marker) return { acknowledged: true };

    const db = new Db(this.env.DB);
    const convs = new ConversationsRepo(db);
    const conv = await convs.getOrCreate(
      payload.channel,
      payload.channelUserId,
      payload.displayName,
    );
    const msgs = new MessagesRepo(db);

    const recent = await msgs.lastN(conv.id, 10);
    const cutoff = Date.now() - 3 * 60 * 1000;
    const isDup = recent.some(
      (m) =>
        (m.role === "assistant" || m.role === "owner") &&
        m.content.trim() === marker &&
        (m.created_at ?? 0) >= cutoff,
    );
    if (isDup) {
      console.log(`[recordOwnerEcho] duplicado ignorado (conv ${conv.id})`);
      return { acknowledged: true };
    }

    // `assistant` = lo mandó el bot o una automatización (respuesta de comentario,
    // campaña…). Se registra igual para que el hilo del panel muestre TODO lo
    // enviado, pero NO es un takeover humano: no pausa el bot.
    const echoRole: "owner" | "assistant" = payload.echoRole === "assistant" ? "assistant" : "owner";
    await msgs.append(conv.id, echoRole, marker);
    await convs.touchLastMessage(conv.id);

    if (echoRole === "assistant") {
      console.log(`[recordOwnerEcho] mensaje del bot/automatización registrado (conv ${conv.id}), sin pausa`);
      return { acknowledged: true };
    }

    // Un contacto bloqueado se queda bloqueado: registrar su mensaje no cambia
    // la pausa (el bloqueo manda).
    if (await isContactBlocked(this.env, conv.channel, conv.channel_user_id)) {
      console.log(`[recordOwnerEcho] contacto bloqueado, se registra sin tocar la pausa (conv ${conv.id})`);
      return { acknowledged: true };
    }

    await convs.setPausedUntil(conv.id, PAUSE_INDEFINITE);
    console.log(`[recordOwnerEcho] respuesta manual registrada + bot pausado hasta reactivar (conv ${conv.id})`);
    return { acknowledged: true };
  }

  /**
   * Called by the agents SDK scheduler when the msg-buffer task fires.
   * Processes accumulated messages as one input, runs the LLM loop, and
   * sends the chunked reply over the channel adapter.
   */
  async processBuffer(): Promise<void> {
    const buffered = [...this.state.pendingMessages];
    this.setState({ ...this.state, pendingMessages: [] });
    if (buffered.length === 0) return;

    const combined = buffered.map((m) => m.text).join("\n").trim();
    if (!combined) return;

    const db = new Db(this.env.DB);
    const msgs = new MessagesRepo(db);
    const convId = this.state.conversationId;
    if (!convId) {
      console.warn("[SupportAgent.processBuffer] no conversation_id in state");
      return;
    }

    // Re-chequeo de silencio: el dueño pudo pausar/bloquear entre el ingest y
    // este alarm. Si es así, el buffer se descarta y NO se gasta LLM.
    const silence = await isConversationSilent(this.env, convId);
    if (silence.silent) {
      console.log(
        `[processBuffer] conversación silenciada (${silence.blocked ? "bloqueada" : "pausada"}) — buffer descartado (conv ${convId})`,
      );
      return;
    }

    // El mensaje del cliente YA quedó persistido en ingest() (persistInbound):
    // acá NO se vuelve a guardar, para no duplicarlo. El hilo sale de la DB tal
    // cual, así que el turno actual es el último mensaje del usuario.
    const history = await msgs.lastN(convId, 20);
    const lastIsUser = history.length > 0 && history[history.length - 1].role === "user";
    const priors = lastIsUser ? history.slice(0, -1) : history;
    const aiMessages: any[] = priors.map((m) => ({
      role: (m.role === "tool"
        ? "user"
        : m.role === "owner"
          ? "assistant"
          : m.role) as "user" | "assistant",
      content: m.content,
    }));
    // Build the LAST user message multimodal-aware: if it carries an
    // [IMAGE_URL: ...] marker, attach the image.
    const lastUserMsg = lastIsUser ? history[history.length - 1] : undefined;
    let hadImage = false;
    if (lastUserMsg) {
      const imgMatch = lastUserMsg.content.match(/\[IMAGE_URL: (.+?)\]/);
      if (imgMatch) {
        // La referencia guardada trae el token enmascarado (Telegram) y/o el
        // prefijo `waha:`. `fetchMediaBytes` repone la credencial del canal y
        // baja los BYTES acá — el proveedor de IA ya no hace un fetch anónimo
        // que fallaba en WAHA (X-Api-Key) o con el token equivocado.
        const cleanText = lastUserMsg.content
          .replace(/\n?\[IMAGE_URL: .+?\]/, "")
          .trim();
        try {
          const { fetchMediaBytes } = await import("./media/fetchRef");
          const { bytes, contentType } = await fetchMediaBytes(imgMatch[1], this.env);
          aiMessages.push(
            buildMultimodalUserMessage(cleanText, { bytes, mediaType: contentType }),
          );
          hadImage = true;
        } catch (e) {
          console.error("[processBuffer] no se pudo descargar la imagen:", e);
          aiMessages.push({ role: "user", content: cleanText });
        }
      } else {
        aiMessages.push({ role: "user", content: lastUserMsg.content });
      }
    } else {
      // Carrera rara (p. ej. un echo del dueño cayó después del entrante): el
      // texto del buffer se manda igual como turno actual — nunca se pierde.
      aiMessages.push({ role: "user", content: combined });
    }

    // Build tools registry (tier-gated in buildTools)
    const tools = await buildTools({
      env: this.env,
      getConversationId: () => convId,
    });
    const toolNames = Object.keys(tools);
    // Resolve effective config (D1 settings overlaid on env defaults).
    const cfg = await resolveAgentConfig(this.env, toolNames);

    // ── Idioma del cliente (multi-idioma REAL) ──────────────────────────────
    // Antes esto vivía SOLO en el texto del prompt, así que un
    // `system_prompt_override` lo desactivaba en silencio y no había ninguna
    // verificación en código: el cliente escribía en portugués y el bot
    // contestaba en español. Ahora se detecta una vez por conversación y se
    // inyecta como bloque de sistema aparte (ver más abajo).
    const baseLang = baseLangCode(this.env.BOT_LANGUAGE);
    let clienteLang = (this.state.detectedLang ?? null) as LangCode | null;
    if (!clienteLang) clienteLang = detectLanguage(combined);
    // Multiidioma apagado ⇒ manda el idioma base aunque el cliente escriba en
    // otro idioma (contrato del toggle: apagado significa apagado).
    const effectiveLang: LangCode = cfg.multiIdiomaEnabled ? clienteLang ?? baseLang : baseLang;
    if (this.state.detectedLang !== clienteLang || this.state.lastUserLang !== effectiveLang) {
      this.setState({ ...this.state, detectedLang: clienteLang, lastUserLang: effectiveLang });
    }

    // Fase A: inyectar el canal real para enviarRecurso y respetar el toggle
    // allow_multimedia (si está off, la tool se quita del registro).
    if (this.state.channel) {
      const { setRecursoCtx, setTaxiCtx } = await import("./tools/index");
      setRecursoCtx(this.state.channel as ChannelId, this.state.channelUserId);
      // Nicho taxis: la última ubicación del cliente, para que solicitarTaxi
      // elija la base más cercana sin depender de que el modelo copie coordenadas.
      setTaxiCtx(this.state.lastLocation ?? null);
    }
    // Menú Extras (Kooni+): la Galería (enviarRecurso) solo está disponible si
    // el dueño la encendió Y permitió multimedia. Apagada → la tool se quita.
    if (cfg.allowMultimedia === false || !cfg.galeriaEnabled) {
      delete tools.enviarRecurso;
    }

    // Honor the dashboard's tool toggles: the prompt already only advertises
    // enabled tools (settings-loader), so the registry must match.
    const enabledTools = Object.fromEntries(
      Object.entries(tools).filter(([name]) => cfg.enabledToolNames.includes(name)),
    );

    // Select tier: honor an explicit override, otherwise auto-select. The active
    // provider (Anthropic default | OpenAI) maps the tier to a concrete model id.
    let tier: Tier =
      cfg.modelOverride === "haiku"
        ? "fast"
        : cfg.modelOverride === "sonnet"
          ? "smart"
          : selectModel({
              toolCallsInLast2Turns: this.state.toolCallsInLast2Turns,
              lastUserText: combined,
              lastUserLang: effectiveLang,
              hasImage: hadImage,
              imageRetryCount: this.state.imageRetryCount,
              lastSearchKbScore: this.state.lastSearchKbScore,
            });

    // Budget guard: at/over the monthly AI budget the bot keeps answering but
    // only on the cheap tier (never goes silent over money).
    if (cfg.monthlyBudgetUsd !== undefined && tier !== "fast") {
      const spent = await monthIaCostUsd(db);
      const guard = applyBudgetGuard(tier, spent, cfg.monthlyBudgetUsd);
      if (guard.downgraded) {
        console.warn(
          `[SupportAgent] monthly budget reached ($${spent.toFixed(2)}/$${cfg.monthlyBudgetUsd}) — downgrading to fast tier`,
        );
      }
      tier = guard.tier;
    }

    const { model, modelId, supportsPromptCache } = createModel(this.env, tier, cfg.llm);

    // Cache the (large, stable) system prompt with an ephemeral cache breakpoint.
    // Only the system block is cached — messages change every turn. Cache hits
    // show up in usage.cachedInputTokens (read below for cost accounting).
    // Prompt caching is Anthropic-only; on OpenAI we send the plain system block.
    const system: SystemModelMessage[] = [
      {
        role: "system",
        content: cfg.systemPrompt,
        ...(supportsPromptCache
          ? { providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } }
          : {}),
      },
    ];

    // Directiva de idioma: bloque de sistema PROPIO, deliberadamente fuera del
    // system prompt, para que gobierne aunque haya un `system_prompt_override`
    // activo (que reemplaza el prompt entero y con él las reglas de idioma).
    // Es lo que hace que el toggle de Multi-idioma signifique algo de verdad.
    system.push({
      role: "system",
      content: cfg.multiIdiomaEnabled
        ? clienteLang
          ? `<idioma>\nEl cliente escribe en ${LANG_LABEL[clienteLang]}. Respondé TODA la respuesta en ${LANG_LABEL[clienteLang]} — cada token, incluidos precios, horarios, nombres de autos y confirmaciones. No mezcles idiomas.\n</idioma>`
          : `<idioma>\nNo se pudo determinar con certeza el idioma del cliente. Usá el idioma base (${LANG_LABEL[baseLang]}); si el cliente escribe claramente en otro idioma, respondé en ESE idioma.\n</idioma>`
        : `<idioma>\nEl multi-idioma está APAGADO en esta instalación. Respondé SIEMPRE en ${LANG_LABEL[baseLang]}, aunque el cliente escriba en otro idioma.\n</idioma>`,
    });

    // Hora EXACTA + offset, en su propio bloque y recalculada cada turno. El
    // prompt grande solo lleva la FECHA (estable todo el día) para que su prefijo
    // sea cacheable por OpenAI; la hora precisa vive acá, así el bot sabe qué
    // hora es —clave para agendar citas y para "hoy"/"mañana"— sin romper el caché.
    const ahora = nowInTz(cfg.timezone);
    system.push({
      role: "system",
      content:
        `<hora_actual>\nAhora: ${ahora.timeLine} — ${ahora.dateLine}.\n` +
        `Usá esta hora REAL (no la de tu entrenamiento) para interpretar "hoy", "mañana", "en 2 horas" ` +
        `y para toda fecha u hora que pases a las tools (citas, seguimiento).\n</hora_actual>`,
    });

    // Customer memory (flywheel): facts extracted by the insights analyzer are
    // injected as a small UNCACHED system block, so a returning customer is
    // greeted by a bot that remembers them. The big prompt above stays cached.
    // Memory is an enhancement, never the critical path: if the lookup fails,
    // the reply still goes out.
    try {
      const facts = await new CustomerFactsRepo(db).forConversation(convId, 8);
      if (facts.length > 0) {
        system.push({
          role: "system",
          content: `<cliente>\nLo que ya sabes de este cliente (de conversaciones pasadas):\n${facts
            .map((f) => `- ${f.fact}`)
            .join("\n")}\n</cliente>`,
        });
      }
    } catch (e) {
      console.warn("[SupportAgent] customer facts lookup failed:", e);
    }

    // Etapa de la ficha en el panel (kanban): si el dueño (o el propio bot) ya
    // la movió, el bot lo tiene en cuenta para dar continuidad. `entrada` = sin
    // clasificar → no se le dice nada. Enhancement, nunca crítico.
    try {
      const { LeadsRepo } = await import("./db/leads");
      const lead = await new LeadsRepo(db).byConversation(convId);
      if (lead && lead.status !== "entrada") {
        const label: Record<string, string> = {
          new: "con interés (nuevo)",
          contacted: "en conversación / contactado",
          sold: "ganado (compró o agendó)",
          lost: "perdido / se enfrió",
        };
        const notaReciente = (lead.notes ?? "").split("\n").slice(-1)[0]?.trim();
        system.push({
          role: "system",
          content:
            `<ficha_panel>\nEste contacto está marcado como "${label[lead.status] ?? lead.status}" en el panel.` +
            (notaReciente ? `\nÚltima nota: ${notaReciente}` : "") +
            `\nRetomá desde ahí. Si la situación cambió (avanzó, se comprometió, o se enfrió), usá moverLead.\n</ficha_panel>`,
        });
      }
    } catch (e) {
      console.warn("[SupportAgent] lead stage lookup failed:", e);
    }

    // Inventario de autos (Web Sync "modo inventario" o CSV del panel): si hay
    // autos cargados, el bot DEBE contestar con ellos — nunca de memoria ni con
    // el texto de la KB. Si se espera inventario (URLs de Web Sync o giro
    // concesionario) pero el listado está vacío, se le prohíbe inventar.
    try {
      const { SettingsRepo, SETTING_KEYS } = await import("./db/settings");
      const { loadVehicleStore, listStoredVehicles } = await import("./kb/inventory");
      const { inventoryHintBlock } = await import("./kb/inventoryHint");
      const wsUrls = (await new SettingsRepo(db).get(SETTING_KEYS.webSyncUrls)) ?? "";
      const concesionario = (this.env.BOT_NICHE ?? "").trim().toLowerCase() === "concesionario";
      const vehicles = listStoredVehicles(await loadVehicleStore(db));
      const hint = inventoryHintBlock({ vehicles, expectsInventory: Boolean(wsUrls.trim()) || concesionario });
      if (hint) system.push({ role: "system", content: hint });
    } catch (e) {
      console.warn("[SupportAgent] inventory hint lookup failed:", e);
    }

    let assistantText = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedTokens = 0;
    let toolCallCount = 0;
    let toolCallsMade: { toolName: string; input: unknown }[] = [];
    let usedModelId = modelId;

    // Corre el loop del LLM con un modelo dado; deja los resultados en las vars.
    const attempt = async (m: any) => {
      const result = streamText({
        model: m,
        system,
        messages: aiMessages,
        tools: enabledTools,
        stopWhen: ({ steps }) => steps.length >= 6,
        ...(cfg.temperature !== undefined ? { temperature: cfg.temperature } : {}),
      });
      let text = "";
      for await (const chunk of result.textStream) {
        text += chunk;
      }
      assistantText = text;
      const usage = await result.usage;
      inputTokens = usage?.inputTokens ?? 0;
      outputTokens = usage?.outputTokens ?? 0;
      cachedTokens = usage?.cachedInputTokens ?? 0;
      const steps = await result.steps;
      toolCallCount = steps.reduce((n, s) => n + (s.toolCalls?.length ?? 0), 0);
      // Persist what the agent DID (not just what it said): tool name + input,
      // feeding the dashboard's thread chips, stats and the Mi Agente counters.
      toolCallsMade = steps.flatMap((s) =>
        (s.toolCalls ?? []).map((tc: any) => ({
          toolName: tc.toolName as string,
          input: tc.input,
        })),
      );
    };

    try {
      await attempt(model);
    } catch (e: any) {
      // FAILOVER con backoff: en ráfagas (historias) el primario suele dar un
      // rate-limit TRANSITORIO — esperar con jitter y reintentar resuelve la
      // mayoría; si no, se prueba el proveedor alterno (también con un segundo
      // intento). El jitter des-sincroniza mensajes que llegaron en el mismo
      // segundo. El bot no puede quedarse mudo el día del evento.
      console.error("[SupportAgent.processBuffer] streamText failed:", e);
      const backoff = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const { fallbackModel } = await import("./llm/provider");
      const primary = createModel(this.env, tier, cfg.llm);
      const fb = fallbackModel(this.env, tier, primary.provider);
      let ok = false;

      await backoff(2000 + Math.floor(Math.random() * 1500));
      try {
        await attempt(model);
        ok = true;
      } catch (e1: any) {
        console.error("[SupportAgent.processBuffer] primary retry failed:", e1);
      }

      if (!ok && fb) {
        console.warn(
          `[SupportAgent] failover ${primary.provider} → ${fb.provider}/${fb.modelId}`,
        );
        try {
          await attempt(fb.model);
          usedModelId = fb.modelId;
          ok = true;
        } catch (e2: any) {
          console.error("[SupportAgent.processBuffer] fallback failed:", e2);
          await backoff(2500 + Math.floor(Math.random() * 1500));
          try {
            await attempt(fb.model);
            usedModelId = fb.modelId;
            ok = true;
          } catch (e3: any) {
            console.error("[SupportAgent.processBuffer] fallback retry failed:", e3);
          }
        }
      }

      if (!ok) {
        assistantText = "Algo falló de mi lado, intenta de nuevo en un momento.";
      }
    }

    // Nunca mandar ni guardar un mensaje vacío: si el modelo devolvió texto
    // vacío (solo tool calls sin texto final, o respuesta en blanco), usa un
    // fallback en vez de dejar al cliente con silencio y a un ticket sin crear.
    if (!assistantText || !assistantText.trim()) {
      assistantText = "Algo falló de mi lado, intenta de nuevo en un momento.";
    }

    // Links Markdown → texto plano con URL visible. Se guarda ya normalizado
    // para que el CRM y el canal muestren lo mismo (y queden clickeables).
    assistantText = toPlainLinks(assistantText);

    // Fase A: adjuntar botones del menú (si están configurados). Se calcula
    // ANTES de persistir el mensaje para poder guardarlos junto con él
    // (§ V Fase 3 — si no, el panel nunca sabría qué botones se mandaron).
    let buttons: ReplyButton[] | undefined;
    if (cfg.menuButtons.length > 0 && cfg.allowMultimedia) {
      buttons = cfg.menuButtons;
    }

    // Persist assistant message (with usage + model_used + tool calls)
    const assistantMsgId = await msgs.append(convId, "assistant", assistantText, {
      modelUsed: usedModelId,
      inputTokens,
      outputTokens,
      cachedInputTokens: cachedTokens,
      toolCalls: toolCallsMade.length > 0 ? toolCallsMade : undefined,
    });
    if (buttons && buttons.length > 0) {
      try {
        await msgs.saveButtons(assistantMsgId, buttons);
      } catch (e) {
        // Nunca bloquear el envío por esto: sin fila en message_buttons, el
        // panel simplemente no muestra el chip — el cliente igual los recibe.
        console.warn("[processBuffer] no se pudieron guardar los botones:", e);
      }
    }

    // Update state for next turn
    this.setState({
      ...this.state,
      toolCallsInLast2Turns: toolCallCount,
    });

    // Toda conversación real deja una ficha en el panel: si el bot no capturó ni
    // movió un lead, queda como "comunicación de entrada" para que el dueño la
    // vea en el kanban y la clasifique (o lo haga el bot después). Best-effort.
    try {
      const { LeadsRepo } = await import("./db/leads");
      await new LeadsRepo(db).ensureEntrada(convId);
    } catch (e) {
      console.warn("[processBuffer] ensureEntrada falló:", e);
    }

    // Chunk + send via the channel adapter
    const chunks = chunkReply(assistantText, cfg.maxChunks);
    const channel = this.state.channel as ChannelId;
    const adapter = pickAdapter(channel);

    await adapter.sendReply(
      {
        channel,
        channelUserId: this.state.channelUserId,
        chunks,
        interChunkDelayMs: cfg.interChunkDelayMs,
        // En grupos de Telegram, responder en el hilo del mensaje entrante.
        ...(this.state.lastReplyToMessageId != null ? { replyToMessageId: this.state.lastReplyToMessageId } : {}),
        ...(buttons && buttons.length ? { buttons } : {}),
      },
      this.env,
    );

    // Vigilante (menú Extras): revisa el ánimo del chat y, si algo peligra
    // (cliente molesto / venta en riesgo / a punto de irse), avisa al dueño
    // SIN pasarle el chat — el bot sigue atendiendo. Best-effort: si falla,
    // no bloquea la respuesta.
    if (cfg.vigilanteEnabled) {
      const { runVigilanteCheck } = await import("./vigilante");
      runVigilanteCheck(this.env, convId).catch((e) =>
        console.error("[vigilante]", e),
      );
    }

    console.log(
      `[SupportAgent.processBuffer] sent ${chunks.length} chunks, model=${usedModelId}, cost=$${costOfUsage(
        usedModelId,
        { input: inputTokens, cached: cachedTokens, output: outputTokens },
      ).toFixed(5)}`,
    );
  }
}
