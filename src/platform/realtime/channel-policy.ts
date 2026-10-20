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
  /**
   * Canal discret : le flux ne transmet que le type et la version de chaque événement,
   * jamais ses données. Chaque abonné relit alors sa propre vue auprès de l'API.
   */
  redact?: boolean
}

/**
 * Renvoie la règle qui autorise un joueur à écouter un canal, ou null si l'accès est refusé.
 * Un canal qu'aucune règle ne couvre est refusé : l'accès est fermé par défaut.
 */
export async function authorize(
  policies: ChannelPolicy[],
  channel: string,
  userId: string,
): Promise<ChannelPolicy | null> {
  const policy = policies.find((p) => channel.startsWith(p.prefix))
  if (!policy) return null
  return (await policy.canSubscribe(channel, userId)) ? policy : null
}
