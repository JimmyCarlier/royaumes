/**
 * Règles de la messagerie de la Taverne.
 * La Taverne n'utilise pas l'Event Sourcing : ses règles se réduisent à la validation
 * d'un message et à la limitation du nombre de messages d'un joueur.
 */

/** Longueur maximale d'un message, en caractères. */
export const MESSAGE_MAX_LENGTH = 280

/** Nombre maximal de messages d'un même joueur pendant la fenêtre de limitation. */
export const RATE_LIMIT = { messages: 5, windowMs: 30_000 }

export type MessageError =
  | { code: 'EMPTY_MESSAGE' }
  | { code: 'MESSAGE_TOO_LONG'; max: number }
  | { code: 'TOO_MANY_MESSAGES'; retryAfterMs: number }

/**
 * Vérifie le texte d'un message et le normalise : les espaces de début et de fin sont
 * retirés. Renvoie le texte normalisé, ou l'erreur.
 */
export function checkBody(
  body: string,
): { ok: true; body: string } | { ok: false; error: MessageError } {
  const trimmed = body.trim()
  if (trimmed.length === 0) return { ok: false, error: { code: 'EMPTY_MESSAGE' } }
  // La longueur est comptée en caractères, et non en unités UTF-16 : un symbole
  // comme « 🍺 » compte pour un seul caractère.
  if ([...trimmed].length > MESSAGE_MAX_LENGTH) {
    return { ok: false, error: { code: 'MESSAGE_TOO_LONG', max: MESSAGE_MAX_LENGTH } }
  }
  return { ok: true, body: trimmed }
}

/**
 * Applique la limitation : recent contient les dates des messages du joueur publiés
 * pendant la fenêtre qui précède now. Renvoie null si le joueur peut publier,
 * sinon l'erreur, avec le délai à attendre.
 */
export function checkRate(recent: number[], now: number): MessageError | null {
  if (recent.length < RATE_LIMIT.messages) return null
  // Le joueur pourra publier lorsque le plus ancien message de la fenêtre en sortira.
  const oldest = Math.min(...recent)
  return { code: 'TOO_MANY_MESSAGES', retryAfterMs: oldest + RATE_LIMIT.windowMs - now }
}
