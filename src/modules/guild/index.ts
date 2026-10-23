/**
 * Entrée publique « serveur » du module Guildes.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import { createGuildApi } from './api'
import { createGuildService } from './application/guild-service'
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

/** Fabrique du module : assemble les adaptateurs, le service et l'API. */
export function createGuildModule({ db, projections, clock }: GuildModuleDeps) {
  const repo = createDrizzleGuildRepository(db)
  const service = createGuildService(repo, createDrizzleContributionReader(db, projections), {
    clock,
  })

  return {
    api: createGuildApi(service),
    // La tâche quotidienne est confiée à la racine de composition, qui la fait exécuter
    // par la tâche planifiée de Vercel.
    dailyTask: service.purge,
    personalData: createGuildPersonalData(db, projections, service),
  }
}

export type { GuildApi } from './api'
