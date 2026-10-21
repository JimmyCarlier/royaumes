import { eq } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { EventStore } from '@/platform/event-store/event-store'
import { ERASED_NAME, type PersonalDataContributor } from '@/platform/privacy/privacy'
import { OFFER_STREAM_PREFIX } from './contracts'
import { offers } from './infrastructure/schema'

/**
 * Données personnelles du Marché : le nom du joueur, copié dans les offres qu'il a publiées
 * et dans les acceptations qu'il a faites.
 */
export function createMarketPersonalData(store: EventStore, db: Db): PersonalDataContributor {
  return {
    name: 'market',

    async export(playerId) {
      const stored = await store.readAll({
        streamPrefix: OFFER_STREAM_PREFIX,
        types: ['OfferPublished', 'OfferAccepted'],
      })
      const offerId = (stream: string) => stream.slice(OFFER_STREAM_PREFIX.length)
      return {
        published: stored
          .filter((e) => e.type === 'OfferPublished' && e.data.sellerId === playerId)
          .map((e) => ({
            offerId: offerId(e.stream),
            give: e.data.give,
            want: e.data.want,
            at: e.data.at,
          })),
        accepted: stored
          .filter((e) => e.type === 'OfferAccepted' && e.data.buyerId === playerId)
          .map((e) => ({ offerId: offerId(e.stream), at: e.data.at })),
      }
    },

    redact(event, playerId) {
      if (!event.stream.startsWith(OFFER_STREAM_PREFIX)) return null
      if (event.type === 'OfferPublished' && event.data.sellerId === playerId) {
        return event.data.sellerName === ERASED_NAME
          ? null
          : { ...event.data, sellerName: ERASED_NAME }
      }
      if (event.type === 'OfferAccepted' && event.data.buyerId === playerId) {
        return event.data.buyerName === ERASED_NAME
          ? null
          : { ...event.data, buyerName: ERASED_NAME }
      }
      return null
    },

    // La table des offres en cours contient le nom du vendeur.
    async erase(playerId) {
      await db.update(offers).set({ sellerName: ERASED_NAME }).where(eq(offers.sellerId, playerId))
    },
  }
}
