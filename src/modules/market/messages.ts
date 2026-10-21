import { z } from 'zod'
import type { MessageHandler } from '@/platform/outbox/outbox'
import type { MarketService } from './application/market-service'
import { MARKET_TOPICS } from './contracts'
import { offerIdOf } from './domain/offer'

/** Réponse du Village à un mouvement de ressources (son type TransferResult, vérifié ici). */
const TransferResultMessage = z.object({
  transferId: z.string().min(1),
  outcome: z.enum(['withdrawn', 'refused', 'deposited']),
  missing: z.record(z.string(), z.number()).optional(),
})

/** Rappel différé d'une offre. */
const ExpireMessage = z.object({ offerId: z.string().min(1) })

/**
 * Gestionnaires des messages adressés au Marché : les réponses du Village, qui font progresser
 * la saga, et les rappels d'échéance des offres. Comme ceux du Village, ils ne font que traduire
 * un message en appel au service.
 */
export function createMarketHandlers(service: MarketService): Record<string, MessageHandler> {
  return {
    [MARKET_TOPICS.transferResult]: async (message) => {
      const { transferId, outcome, missing } = TransferResultMessage.parse(message.payload)
      // L'identifiant du mouvement a été construit par le Marché : il désigne l'offre concernée.
      await service.step(offerIdOf(transferId), {
        type: 'RecordTransferResult',
        transferId,
        outcome,
        missing,
      })
    },

    [MARKET_TOPICS.expire]: async (message) => {
      const { offerId } = ExpireMessage.parse(message.payload)
      await service.step(offerId, { type: 'ExpireOffer' })
    },
  }
}
