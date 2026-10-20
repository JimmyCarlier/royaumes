/**
 * Règle d'accès aux canaux temps réel d'un module.
 * Chaque module déclare qui a le droit d'écouter ses canaux ; la plateforme, qui ne connaît
 * aucun module, reçoit ces règles de la racine de composition.
 */
export interface ChannelPolicy {
  /** Préfixe des canaux concernés, par exemple « village- ». */
  prefix: string
  /** Indique si un joueur a le droit d'écouter un canal portant ce préfixe. */
  canSubscribe(channel: string, userId: string): boolean | Promise<boolean>
}

/**
 * Indique si un joueur peut écouter un canal.
 * Un canal qu'aucune règle ne couvre est refusé : l'accès est fermé par défaut.
 */
export async function isAllowed(
  policies: ChannelPolicy[],
  channel: string,
  userId: string,
): Promise<boolean> {
  const policy = policies.find((p) => channel.startsWith(p.prefix))
  return policy ? policy.canSubscribe(channel, userId) : false
}
