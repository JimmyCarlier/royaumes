/**
 * Vue de la guilde d'un joueur : ce qu'il a le droit d'en connaître.
 * Les demandes d'adhésion ne sont présentées qu'au chef, et seules les demandes encore
 * valides le sont : une demande expirée disparaît de la vue sans tâche de fond (règle 8).
 */
import {
  bySeniority,
  expiresAt,
  isExpired,
  type JoinRequest,
  MAX_MEMBERS,
  type Member,
  type Role,
} from './guild'
import { type Contribution, NO_CONTRIBUTION, pointsOf, scoreOf } from './score'

export interface MemberView {
  playerId: string
  name: string
  role: Role
  joinedAt: number
  /** Points apportés par ce membre au score de la guilde. */
  points: number
}

export interface RequestView {
  id: string
  playerName: string
  sentAt: number
  expiresAt: number
}

export interface GuildView {
  id: string
  name: string
  score: number
  maxMembers: number
  /** Membres, du plus ancien au plus récent. */
  members: MemberView[]
  /** Vrai si le joueur qui consulte la vue est le chef. */
  isLeader: boolean
  /** Demandes en attente, présentées au seul chef ; vide pour les autres membres. */
  requests: RequestView[]
}

/** Demande envoyée par un joueur qui n'appartient à aucune guilde. */
export interface MyRequestView {
  id: string
  guildId: string
  guildName: string
  sentAt: number
  expiresAt: number
}

/** Construit la vue de la guilde pour le joueur viewerId, qui en est membre. */
export function toGuildView(
  guild: { id: string; name: string },
  members: Member[],
  contributions: Record<string, Contribution>,
  requests: JoinRequest[],
  viewerId: string,
  now: number,
): GuildView {
  const contributionOf = (playerId: string) => contributions[playerId] ?? NO_CONTRIBUTION
  const isLeader = members.some((m) => m.playerId === viewerId && m.role === 'leader')
  return {
    id: guild.id,
    name: guild.name,
    score: scoreOf(members.map((m) => contributionOf(m.playerId))),
    maxMembers: MAX_MEMBERS,
    members: bySeniority(members).map((m) => ({
      playerId: m.playerId,
      name: m.name,
      role: m.role,
      joinedAt: m.joinedAt,
      points: pointsOf(contributionOf(m.playerId)),
    })),
    isLeader,
    requests: isLeader
      ? requests
          .filter((r) => !isExpired(r, now))
          .sort((a, b) => a.sentAt - b.sentAt)
          .map((r) => ({
            id: r.id,
            playerName: r.playerName,
            sentAt: r.sentAt,
            expiresAt: expiresAt(r),
          }))
      : [],
  }
}

/** Construit la vue d'une demande en attente ; null si elle a expiré. */
export function toMyRequestView(
  request: JoinRequest,
  guildName: string,
  now: number,
): MyRequestView | null {
  if (isExpired(request, now)) return null
  return {
    id: request.id,
    guildId: request.guildId,
    guildName,
    sentAt: request.sentAt,
    expiresAt: expiresAt(request),
  }
}
