import { Db } from "./client";
import { stripSpecialCharacters } from "../utils/keyword-matcher";

/**
 * Dedup por huella de comentario (post + autor + texto normalizado).
 *
 * Por qué existe: Zernio a veces reentrega el MISMO comentario con un
 * comment.id distinto (observado en producción: hasta 7 ids distintos para un
 * mismo comentario). El dedup clásico por comment_id (processed_comments) no
 * detecta esas reentregas → el bot respondía varias veces al mismo comentario.
 *
 * La huella es estable entre entregas del mismo comentario, y el claim es
 * atómico (INSERT OR IGNORE sobre la PK dedup_key): solo UNA ejecución gana,
 * así que un comentario recibe UN único mensaje de respuesta, siempre.
 */

/**
 * Huella estable de un comentario: post + autor (id o username) + texto
 * normalizado (sin emojis/especiales, minúsculas, espacios colapsados).
 * Un mismo comentario reentregado por Zernio (con id distinto) produce la
 * MISMA huella; dos comentarios distintos de personas distintas no colisionan
 * (aunque digan lo mismo, cambia el autor; si son del mismo autor en el mismo
 * post con el mismo texto, es el mismo comentario en la práctica).
 */
export function commentFingerprint(postId: string, authorKey: string, text: string): string {
  const norm = stripSpecialCharacters(text ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const author = (authorKey ?? "").trim().toLowerCase();
  return `${postId ?? ""}|${author}|${norm}`;
}

export class FingerprintsRepo {
  constructor(private readonly db: Db) {}

  /** ¿Ya se respondió (o está en proceso) a este comentario, por huella? */
  async exists(dedupKey: string): Promise<boolean> {
    const row = await this.db.first<{ n: number }>(
      "SELECT COUNT(*) as n FROM comment_fingerprints WHERE dedup_key = ?",
      [dedupKey],
    );
    return (row?.n ?? 0) > 0;
  }

  /**
   * Claim atómico por huella: solo UNA ejecución gana (INSERT OR IGNORE sobre
   * la PK). Devuelve true si ganamos (podemos responder); false si otro
   * delivery del mismo comentario ya lo respondió o está respondiendo.
   */
  async claim(dedupKey: string, ruleId: string, commentId: string, at: number): Promise<boolean> {
    const res = await this.db.run(
      `INSERT INTO comment_fingerprints (dedup_key, rule_id, comment_id, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(dedup_key) DO NOTHING`,
      [dedupKey, ruleId, commentId, at],
    );
    return res.meta?.changes === 1;
  }

  /**
   * Lee el registro de una huella: qué comment_id la tomó y cuándo. Sirve para
   * decidir si una reentrega puede completar una pata pendiente usando el id
   * ORIGINAL (el que tiene el estado en `processed_comments`), no el id nuevo
   * que Zernio inventó en la reentrega.
   */
  async get(dedupKey: string): Promise<{ ruleId: string; commentId: string; createdAt: number } | null> {
    const row = await this.db.first<{ rule_id: string; comment_id: string; created_at: number }>(
      "SELECT rule_id, comment_id, created_at FROM comment_fingerprints WHERE dedup_key = ?",
      [dedupKey],
    );
    return row ? { ruleId: row.rule_id, commentId: row.comment_id, createdAt: row.created_at } : null;
  }

  /**
   * Suelta un claim cuando NO se envió nada (falló el DM, la API rechazó, se
   * agotó un límite…). Sin esto el claim queda tomado para siempre y CUALQUIER
   * reentrega posterior del mismo comentario se descarta como "deduplicado":
   * el comentario nunca recibe respuesta aunque la automatización la tenga.
   */
  async release(dedupKey: string): Promise<void> {
    await this.db.run("DELETE FROM comment_fingerprints WHERE dedup_key = ?", [dedupKey]);
  }
}
