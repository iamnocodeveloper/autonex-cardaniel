import type { Env } from "../env";
import { resolveZernioCredentials } from "./zernioCredentials";

/** Cuenta social conectada en Zernio (respuesta de GET /v1/accounts). */
export interface ZernioAccount {
  id: string;
  platform: string;
  username?: string;
  displayName?: string;
  profilePicture?: string;
  profileUrl?: string;
  isActive?: boolean;
  needsReconnection?: boolean;
  followersCount?: number;
  enabled?: boolean;
}

const DEFAULT_BASE = "https://zernio.com/api";

/**
 * Lista las cuentas sociales conectadas en Zernio (Instagram, TikTok, etc.)
 * usando la API key del secret ZERNIO_API_KEY. Nunca truena: si no hay key o
 * la API falla, devuelve [] (la vista muestra el estado sin cuentas).
 */
export async function listZernioAccounts(env: Env): Promise<ZernioAccount[]> {
  const { apiKey } = await resolveZernioCredentials(env);
  if (!apiKey) return [];
  const base = env.ZERNIO_API_BASE_URL ?? DEFAULT_BASE;
  try {
    const res = await fetch(`${base}/v1/accounts`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`[zernio] list accounts falló: ${res.status}`);
      return [];
    }
    const json = (await res.json()) as { accounts?: unknown[] };
    const accounts = Array.isArray(json.accounts) ? json.accounts : [];
    return accounts
      .map((a) => a as Record<string, unknown>)
      .filter((a) => a && typeof a === "object")
      .map((a) => ({
        id: String(a._id ?? ""),
        platform: String(a.platform ?? "?"),
        username: a.username ? String(a.username) : undefined,
        displayName: a.displayName ? String(a.displayName) : undefined,
        profilePicture: a.profilePicture ? String(a.profilePicture) : undefined,
        profileUrl: a.profileUrl ? String(a.profileUrl) : undefined,
        isActive: Boolean(a.isActive),
        needsReconnection: Boolean(a.needsReconnection),
        followersCount: typeof a.followersCount === "number" ? a.followersCount : undefined,
        enabled: typeof a.enabled === "boolean" ? a.enabled : true,
      }));
  } catch (e) {
    console.warn("[zernio] list accounts error:", e);
    return [];
  }
}

/**
 * Resultado de verificar si un usuario sigue la cuenta.
 *
 *   yes     → Meta confirma que SÍ sigue.
 *   no      → Meta confirma que NO sigue.
 *   unknown → no se pudo resolver (consent_required, la cuenta no usa el inbox
 *             de Instagram, error transitorio, o la plataforma no soporta el
 *             endpoint — p. ej. Facebook devuelve 404).
 *
 * Es un trío y no un booleano a propósito: "no lo sé" NO es "no me sigue".
 * Confundirlos es lo que dejaba a un seguidor real en un bucle de "aún no me
 * sigues" (ver `autoReplyOnDm` en zernio.ts).
 */
export type FollowStatus = "yes" | "no" | "unknown";

export interface FollowStatusResult {
  status: FollowStatus;
  /** `unavailableReason` de Zernio o el error local (para logs/diagnóstico). */
  reason?: string;
  username?: string;
}

/**
 * GET /v1/accounts/{accountId}/follow-status/{userId}
 *
 * `userId` es el IGSID que Meta manda en el webhook (`sender.id` en
 * message.received, `comment.author.id` en comment.received).
 *
 * IMPORTANTE — `refresh=true`: Zernio cachea la respuesta por (cuenta, usuario).
 * Al confirmar un follow gate hay que pedir refresco, si no un follow de hace
 * un minuto sigue leyéndose como "no" desde caché y el bot vuelve a pedir el
 * follow a alguien que ya siguió.
 */
export async function checkInstagramFollowStatus(
  env: Env,
  opts: { accountId?: string; userId?: string; refresh?: boolean },
): Promise<FollowStatusResult> {
  const { apiKey } = await resolveZernioCredentials(env);
  if (!apiKey || !opts.accountId || !opts.userId) {
    return { status: "unknown", reason: "missing_params" };
  }
  const base = env.ZERNIO_API_BASE_URL ?? DEFAULT_BASE;
  const qs = opts.refresh ? "?refresh=true" : "";
  try {
    const res = await fetch(
      `${base}/v1/accounts/${encodeURIComponent(opts.accountId)}/follow-status/${encodeURIComponent(opts.userId)}${qs}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) {
      // 400/404: la cuenta o la plataforma no soportan follow-status.
      return { status: "unknown", reason: `http_${res.status}` };
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, any>;
    const data = (json?.data ?? json) as Record<string, any>;
    const username = data?.username ? String(data.username) : undefined;
    if (data?.isFollower === true) return { status: "yes", username };
    if (data?.isFollower === false) return { status: "no", username };
    return {
      status: "unknown",
      reason: data?.unavailableReason ? String(data.unavailableReason) : "unresolved",
      username,
    };
  } catch (e) {
    return { status: "unknown", reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Icono lucide por plataforma (para el panel). */
export function zernioPlatformIcon(platform: string): string {
  switch (platform.toLowerCase()) {
    case "instagram": return "instagram";
    case "tiktok": return "music-2";
    case "facebook": return "facebook";
    case "youtube": return "youtube";
    case "linkedin": return "linkedin";
    case "twitter":
    case "x": return "twitter";
    case "threads": return "at-sign";
    case "pinterest": return "pin";
    case "reddit": return "message-circle";
    case "bluesky": return "cloud";
    case "whatsapp": return "message-circle";
    case "telegram": return "send";
    case "discord": return "gamepad-2";
    default: return "globe";
  }
}

/** Nombre legible de la plataforma. */
export function zernioPlatformLabel(platform: string): string {
  const labels: Record<string, string> = {
    instagram: "Instagram",
    tiktok: "TikTok",
    facebook: "Facebook",
    youtube: "YouTube",
    linkedin: "LinkedIn",
    twitter: "X / Twitter",
    x: "X / Twitter",
    threads: "Threads",
    pinterest: "Pinterest",
    reddit: "Reddit",
    bluesky: "Bluesky",
    googlebusiness: "Google Business",
    telegram: "Telegram",
    snapchat: "Snapchat",
    discord: "Discord",
    slack: "Slack",
    whatsapp: "WhatsApp",
  };
  return labels[platform.toLowerCase()] ?? platform;
}
