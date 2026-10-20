/**
 * Entrée publique « serveur » du module Donjon.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import type { EventStore } from '@/platform/event-store/event-store'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createDungeonApi } from './api'
import { createDungeonService } from './application/dungeon-service'
import { GAME_CHANNEL_PREFIX } from './contracts'
import { createEventStoreGameRepository } from './infrastructure/event-store-game-repository'

export interface DungeonModuleDeps {
  /** Journal d'événements de la plateforme, fourni par la racine de composition. */
  store: EventStore
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
}

/** Fabrique du module : assemble l'adaptateur, le service, l'API et la règle des canaux. */
export function createDungeonModule({ store, clock }: DungeonModuleDeps) {
  const repo = createEventStoreGameRepository(store)
  const service = createDungeonService(repo, { clock })

  // Règle d'accès aux canaux des expéditions : seuls les membres d'une expédition
  // peuvent l'écouter. Le canal est discret : il ne transmet aucune donnée d'événement,
  // car l'événement ActionSubmitted révélerait l'action choisie par un héros.
  const channelPolicy: ChannelPolicy = {
    prefix: GAME_CHANNEL_PREFIX,
    redact: true,
    canSubscribe: async (channel, userId) => {
      const gameId = channel.slice(GAME_CHANNEL_PREFIX.length)
      const view = await service.getView(gameId, userId)
      return view?.isMember ?? false
    },
  }

  return { api: createDungeonApi(service), channelPolicy }
}

export type { DungeonApi } from './api'
export { type SimulationSetup, winRate } from './domain/simulation'
