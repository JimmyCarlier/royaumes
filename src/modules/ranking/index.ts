/**
 * Entrée publique « serveur » du module Classement.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import { createRankingApi } from './api'
import { createDrizzleRankingReader } from './infrastructure/drizzle-ranking-reader'

export interface RankingModuleDeps {
  /** Base de données, dans laquelle le module tient son modèle de lecture. */
  db: Db
  /** Moteur des projections de la plateforme. */
  projections: ProjectionRunner
}

/** Fabrique du module : assemble l'adaptateur de lecture et l'API. */
export function createRankingModule({ db, projections }: RankingModuleDeps) {
  const reader = createDrizzleRankingReader(db, projections)
  return { api: createRankingApi(reader) }
}

export type { RankingApi } from './api'
