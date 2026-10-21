import { describe, expect, it } from 'vitest'
import {
  decide,
  evolve,
  initialState,
  OFFER_TTL_MS,
  type OfferCommand,
  type OfferEvent,
  type OfferState,
} from './offer'
import { requestsFor } from './saga'

const T0 = Date.UTC(2026, 0, 1)

/** Applique une commande acceptée ; renvoie le nouvel état et les demandes de la saga. */
function play(state: OfferState, command: OfferCommand, now = T0) {
  const decision = decide(state, command, now)
  if (!decision.ok) throw new Error(decision.error.code)
  let current = state
  const requests = []
  for (const event of decision.events) {
    current = evolve(current, event)
    requests.push(...requestsFor(current, event))
  }
  return { state: current, events: decision.events, requests }
}

const publish: OfferCommand = {
  type: 'PublishOffer',
  offerId: 'o1',
  sellerId: 'alice',
  sellerName: 'Alice',
  give: { wood: 60 },
  want: { stone: 30 },
}
const result = (
  transferId: string,
  outcome: 'withdrawn' | 'refused',
  missing?: Record<string, number>,
): OfferCommand => ({ type: 'RecordTransferResult', transferId, outcome, missing })
const acceptByBob: OfferCommand = { type: 'AcceptOffer', buyerId: 'bob', buyerName: 'Bob' }

// Offre publiée, puis ouverte : les ressources d'Alice sont en séquestre.
const published = play(initialState, publish).state
const open = play(published, result('o1:reserve', 'withdrawn')).state

describe('Marché - publication et réservation', () => {
  it('publie une offre et demande la mise en séquestre des ressources du vendeur', () => {
    const { state, requests } = play(initialState, publish)
    expect(state).toMatchObject({ status: 'reserving', expiresAt: T0 + OFFER_TTL_MS })
    expect(requests).toEqual([
      { kind: 'withdraw', transferId: 'o1:reserve', playerId: 'alice', resources: { wood: 60 } },
    ])
  })

  it("ouvre l'offre et programme son échéance, ou la refuse si le stock ne suffit pas", () => {
    const opened = play(published, result('o1:reserve', 'withdrawn'))
    expect(opened.state.status).toBe('open')
    expect(opened.requests).toEqual([{ kind: 'expire', offerId: 'o1', at: T0 + OFFER_TTL_MS }])

    const rejected = play(published, result('o1:reserve', 'refused', { wood: 10 }))
    expect(rejected.state.status).toBe('rejected')
    // Rien n'a été prélevé : il n'y a rien à compenser.
    expect(rejected.requests).toEqual([])
  })

  it("ignore une réponse en double, ou qui ne correspond pas à l'étape en cours", () => {
    expect(decide(open, result('o1:reserve', 'withdrawn'), T0)).toEqual({ ok: true, events: [] })
    expect(decide(open, result('o1:pay-7', 'withdrawn'), T0)).toEqual({ ok: true, events: [] })
  })
})

describe('Marché - acceptation et paiement', () => {
  it("refuse l'acceptation de sa propre offre, d'une offre en cours de règlement ou échue", () => {
    const own: OfferCommand = { type: 'AcceptOffer', buyerId: 'alice', buyerName: 'Alice' }
    expect(decide(open, own, T0)).toEqual({ ok: false, error: { code: 'OWN_OFFER' } })

    const settling = play(open, acceptByBob).state
    const carol: OfferCommand = { type: 'AcceptOffer', buyerId: 'carol', buyerName: 'Carol' }
    expect(decide(settling, carol, T0)).toEqual({
      ok: false,
      error: { code: 'NOT_OPEN', status: 'settling' },
    })

    expect(decide(open, acceptByBob, T0 + OFFER_TTL_MS)).toEqual({
      ok: false,
      error: { code: 'EXPIRED' },
    })
  })

  it("conclut l'échange après le paiement, et livre les deux joueurs", () => {
    const accepted = play(open, acceptByBob)
    expect(accepted.requests).toEqual([
      { kind: 'withdraw', transferId: 'o1:pay-1', playerId: 'bob', resources: { stone: 30 } },
    ])

    const completed = play(accepted.state, result('o1:pay-1', 'withdrawn'))
    expect(completed.state.status).toBe('completed')
    expect(completed.requests).toEqual([
      {
        kind: 'deposit',
        transferId: 'o1:deliver-seller',
        playerId: 'alice',
        resources: { stone: 30 },
      },
      { kind: 'deposit', transferId: 'o1:deliver-buyer', playerId: 'bob', resources: { wood: 60 } },
    ])
  })

  it("rouvre l'offre après un paiement refusé ; la tentative suivante a son propre mouvement", () => {
    const settling = play(open, acceptByBob).state
    const refused = play(settling, result('o1:pay-1', 'refused', { stone: 5 }))
    expect(refused.state).toMatchObject({
      status: 'open',
      buyerId: null,
      refusal: { buyerId: 'bob', missing: { stone: 5 } },
    })
    expect(refused.requests).toEqual([])

    const again = play(refused.state, acceptByBob)
    expect(again.requests).toMatchObject([{ kind: 'withdraw', transferId: 'o1:pay-2' }])
  })
})

describe('Marché - retrait et échéance', () => {
  it('ne laisse retirer une offre que par son vendeur, et lui restitue ses ressources', () => {
    const byBob: OfferCommand = { type: 'WithdrawOffer', playerId: 'bob' }
    expect(decide(open, byBob, T0)).toEqual({ ok: false, error: { code: 'NOT_SELLER' } })

    const withdrawn = play(open, { type: 'WithdrawOffer', playerId: 'alice' })
    expect(withdrawn.state).toMatchObject({ status: 'withdrawn', withdrawnBecause: 'seller' })
    expect(withdrawn.requests).toEqual([
      { kind: 'deposit', transferId: 'o1:refund', playerId: 'alice', resources: { wood: 60 } },
    ])
  })

  it("retire l'offre à son échéance, et seulement à son échéance", () => {
    const expire: OfferCommand = { type: 'ExpireOffer' }
    expect(decide(open, expire, T0)).toEqual({ ok: false, error: { code: 'NOT_EXPIRED' } })

    const expired = play(open, expire, T0 + OFFER_TTL_MS)
    expect(expired.state.withdrawnBecause).toBe('expired')
    expect(expired.requests).toMatchObject([{ kind: 'deposit', transferId: 'o1:refund' }])

    // Une offre déjà conclue ou retirée n'est pas concernée par son échéance.
    expect(decide(expired.state, expire, T0 + OFFER_TTL_MS)).toEqual({ ok: true, events: [] })
  })

  it("retire aussitôt l'offre dont le paiement est refusé après l'échéance", () => {
    const settling = play(open, acceptByBob).state
    const late = play(settling, result('o1:pay-1', 'refused', {}), T0 + OFFER_TTL_MS)
    expect(late.events.map((event: OfferEvent) => event.type)).toEqual([
      'PaymentRefused',
      'OfferWithdrawn',
    ])
    expect(late.requests).toMatchObject([{ kind: 'deposit', transferId: 'o1:refund' }])
  })
})
