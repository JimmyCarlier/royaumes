/**
 * Étapes de la saga d'échange : pour chaque événement d'une offre, les demandes à adresser
 * au Village, ou à l'offre elle-même. Le domaine décide de ces demandes ; le service les
 * traduit en messages de la boîte d'envoi.
 */
import { type Amounts, type OfferEvent, type OfferState, transferIdOf } from './offer'

/** Demande produite par une étape de la saga. */
export type SagaRequest =
  /** Prélever des ressources : le Village répond, et la réponse fait progresser la saga. */
  | { kind: 'withdraw'; transferId: string; playerId: string; resources: Amounts }
  /** Verser des ressources : le versement ne peut pas échouer, aucune réponse n'est attendue. */
  | { kind: 'deposit'; transferId: string; playerId: string; resources: Amounts }
  /** Rappel adressé à l'offre elle-même à son échéance, pour la retirer si elle est encore ouverte. */
  | { kind: 'expire'; offerId: string; at: number }

/**
 * Demandes déclenchées par un événement. L'état reçu est celui qui suit l'application
 * de l'événement : il contient le vendeur, l'acheteur et les quantités de l'offre.
 */
export function requestsFor(state: OfferState, event: OfferEvent): SagaRequest[] {
  const id = (step: string) => transferIdOf(state.offerId, step)

  switch (event.type) {
    // 1. Publication : mise en séquestre des ressources du vendeur (étape compensable).
    case 'OfferPublished':
      return [
        {
          kind: 'withdraw',
          transferId: id('reserve'),
          playerId: state.sellerId,
          resources: state.give,
        },
      ]

    // 2. Ouverture : l'offre se rappellera à son échéance.
    case 'OfferOpened':
      return [{ kind: 'expire', offerId: state.offerId, at: state.expiresAt }]

    // 3. Acceptation : prélèvement du paiement de l'acheteur (étape pivot).
    case 'OfferAccepted':
      return [
        {
          kind: 'withdraw',
          transferId: id(`pay-${state.attempt}`),
          playerId: event.data.buyerId,
          resources: state.want,
        },
      ]

    // 4. Échange conclu : livraison aux deux joueurs (étapes reprises jusqu'au succès).
    case 'TradeCompleted':
      return [
        {
          kind: 'deposit',
          transferId: id('deliver-seller'),
          playerId: state.sellerId,
          resources: state.want,
        },
        // L'acheteur est celui dont le paiement vient de réussir.
        {
          kind: 'deposit',
          transferId: id('deliver-buyer'),
          playerId: state.buyerId ?? '',
          resources: state.give,
        },
      ]

    // Compensation : restitution au vendeur des ressources en séquestre.
    case 'OfferWithdrawn':
      return [
        {
          kind: 'deposit',
          transferId: id('refund'),
          playerId: state.sellerId,
          resources: state.give,
        },
      ]

    // Refus de réservation ou de paiement : rien n'a été prélevé, rien n'est à compenser.
    case 'OfferRejected':
    case 'PaymentRefused':
      return []
  }
}
