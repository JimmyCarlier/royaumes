import type { StoredEvent } from '../event-store/event-store'

/**
 * Source d'un canal qui ne lit pas le journal, fournie par le module qui le déclare.
 * Ses éléments sont présentés sous la forme d'événements, identifiés par leur position,
 * afin que l'interface les reçoive comme ceux des autres canaux.
 */
export interface ChannelSource {
  /** Éléments postérieurs à une position, dans l'ordre croissant des positions. */
  read(after: number): Promise<StoredEvent[]>
  /** Position de départ d'un abonné qui n'en fournit aucune. */
  start(): Promise<number>
}

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
  /**
   * Canal global : il ne correspond à aucun flux, mais suit, dans tout le journal, les
   * événements de certains types. Ses événements sont identifiés par leur position, et non
   * par leur version, et il ne transmet que les événements postérieurs à son ouverture.
   */
  global?: { types: string[] }
  /**
   * Canal alimenté par une source propre au module, et non par le journal : par exemple
   * une table, pour un module qui n'enregistre pas d'événements.
   */
  source?: ChannelSource
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
