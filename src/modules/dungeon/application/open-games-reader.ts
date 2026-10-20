import type { OpenGame } from '../contracts'

/**
 * Port de lecture de la liste des expéditions ouvertes, défini par la couche application.
 * Il est distinct du port GameRepository : celui-ci sert les commandes (modèle d'écriture),
 * celui-là répond à une consultation (modèle de lecture).
 */
export interface OpenGamesReader {
  /** Expéditions qui peuvent encore être rejointes à l'instant now, les plus récentes en tête. */
  list(now: number): Promise<OpenGame[]>
}
