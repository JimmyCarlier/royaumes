/**
 * Entrée publique « serveur » du module Marché.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import type { Db } from '@/platform/db/client'
import type { EventStore } from '@/platform/event-store/event-store'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createMarketApi } from './api'
import { createMarketService } from './application/market-service'
import { MARKET_CHANNEL } from './contracts'
import { createDrizzleOffersReader } from './infrastructure/drizzle-offers-reader'
import { createEventStoreOfferRepository } from './infrastructure/event-store-offer-repository'
import { offersProjection } from './infrastructure/offers-projection'
import { createMarketHandlers } from './messages'

export interface MarketModuleDeps {
  /** Journal d'événements de la plateforme. */
  store: EventStore
  /** Base de données, dans laquelle le module tient la liste des offres. */
  db: Db
  /** Moteur des projections de la plateforme. */
  projections: ProjectionRunner
  /** Distribution de la boîte d'envoi, déclenchée par le Marché après ses commandes et lectures. */
  dispatch: () => Promise<unknown>
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
}

/**
 * Fabrique du module : assemble les adaptateurs, le service, l'API, la règle du canal
 * et les gestionnaires de messages.
 */
export function createMarketModule({ store, db, projections, dispatch, clock }: MarketModuleDeps) {
  const repo = createEventStoreOfferRepository(store)
  const reader = createDrizzleOffersReader(db, projections)
  const service = createMarketService(repo, reader, { dispatch, clock })

  // Canal global et discret, sur le modèle de celui du Classement : il annonce l'évolution
  // des offres, et l'interface relit la liste.
  const channelPolicy: ChannelPolicy = {
    prefix: MARKET_CHANNEL,
    canSubscribe: (channel) => channel === MARKET_CHANNEL,
    redact: true,
    global: { types: offersProjection.eventTypes },
  }

  return { api: createMarketApi(service), channelPolicy, handlers: createMarketHandlers(service) }
}

export type { MarketApi } from './api'
