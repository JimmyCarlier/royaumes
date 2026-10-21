/**
 * Règles de la présence dans la Taverne. Faute de connexion permanente, la présence repose
 * sur un signal envoyé régulièrement par le navigateur de chaque joueur.
 */

/** Intervalle entre deux signaux de présence, en millisecondes. */
export const HEARTBEAT_MS = 30_000

/**
 * Délai, en millisecondes, au-delà duquel un joueur sans signal est considéré comme parti.
 * Il laisse passer trois signaux manqués : un navigateur peut ralentir les minuteries d'un
 * onglet en arrière-plan, jusqu'à un déclenchement par minute.
 */
export const PRESENCE_TTL_MS = 120_000

/**
 * Instant avant lequel un signal est trop ancien : un joueur dont le dernier signal
 * est antérieur à cet instant est parti.
 */
export const staleBefore = (now: number) => now - PRESENCE_TTL_MS
