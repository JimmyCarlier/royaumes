/**
 * Entrée publique « serveur » du module Donjon.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import type { EventStore } from '@/platform/event-store/event-store'
import { createDungeonApi } from './api'
import { createDungeonService } from './application/dungeon-service'
import { createEventStoreGameRepository } from './infrastructure/event-store-game-repository'

export interface DungeonModuleDeps {
  /** Journal d'événements de la plateforme, fourni par la racine de composition. */
  store: EventStore
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
}

/** Fabrique du module : assemble l'adaptateur, le service et l'API. */
export function createDungeonModule({ store, clock }: DungeonModuleDeps) {
  const repo = createEventStoreGameRepository(store)
  const service = createDungeonService(repo, { clock })
  return { api: createDungeonApi(service) }
}

export type { DungeonApi } from './api'
