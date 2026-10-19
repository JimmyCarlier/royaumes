/**
 * Entrée publique « serveur » du module Village.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import type { EventStore } from '@/platform/event-store/event-store'
import { createRealmApi } from './api'
import { createVillageService } from './application/village-service'
import { createEventStoreVillageRepository } from './infrastructure/event-store-village-repository'

export interface RealmModuleDeps {
  /** Journal d'événements de la plateforme, fourni par la racine de composition. */
  store: EventStore
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
}

/** Fabrique du module : assemble l'adaptateur, le service et l'API. */
export function createRealmModule({ store, clock }: RealmModuleDeps) {
  const repo = createEventStoreVillageRepository(store)
  const service = createVillageService(repo, clock)
  return { api: createRealmApi(service) }
}

export type { RealmApi } from './api'
