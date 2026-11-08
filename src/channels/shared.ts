export type ChannelId = "manychat" | "telegram" | "twilio" | "messenger" | "instagram" | "whatsapp" | "zernio" | "waha" | "mercadolibre" | "webchat";

export interface IncomingMessage {
  channel: ChannelId;
  channelUserId: string;
  displayName?: string;
  text?: string;
  audioUrl?: string;
  imageUrl?: string;
  /**
   * Ubicación compartida por el cliente (pin de WhatsApp). Lo usa el nicho de
   * taxis para calcular la base más cercana. Best-effort: no todos los canales
   * ni todos los builds la traen.
   */
  location?: { lat: number; lng: number; name?: string; address?: string };
  isOwnerMessage?: boolean;
  /**
   * El negocio respondió al cliente DESDE FUERA del panel (app nativa de
   * Instagram/Messenger/WhatsApp, u otra herramienta). No es un mensaje para
   * que el bot conteste: se registra en el hilo como `owner` y pausa el bot
   * (takeover). El webhook lo enruta con `recordOwnerEcho`, no con `ingest`.
   */
  ownerEcho?: boolean;
  /**
   * Con qué rol se registra un eco saliente en el hilo:
   *  - `owner`     → lo escribió una persona (app nativa o inbox del proveedor).
   *  - `assistant` → lo envió el bot o una automatización (respuesta de
   *                  comentario, campaña, etc.). Se registra para que el panel
   *                  muestre la conversación completa, pero NO pausa el bot.
   * Ausente = `owner`.
   */
  echoRole?: "owner" | "assistant";
  receivedAt: number;
  rawPayload: unknown;
  /** Para responder en el hilo del mensaje entrante (Telegram grupos). */
  replyToMessageId?: number;
}

export interface OutgoingReply {
  channel: ChannelId;
  channelUserId: string;
  chunks: string[];
  interChunkDelayMs?: number;
  /** Botones (inline keyboard / buttons) — solo se envían si el canal lo soporta. */
  buttons?: ReplyButton[];
  /** URL de imagen para adjuntar al primer chunk (si el canal lo soporta). */
  imageUrl?: string;
  /** URL de audio para adjuntar (si el canal lo soporta). */
  audioUrl?: string;
  /**
   * El audio es una NOTA DE VOZ (PTT) y no un archivo. En WhatsApp/WAHA se
   * envía por /api/sendVoice (con conversión a opus/ogg); en Telegram por
   * sendVoice. Si el canal no lo soporta, se manda como audio normal.
   */
  voice?: boolean;
  /** URL de un video para adjuntar al primer chunk (si el canal lo soporta). */
  videoUrl?: string;
  /** URL de un documento (PDF) para adjuntar al primer chunk (si el canal lo soporta). */
  documentUrl?: string;
  /** Nombre visible del archivo (ej. "Cotización-1234.pdf"). */
  documentName?: string;
  /** Para responder EN el hilo (Telegram grupos): message_id del mensaje entrante. */
  replyToMessageId?: number;
}

/** Botón de respuesta (Telegram inline_keyboard / Zernio buttons / etc.). */
export interface ReplyButton {
  text: string;         // etiqueta visible
  url?: string;         // botón de link (url)
  callback?: string;    // payload interno (callback_data / postback)
}

/** Qué soporta cada canal para el envío (para degradar con gracia). */
export const CHANNEL_CAPABILITIES: Record<ChannelId, { buttons: boolean; image: boolean; audio: boolean; voice: boolean; video: boolean; document: boolean }> = {
  telegram: { buttons: true, image: true, audio: true, voice: true, video: true, document: true },
  zernio: { buttons: true, image: true, audio: true, voice: false, video: true, document: true },
  manychat: { buttons: true, image: true, audio: false, voice: false, video: false, document: false },
  twilio: { buttons: false, image: true, audio: true, voice: false, video: false, document: false },
  whatsapp: { buttons: true, image: true, audio: true, voice: false, video: false, document: false },
  messenger: { buttons: true, image: true, audio: true, voice: false, video: false, document: false },
  instagram: { buttons: true, image: true, audio: true, voice: false, video: false, document: false },
  waha: { buttons: false, image: true, audio: true, voice: true, video: true, document: true },
  // MercadoLibre: preguntas y mensajería post-venta son texto plano. Sin
  // botones ni adjuntos por esta vía.
  mercadolibre: { buttons: false, image: false, audio: false, voice: false, video: false, document: false },
  webchat: { buttons: false, image: false, audio: false, voice: false, video: false, document: false },
};

export type PresenceState = "typing" | "recording" | "paused";

export interface ChannelAdapter {
  parseIncoming(request: Request, env: any): Promise<IncomingMessage>;
  sendReply(reply: OutgoingReply, env: any): Promise<void>;
  showTyping?(channelUserId: string, env: any): Promise<void>;
  /** Presencia ("escribiendo…", "grabando audio…") donde el canal lo soporte. */
  showPresence?(channelUserId: string, state: PresenceState, env: any): Promise<void>;
  /** Marca el mensaje entrante como leído (doble tilde) donde el canal lo soporte. */
  markSeen?(channelUserId: string, env: any): Promise<void>;
}
