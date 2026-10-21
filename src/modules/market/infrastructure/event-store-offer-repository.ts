import type { EventStore, NewEvent } from '@/platform/event-store/event-store'
import type { OfferRepository } from '../application/offer-repository'
import { offerStream } from '../contracts'
import { type OfferEvent, replay } from '../domain/offer'

/** Adaptateur du port OfferRepository fondé sur le journal d'événements. */
export function createEventStoreOfferRepository(store: EventStore): OfferRepository {
  return {
    async load(offerId) {
      const stored = await store.read(offerStream(offerId))
      const events = stored.map((e) => ({ type: e.type, data: e.data }) as OfferEvent)
      return { state: replay(events), version: stored.at(-1)?.version ?? 0 }
    },

    async save(offerId, expectedVersion, events, messages) {
      // Les événements de l'offre et les messages de la saga : une seule transaction.
      await store.append(
        offerStream(offerId),
        expectedVersion,
        events as unknown as NewEvent[],
        messages,
      )
    },
  }
}
