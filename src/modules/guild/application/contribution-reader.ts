import type { Contribution } from '../domain/score'

/**
 * Port de lecture des contributions des joueurs, défini par la couche application.
 * Les contributions forment un modèle de lecture, tenu par la projection du module à partir
 * des événements publiés par le Village et le Donjon : elles sont à jour au moment de l'appel.
 */
export interface ContributionReader {
  /** Contributions des joueurs désignés ; un joueur qui n'a rien accompli est absent. */
  of(playerIds: string[]): Promise<Record<string, Contribution>>
}
