import type { JoinRequest, Member, PlayerSituation, Role } from '../domain/guild'

/** Guilde, telle que la conserve le stockage. */
export interface GuildRecord {
  id: string
  name: string
  createdAt: number
}

/** Changement annoncé sur le canal d'une guilde. */
export interface ActivityRecord {
  id: number
  guildId: string
  type: string
  at: number
}

/**
 * Levée par le stockage lorsqu'une contrainte d'unicité refuse une écriture : une autre
 * action, simultanée, a été enregistrée la première. Le service la traduit en erreur métier.
 * - name : une guilde porte déjà ce nom (règle 2) ;
 * - member : le joueur est déjà membre d'une guilde (règle 3) ;
 * - request : le joueur a déjà une demande (règle 6).
 */
export class GuildConflict extends Error {
  constructor(readonly constraint: 'name' | 'member' | 'request') {
    super(`Conflit d'unicité : ${constraint}`)
    this.name = 'GuildConflict'
  }
}

/** Lectures du stockage, utilisables dans une transaction comme en dehors. */
export interface GuildReads {
  /** Guilde du joueur et sa demande, expirée ou non. */
  situation(playerId: string): Promise<PlayerSituation>
  /**
   * Guilde désignée par son identifiant ; null si elle n'existe pas. Avec lock, la guilde est
   * verrouillée jusqu'à la fin de la transaction : deux actions sur la même guilde sont
   * traitées l'une après l'autre.
   */
  findGuild(guildId: string, options?: { lock?: boolean }): Promise<GuildRecord | null>
  members(guildId: string): Promise<Member[]>
  requestsOf(guildId: string): Promise<JoinRequest[]>
  findRequest(requestId: string): Promise<JoinRequest | null>
}

/** Lectures et écritures d'une transaction : elles sont validées ensemble, ou pas du tout. */
export interface GuildUnitOfWork extends GuildReads {
  createGuild(guild: GuildRecord & { nameKey: string }): Promise<void>
  addMember(guildId: string, member: Member): Promise<void>
  removeMember(playerId: string): Promise<void>
  setRole(playerId: string, role: Role): Promise<void>
  /** Supprime une guilde dissoute, et les demandes qui lui étaient adressées. */
  deleteGuild(guildId: string): Promise<void>
  addRequest(request: JoinRequest): Promise<void>
  /** Supprime une demande ; renvoie faux si elle n'existait pas. */
  deleteRequest(requestId: string): Promise<boolean>
  recordActivity(guildId: string, type: string, at: number): Promise<void>
}

/**
 * Port de persistance des Guildes, défini par la couche application.
 * Il n'est pas fondé sur des événements : les lignes sont insérées, modifiées et supprimées.
 */
export interface GuildRepository extends GuildReads {
  /** Exécute un traitement dans une transaction ; une erreur levée l'annule entièrement. */
  atomically<T>(work: (unit: GuildUnitOfWork) => Promise<T>): Promise<T>
  /** Toutes les guildes, avec leurs membres. */
  allWithMembers(): Promise<{ guild: GuildRecord; members: Member[] }[]>
  /** Supprime les demandes envoyées avant l'instant before ; renvoie leur nombre. */
  removeRequestsSentBefore(before: number): Promise<number>
  /** Changements d'une guilde postérieurs à un identifiant, dans l'ordre. */
  activityAfter(guildId: string, afterId: number, limit: number): Promise<ActivityRecord[]>
  /** Identifiant du dernier changement enregistré, toutes guildes confondues ; 0 s'il n'y en a aucun. */
  lastActivityId(): Promise<number>
  /** Supprime les changements antérieurs à l'instant before ; renvoie leur nombre. */
  removeActivityBefore(before: number): Promise<number>
}
