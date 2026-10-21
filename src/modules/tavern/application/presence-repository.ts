import type { PresentPlayer } from '../contracts'

/** Port de persistance de la présence, défini par la couche application. */
export interface PresenceRepository {
  /** Enregistre le signal d'un joueur : crée sa ligne, ou met à jour la date de son dernier signal. */
  touch(player: PresentPlayer, at: number): Promise<void>
  /** Supprime la ligne d'un joueur. */
  remove(playerId: string): Promise<void>
  /**
   * Supprime les lignes des joueurs dont le dernier signal est antérieur à l'instant before ;
   * renvoie leur nombre.
   */
  removeStale(before: number): Promise<number>
  /** Joueurs présents, par ordre alphabétique. */
  list(): Promise<PresentPlayer[]>
}
