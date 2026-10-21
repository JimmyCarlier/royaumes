import { eq } from 'drizzle-orm'
import type { StoredEvent } from '@/platform/event-store/event-store'
import type { Projection } from '@/platform/projection/projection'
import { OFFER_STREAM_PREFIX } from '../contracts'
import type { OfferEvent } from '../domain/offer'
import { offers } from './schema'

/** Identifiant de l'offre tiré du nom de son flux : « market-7f3a » donne « 7f3a ». */
const offerIdOf = (event: StoredEvent) => event.stream.slice(OFFER_STREAM_PREFIX.length)

/** Projection des offres en cours, construite à partir des événements du Marché. */
export const offersProjection: Projection = {
  name: 'market-offers',
  version: 1,
  eventTypes: [
    'OfferPublished',
    'OfferOpened',
    'OfferRejected',
    'OfferAccepted',
    'PaymentRefused',
    'TradeCompleted',
    'OfferWithdrawn',
  ],

  async apply(stored, tx) {
    const event = { type: stored.type, data: stored.data } as OfferEvent
    const offerId = offerIdOf(stored)
    /** Change l'état de l'offre dans la table. */
    const setStatus = (status: string) =>
      tx.update(offers).set({ status }).where(eq(offers.offerId, offerId))

    switch (event.type) {
      case 'OfferPublished':
        await tx.insert(offers).values({
          offerId,
          sellerId: event.data.sellerId,
          sellerName: event.data.sellerName,
          give: event.data.give,
          want: event.data.want,
          status: 'reserving',
          publishedAt: event.data.at,
          expiresAt: event.data.expiresAt,
        })
        return
      case 'OfferOpened':
      case 'PaymentRefused':
        await setStatus('open')
        return
      case 'OfferAccepted':
        await setStatus('settling')
        return
      // États finaux : l'offre quitte la liste.
      case 'OfferRejected':
      case 'TradeCompleted':
      case 'OfferWithdrawn':
        await tx.delete(offers).where(eq(offers.offerId, offerId))
        return
    }
  },

  async reset(tx) {
    await tx.delete(offers)
  },
}
