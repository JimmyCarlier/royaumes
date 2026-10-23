/**
 * Entrée publique « serveur » du module Guildes.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createGuildApi } from './api'
import { createGuildService } from './application/guild-service'
import { GUILD_CHANNEL_PREFIX } from './contracts'
import { createDrizzleContributionReader } from './infrastructure/drizzle-contribution-reader'
import { createDrizzleGuildRepository } from './infrastructure/drizzle-guild-repository'
import { createGuildPersonalData } from './personal-data'

export interface GuildModuleDeps {
  /** Base de données, dans laquelle le module tient ses tables et son modèle de lecture. */
  db: Db
  /** Moteur des projections de la plateforme, qui tient les contributions des joueurs. */
  projections: ProjectionRunner
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
}

/** Nombre maximal de changements transmis à la fois par le canal d'une guilde. */
const CHANNEL_BATCH = 100

/** Fabrique du module : assemble les adaptateurs, le service, l'API et la règle des canaux. */
export function createGuildModule({ db, projections, clock }: GuildModuleDeps) {
  const repo = createDrizzleGuildRepository(db)
  const service = createGuildService(repo, createDrizzleContributionReader(db, projections), {
    clock,
  })

  /** Identifiant de la guilde tiré du nom de son canal : « guild-7f3a » donne « 7f3a ». */
  const guildOf = (channel: string) => channel.slice(GUILD_CHANNEL_PREFIX.length)

  // Canal d'une guilde : seuls ses membres peuvent l'écouter. Il ne lit pas le journal, mais
  // la table de l'activité de la guilde ; chaque changement y est présenté comme un événement,
  // dont la position est l'identifiant de la ligne. Les lignes ne contiennent que le type du
  // changement : chaque abonné relit sa propre vue auprès de l'API.
  // DETTE TECHNIQUE (docs/qualite/dette-technique.md, DT-012) : l'appartenance n'est vérifiée
  // qu'à l'ouverture du flux ; un membre exclu reçoit les types des changements suivants
  // jusqu'à la fermeture de son flux.
  const channelPolicy: ChannelPolicy = {
    prefix: GUILD_CHANNEL_PREFIX,
    canSubscribe: (channel, userId) => service.isMember(guildOf(channel), userId),
    source: {
      async read(after, channel) {
        const rows = await repo.activityAfter(guildOf(channel), after, CHANNEL_BATCH)
        return rows.map((row) => ({
          position: row.id,
          stream: channel,
          version: row.id,
          type: row.type,
          data: {},
          occurredAt: new Date(row.at),
        }))
      },
      // Un nouvel abonné ne reçoit que les changements à venir ; l'état est lu par l'API.
      start: () => repo.lastActivityId(),
    },
  }

  return {
    api: createGuildApi(service),
    channelPolicy,
    // La tâche quotidienne est confiée à la racine de composition, qui la fait exécuter
    // par la tâche planifiée de Vercel.
    dailyTask: service.purge,
    personalData: createGuildPersonalData(db, projections, service),
  }
}

export type { GuildApi } from './api'
