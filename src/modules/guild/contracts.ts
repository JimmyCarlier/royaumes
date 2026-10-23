/**
 * Entrée publique « partagée » du module Guildes : utilisable par le serveur comme par
 * l'interface. Elle ne contient que des types, des schémas de validation et des constantes.
 */
import { z } from 'zod'
import { NAME_MAX } from './domain/guild'
import type { GuildRankingEntry } from './domain/score'
import type { GuildView, MyRequestView } from './domain/view'

export type { GuildError, Role } from './domain/guild'
export { MAX_MEMBERS, NAME_MAX, NAME_MIN, REQUEST_TTL_MS } from './domain/guild'
export type { GuildRankingEntry } from './domain/score'
export { UPGRADE_POINTS } from './domain/score'
export type { GuildView, MemberView, MyRequestView, RequestView } from './domain/view'

/** Corps attendu pour fonder une guilde. La longueur exacte est vérifiée par le domaine. */
export const FoundGuildInput = z.object({
  name: z.string().max(NAME_MAX * 4),
})

/** Identifiant d'une guilde ou d'une demande dans l'adresse : un UUID attribué par le serveur. */
export const IdParam = z.object({ id: z.uuid('Identifiant invalide') })

/** Identifiant du membre à exclure dans l'adresse. */
export const PlayerIdParam = z.object({
  playerId: z.string().min(1, 'Joueur invalide').max(128, 'Joueur invalide'),
})

/** Ce que le joueur connecté sait de sa situation : sa guilde, ou sa demande en attente. */
export interface MyGuild {
  guild: GuildView | null
  request: MyRequestView | null
}

/** Classement des guildes renvoyé par l'API. */
export interface GuildRanking {
  entries: (GuildRankingEntry & { full: boolean })[]
}

/** Préfixe des canaux temps réel des guildes : « guild-<identifiant> ». */
export const GUILD_CHANNEL_PREFIX = 'guild-'

/** Nom du canal temps réel d'une guilde, réservé à ses membres. */
export const guildChannel = (guildId: string) => `${GUILD_CHANNEL_PREFIX}${guildId}`

/** Types des changements annoncés sur le canal d'une guilde. */
export const GUILD_ACTIVITY = {
  founded: 'GuildFounded',
  requestReceived: 'RequestReceived',
  requestCancelled: 'RequestCancelled',
  requestRefused: 'RequestRefused',
  memberJoined: 'MemberJoined',
  memberLeft: 'MemberLeft',
  memberKicked: 'MemberKicked',
  leaderChanged: 'LeaderChanged',
} as const
