import type { MessageHandler } from '@/platform/outbox/outbox'
import type { VillageService } from './application/village-service'
import { REALM_TOPICS, TransferRequest } from './contracts'
import type { TransferCommand } from './domain/village'

/**
 * Gestionnaires des messages adressés au Village, remis par le distributeur de la boîte
 * d'envoi. Ce fichier joue, pour les messages, le rôle que joue api.ts pour les requêtes HTTP :
 * il traduit un message en appel au service, sans aucune règle métier.
 */
export function createRealmHandlers(service: VillageService): Record<string, MessageHandler> {
  /** Gestionnaire d'un type de mouvement. */
  const handle =
    (type: TransferCommand['type']): MessageHandler =>
    async (message) => {
      // Le contenu d'un message est vérifié comme celui d'une requête : il provient d'un autre
      // module. Un message mal formé lève une erreur, et finira abandonné en lettre morte.
      const { transferId, playerId, resources, replyTo } = TransferRequest.parse(message.payload)
      await service.transfer(playerId, { type, transferId, resources }, replyTo)
    }

  return {
    [REALM_TOPICS.withdraw]: handle('WithdrawResources'),
    [REALM_TOPICS.deposit]: handle('DepositResources'),
  }
}
