/**
 * Entrée publique « partagée » du module Marché : utilisable par le serveur
 * comme par l'interface.
 */
import { z } from 'zod'
import { ResourceAmounts } from '@/modules/realm/contracts'
import type { Amounts } from './domain/offer'

export type { Amounts, OfferError, OfferStatus } from './domain/offer'
export { OFFER_TTL_MS } from './domain/offer'
export type { OfferView } from './domain/view'

/** Corps attendu pour publier une offre : les ressources cédées, et celles demandées. */
export const PublishOfferInput = z.object({ give: ResourceAmounts, want: ResourceAmounts })

/** Offre telle que la présente la liste du Marché. */
export interface OfferSummary {
  offerId: string
  sellerName: string
  give: Amounts
  want: Amounts
  status: 'reserving' | 'open' | 'settling'
  /** Vrai si le joueur qui consulte la liste est le vendeur. */
  mine: boolean
  expiresAt: number
}

/** Liste des offres renvoyée par l'API, avec la position du journal jusqu'à laquelle elle est à jour. */
export interface MarketList {
  position: number
  offers: OfferSummary[]
}

/** Préfixe commun aux noms des flux de toutes les offres. */
export const OFFER_STREAM_PREFIX = 'market-'

/** Nom du flux qui contient les événements d'une offre. */
export const offerStream = (offerId: string) => `${OFFER_STREAM_PREFIX}${offerId}`

/** Nom du canal temps réel global du Marché, qui annonce l'évolution des offres. */
export const MARKET_CHANNEL = 'market'

/** Sujets des messages adressés au Marché. */
export const MARKET_TOPICS = {
  /** Réponse du Village à un mouvement de ressources. */
  transferResult: 'market.transfer-result',
  /** Rappel différé d'une offre, à son échéance. */
  expire: 'market.expire',
} as const
