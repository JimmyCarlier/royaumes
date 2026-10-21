import type { NewMessage } from '@/platform/outbox/outbox'
import type { OfferEvent, OfferState } from '../domain/offer'

/** Port de persistance des offres, défini par la couche application. */
export interface OfferRepository {
  /** Charge l'état d'une offre, reconstruit à partir de ses événements, et sa version. */
  load(offerId: string): Promise<{ state: OfferState; version: number }>

  /**
   * Enregistre de nouveaux événements, et les messages de la saga qu'ils déclenchent,
   * dans une même transaction. Une ConcurrencyError est levée en cas de conflit de version.
   */
  save(
    offerId: string,
    expectedVersion: number,
    events: OfferEvent[],
    messages: NewMessage[],
  ): Promise<void>
}
