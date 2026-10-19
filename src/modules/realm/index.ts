/**
 * Entrée publique « serveur » du module Village.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import { createRealmApi } from './api'
import { createVillageService } from './application/village-service'
import { createInMemoryVillageRepository } from './infrastructure/in-memory-village-repository'

export interface RealmModuleDeps {
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
}

/** Fabrique du module : assemble l'adaptateur, le service et l'API. */
export function createRealmModule({ clock }: RealmModuleDeps = {}) {
  // Stockage provisoire en mémoire, remplacé au TD3 par le journal d'événements.
  const repo = createInMemoryVillageRepository()
  const service = createVillageService(repo, clock)
  return { api: createRealmApi(service) }
}

export type { RealmApi } from './api'
