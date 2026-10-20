/**
 * Entrée publique « serveur » du module Classement.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createRankingApi } from './api'
import { RANKING_CHANNEL } from './contracts'
import { createDrizzleRankingReader } from './infrastructure/drizzle-ranking-reader'
import { rankingProjection } from './infrastructure/ranking-projection'

export interface RankingModuleDeps {
  /** Base de données, dans laquelle le module tient son modèle de lecture. */
  db: Db
  /** Moteur des projections de la plateforme. */
  projections: ProjectionRunner
}

/** Fabrique du module : assemble l'adaptateur de lecture, l'API et la règle du canal. */
export function createRankingModule({ db, projections }: RankingModuleDeps) {
  const reader = createDrizzleRankingReader(db, projections)

  // Canal du classement : tout joueur connecté peut l'écouter. C'est un canal global, qui
  // annonce les événements appliqués par la projection, tous flux confondus. Il est discret :
  // les événements du Donjon contiennent la graine de l'expédition, qui ne doit jamais
  // être transmise, et l'interface n'a besoin que de leur position.
  const channelPolicy: ChannelPolicy = {
    prefix: RANKING_CHANNEL,
    canSubscribe: (channel) => channel === RANKING_CHANNEL,
    redact: true,
    global: { types: rankingProjection.eventTypes },
  }

  return { api: createRankingApi(reader), channelPolicy }
}

export type { RankingApi } from './api'
