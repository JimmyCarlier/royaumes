import type { RankingEntry } from '../contracts'

/**
 * Port de lecture du Classement, défini par la couche application.
 * Le module n'a aucune commande : il ne fait que lire un modèle de lecture.
 */
export interface RankingReader {
  /** Les meilleurs joueurs, à jour au moment de l'appel. */
  top(limit: number): Promise<RankingEntry[]>
}
