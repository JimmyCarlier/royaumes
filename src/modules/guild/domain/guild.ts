/**
 * Règles des Guildes. Les guildes sont conservées dans des tables ordinaires :
 * le domaine ne produit pas d'événements, il vérifie une action à partir de la situation
 * que lui présente le service.
 * Ce fichier est écrit en TypeScript pur : il n'importe aucune bibliothèque.
 */

/** Longueurs minimale et maximale du nom d'une guilde, en caractères (règle 1). */
export const NAME_MIN = 3
export const NAME_MAX = 24
/** Nombre maximal de membres d'une guilde, chef compris (règle 5). */
export const MAX_MEMBERS = 8

/** Durée de validité d'une demande d'adhésion : 72 heures, en millisecondes (règle 8). */
export const REQUEST_TTL_MS = 72 * 60 * 60_000

export type Role = 'leader' | 'member'

export interface Member {
  playerId: string
  name: string
  role: Role
  joinedAt: number
}

/** Demande d'adhésion en attente de la décision du chef. */
export interface JoinRequest {
  id: string
  guildId: string
  playerId: string
  playerName: string
  sentAt: number
}

/** Situation d'un joueur, lue par le service avant de décider d'une action. */
export interface PlayerSituation {
  /** Guilde du joueur ; null s'il n'appartient à aucune guilde. */
  guildId: string | null
  /** Demande envoyée par le joueur, expirée ou non ; null s'il n'en a envoyé aucune. */
  request: JoinRequest | null
}

export type GuildError =
  | { code: 'INVALID_NAME'; min: number; max: number }
  | { code: 'NAME_TAKEN' }
  | { code: 'ALREADY_MEMBER' }
  | { code: 'NOT_A_MEMBER' }
  | { code: 'GUILD_NOT_FOUND' }
  | { code: 'GUILD_FULL'; max: number }
  | { code: 'REQUEST_PENDING' }
  | { code: 'NO_PENDING_REQUEST' }
  | { code: 'REQUEST_NOT_FOUND' }
  | { code: 'REQUEST_EXPIRED' }
  | { code: 'NOT_LEADER' }
  | { code: 'CANNOT_KICK_SELF' }
  | { code: 'MEMBER_NOT_FOUND' }

/** Résultat d'une vérification : null si l'action est permise, sinon l'erreur. */
export type Check = GuildError | null

/**
 * Vérifie et normalise le nom d'une guilde : les espaces de début et de fin sont retirés,
 * les espaces intérieurs consécutifs réduits à un seul. La longueur est comptée en caractères.
 * Renvoie le nom normalisé, ou l'erreur.
 */
export function checkName(
  raw: string,
): { ok: true; name: string; key: string } | { ok: false; error: GuildError } {
  const name = raw.trim().replace(/\s+/g, ' ')
  const length = [...name].length
  if (length < NAME_MIN || length > NAME_MAX) {
    return { ok: false, error: { code: 'INVALID_NAME', min: NAME_MIN, max: NAME_MAX } }
  }
  return { ok: true, name, key: nameKey(name) }
}

/**
 * Clé d'unicité d'un nom : deux noms qui ne diffèrent que par les majuscules ont la même clé.
 * La base porte une contrainte d'unicité sur cette clé, qui protège la règle 2 même lorsque
 * deux joueurs fondent une guilde au même instant.
 */
export const nameKey = (name: string) => name.toLocaleLowerCase('fr')

/** Fonder une guilde : le joueur ne doit appartenir à aucune guilde (règle 3). */
export function checkFound(situation: PlayerSituation): Check {
  return situation.guildId ? { code: 'ALREADY_MEMBER' } : null
}

/** Rôle d'un joueur dans une guilde ; null s'il n'en est pas membre. */
const roleOf = (members: Member[], playerId: string) =>
  members.find((member) => member.playerId === playerId)?.role ?? null

/** Seul le chef décide pour la guilde (règles 4 et 7). */
export function checkLeader(members: Member[], actorId: string): Check {
  return roleOf(members, actorId) === 'leader' ? null : { code: 'NOT_LEADER' }
}

/** Instant auquel une demande expire. */
export const expiresAt = (request: JoinRequest) => request.sentAt + REQUEST_TTL_MS

/** Une demande expire 72 heures après son envoi : elle ne peut plus être acceptée (règle 8). */
export const isExpired = (request: JoinRequest, now: number) => now >= expiresAt(request)

/** Demande encore en attente du joueur ; une demande expirée ne compte plus. */
export const pendingRequest = (situation: PlayerSituation, now: number) =>
  situation.request && !isExpired(situation.request, now) ? situation.request : null

/**
 * Demander à rejoindre une guilde : le joueur n'appartient à aucune guilde (règle 3), n'a
 * aucune autre demande en attente (règle 6), et la guilde n'est pas complète (règle 5).
 */
export function checkRequest(situation: PlayerSituation, members: Member[], now: number): Check {
  if (situation.guildId) return { code: 'ALREADY_MEMBER' }
  if (pendingRequest(situation, now)) return { code: 'REQUEST_PENDING' }
  if (members.length >= MAX_MEMBERS) return { code: 'GUILD_FULL', max: MAX_MEMBERS }
  return null
}

/**
 * Accepter une demande : l'auteur de l'action est le chef (règle 7), la demande n'a pas
 * expiré (règle 8), la guilde n'est pas complète (règle 5), et le demandeur n'a pas rejoint
 * une autre guilde entre-temps (règle 3).
 */
export function checkAccept(
  members: Member[],
  actorId: string,
  request: JoinRequest,
  applicant: PlayerSituation,
  now: number,
): Check {
  const notLeader = checkLeader(members, actorId)
  if (notLeader) return notLeader
  if (isExpired(request, now)) return { code: 'REQUEST_EXPIRED' }
  if (members.length >= MAX_MEMBERS) return { code: 'GUILD_FULL', max: MAX_MEMBERS }
  if (applicant.guildId) return { code: 'ALREADY_MEMBER' }
  return null
}

/** Exclure un membre : réservé au chef, qui ne peut pas s'exclure lui-même (règle 7). */
export function checkKick(members: Member[], actorId: string, targetId: string): Check {
  const notLeader = checkLeader(members, actorId)
  if (notLeader) return notLeader
  if (actorId === targetId) return { code: 'CANNOT_KICK_SELF' }
  if (!roleOf(members, targetId)) return { code: 'MEMBER_NOT_FOUND' }
  return null
}

/** Conséquence du départ d'un membre. */
export type Departure =
  /** Le membre était le dernier : la guilde est dissoute. */
  | { kind: 'dissolve' }
  /** Le membre quitte la guilde ; newLeaderId désigne le nouveau chef si le chef est parti. */
  | { kind: 'leave'; newLeaderId: string | null }

/** Membres du plus ancien au plus récent ; l'identifiant départage deux arrivées simultanées. */
export const bySeniority = (members: Member[]) =>
  [...members].sort(
    (a, b) =>
      a.joinedAt - b.joinedAt || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0),
  )

/**
 * Départ d'un membre, volontaire ou à l'effacement de son compte : si le chef part, le membre
 * le plus ancien devient chef ; si le dernier membre part, la guilde est dissoute (règle 9).
 */
export function planDeparture(members: Member[], leavingId: string): Departure {
  const leaving = members.find((member) => member.playerId === leavingId)
  const others = bySeniority(members.filter((member) => member.playerId !== leavingId))
  if (others.length === 0) return { kind: 'dissolve' }
  return { kind: 'leave', newLeaderId: leaving?.role === 'leader' ? others[0].playerId : null }
}
