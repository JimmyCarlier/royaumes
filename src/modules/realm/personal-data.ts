import type { StoredEvent } from '@/platform/event-store/event-store'
import { ERASED_VILLAGE, type PersonalDataContributor } from '@/platform/privacy/privacy'
import type { VillageService } from './application/village-service'
import { villageChannel } from './contracts'

/**
 * Données personnelles du Village : le nom du village, choisi par le joueur.
 * Ce fichier joue, pour les droits des joueurs, le rôle que jouent api.ts pour les requêtes
 * et messages.ts pour la boîte d'envoi.
 */
export function createRealmPersonalData(service: VillageService): PersonalDataContributor {
  return {
    name: 'realm',

    async export(playerId) {
      const view = await service.getView(playerId)
      return view ? { village: view.name, stock: view.stock, levels: view.levels } : null
    },

    // Seul l'événement de fondation contient le nom du village ; il est dans le flux du joueur.
    redact(event: StoredEvent, playerId) {
      if (event.stream !== villageChannel(playerId) || event.type !== 'VillageFounded') return null
      if (event.data.name === ERASED_VILLAGE) return null
      return { ...event.data, name: ERASED_VILLAGE }
    },
  }
}
