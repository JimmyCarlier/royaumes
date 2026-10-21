/** Vue d'une offre : ce qu'un joueur donné en voit. */
import type { Amounts, OfferState, OfferStatus } from './offer'

export interface OfferView {
  offerId: string
  sellerName: string
  give: Amounts
  want: Amounts
  status: OfferStatus
  /** Vrai si le joueur qui consulte la vue est le vendeur. */
  isSeller: boolean
  /** Acheteur dont le paiement est en cours, ou qui a conclu l'échange. */
  buyerName: string | null
  expiresAt: number
  /** Ressources qui manquaient au joueur lors de son dernier paiement refusé ; null sinon. */
  missing: Amounts | null
  withdrawnBecause: 'seller' | 'expired' | null
}

export function toView(state: OfferState, viewerId: string): OfferView | null {
  if (!state.exists) return null
  return {
    offerId: state.offerId,
    sellerName: state.sellerName,
    give: state.give,
    want: state.want,
    status: state.status,
    isSeller: state.sellerId === viewerId,
    buyerName: state.buyerName,
    expiresAt: state.expiresAt,
    // Le détail d'un refus de paiement ne concerne que l'acheteur refusé.
    missing: state.refusal?.buyerId === viewerId ? state.refusal.missing : null,
    withdrawnBecause: state.withdrawnBecause,
  }
}
