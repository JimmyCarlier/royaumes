import type { MarketList } from '../contracts'

/** Port de lecture de la liste des offres, défini par la couche application. */
export interface OffersReader {
  /**
   * Offres en cours du joueur viewerId, et offres ouvertes des autres joueurs à l'instant now,
   * avec la position du journal jusqu'à laquelle la liste est à jour.
   */
  list(viewerId: string, now: number): Promise<MarketList>
}
