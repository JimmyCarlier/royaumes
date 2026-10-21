/**
 * Entrée publique « serveur » du module Village.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import type { EventStore } from '@/platform/event-store/event-store'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createRealmApi } from './api'
import { createVillageService } from './application/village-service'
import { villageChannel } from './contracts'
import { createEventStoreVillageRepository } from './infrastructure/event-store-village-repository'
import { createRealmHandlers } from './messages'
import { createRealmPersonalData } from './personal-data'

export interface RealmModuleDeps {
  /** Journal d'événements de la plateforme, fourni par la racine de composition. */
  store: EventStore
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
}

/**
 * Fabrique du module : assemble l'adaptateur, le service, l'API, la règle du canal et les
 * gestionnaires de messages, que la racine de composition confie au distributeur.
 */
export function createRealmModule({ store, clock }: RealmModuleDeps) {
  const repo = createEventStoreVillageRepository(store)
  const service = createVillageService(repo, clock)

  // Règle d'accès au canal temps réel : un joueur n'écoute que son propre village.
  const channelPolicy: ChannelPolicy = {
    prefix: 'village-',
    canSubscribe: (channel, userId) => channel === villageChannel(userId),
  }

  return {
    api: createRealmApi(service),
    channelPolicy,
    handlers: createRealmHandlers(service),
    personalData: createRealmPersonalData(service),
  }
}

export type { RealmApi } from './api'
