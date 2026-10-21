import { REALM_TOPICS } from '@/modules/realm/contracts'
import { withOptimisticRetry } from '@/platform/event-store/retry'
import type { NewMessage } from '@/platform/outbox/outbox'
import { MARKET_TOPICS } from '../contracts'
import {
  type Amounts,
  decide,
  evolve,
  type OfferCommand,
  type OfferError,
  type OfferEvent,
  type OfferState,
} from '../domain/offer'
import { requestsFor, type SagaRequest } from '../domain/saga'
import { type OfferView, toView } from '../domain/view'
import type { OfferRepository } from './offer-repository'
import type { OffersReader } from './offers-reader'

/** Résultat d'une commande d'un joueur : la vue de l'offre, ou l'erreur métier. */
export type CommandResult = { ok: true; view: OfferView } | { ok: false; error: OfferError }

/** Joueur à l'origine d'une commande. */
export interface Player {
  id: string
  name: string
}

export interface MarketServiceOptions {
  /** Distribution de la boîte d'envoi, déclenchée après chaque commande et chaque consultation. */
  dispatch: () => Promise<unknown>
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
  /** Identifiant d'une nouvelle offre ; un UUID aléatoire par défaut. */
  newId?: () => string
}

/** Traduit une demande de la saga en message de la boîte d'envoi. */
function toMessage(request: SagaRequest, now: number): NewMessage {
  switch (request.kind) {
    case 'withdraw':
      return {
        topic: REALM_TOPICS.withdraw,
        payload: {
          transferId: request.transferId,
          playerId: request.playerId,
          resources: request.resources,
          // Adresse de retour : la réponse du Village fera progresser la saga.
          replyTo: MARKET_TOPICS.transferResult,
        },
      }
    case 'deposit':
      return {
        topic: REALM_TOPICS.deposit,
        payload: {
          transferId: request.transferId,
          playerId: request.playerId,
          resources: request.resources,
        },
      }
    case 'expire':
      return {
        topic: MARKET_TOPICS.expire,
        payload: { offerId: request.offerId },
        delayMs: Math.max(0, request.at - now),
      }
  }
}

/** Messages déclenchés par une suite d'événements, appliqués un à un à l'état de l'offre. */
function messagesFor(state: OfferState, events: OfferEvent[], now: number): NewMessage[] {
  const messages: NewMessage[] = []
  let current = state
  for (const event of events) {
    current = evolve(current, event)
    for (const request of requestsFor(current, event)) messages.push(toMessage(request, now))
  }
  return messages
}

/**
 * Service applicatif du Marché : orchestrateur de la saga d'échange.
 * Chaque décision est enregistrée avec les messages qu'elle déclenche, dans une même transaction.
 */
export function createMarketService(
  repo: OfferRepository,
  reader: OffersReader,
  { dispatch, clock = () => Date.now(), newId = () => crypto.randomUUID() }: MarketServiceOptions,
) {
  /**
   * Décide et enregistre une commande sur une offre, avec les messages de la saga.
   * En cas de conflit de version, l'ensemble est rejoué sur l'état à jour : aucun message
   * n'a été enregistré par la tentative refusée.
   */
  function process(offerId: string, command: OfferCommand) {
    return withOptimisticRetry(async () => {
      const { state, version } = await repo.load(offerId)
      const now = clock()
      const decision = decide(state, command, now)
      if (!decision.ok) return decision
      await repo.save(offerId, version, decision.events, messagesFor(state, decision.events, now))
      return decision
    })
  }

  /**
   * Commande d'un joueur : la décision est enregistrée, puis la boîte d'envoi distribuée.
   * Dans le cas ordinaire, la saga a progressé jusqu'à son prochain état stable lorsque
   * la vue est renvoyée.
   */
  async function execute(offerId: string, viewerId: string, command: OfferCommand) {
    const decision = await process(offerId, command)
    if (!decision.ok) return decision
    await dispatch()
    const { state } = await repo.load(offerId)
    const view = toView(state, viewerId)
    return view
      ? ({ ok: true, view } as const)
      : ({ ok: false, error: { code: 'OFFER_NOT_FOUND' } } as const)
  }

  /** Publie une offre au nom d'un joueur. */
  async function publish(player: Player, give: Amounts, want: Amounts) {
    const offerId = newId()
    const result: CommandResult = await execute(offerId, player.id, {
      type: 'PublishOffer',
      offerId,
      sellerId: player.id,
      sellerName: player.name,
      give,
      want,
    })
    return { offerId, result }
  }

  /** Accepte une offre au nom d'un joueur. */
  const acceptOffer = (offerId: string, player: Player): Promise<CommandResult> =>
    execute(offerId, player.id, { type: 'AcceptOffer', buyerId: player.id, buyerName: player.name })

  /** Retire une offre, au nom de son vendeur. */
  const withdrawOffer = (offerId: string, playerId: string): Promise<CommandResult> =>
    execute(offerId, playerId, { type: 'WithdrawOffer', playerId })

  /** Vue d'une offre pour un joueur ; null si elle n'existe pas. */
  async function getView(offerId: string, viewerId: string) {
    const { state } = await repo.load(offerId)
    return toView(state, viewerId)
  }

  /**
   * Liste des offres. La boîte d'envoi est d'abord distribuée : une saga interrompue
   * reprend dès qu'un joueur consulte le Marché, et les offres échues sont retirées.
   */
  async function list(viewerId: string) {
    await dispatch()
    return reader.list(viewerId, clock())
  }

  /**
   * Étape de la saga, déclenchée par un message. Une erreur métier y est une anomalie :
   * elle est levée, et le message sera retenté.
   */
  async function step(offerId: string, command: OfferCommand) {
    const decision = await process(offerId, command)
    if (!decision.ok) throw new Error(`Offre ${offerId} : ${decision.error.code}`)
  }

  return { publish, acceptOffer, withdrawOffer, getView, list, step }
}

/** Type du service, déduit de sa fabrique. */
export type MarketService = ReturnType<typeof createMarketService>
