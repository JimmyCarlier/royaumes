import type { GameEvent, GameState } from '../domain/game'

/**
 * Port de persistance du Donjon, défini par la couche application.
 * Comme celui du Village, il est exprimé dans les termes du domaine.
 */
export interface GameRepository {
  /** Charge l'état d'une expédition, reconstruit à partir de ses événements, et sa version. */
  load(gameId: string): Promise<{ state: GameState; version: number }>

  /**
   * Enregistre de nouveaux événements à la suite des précédents.
   * Une ConcurrencyError est levée si d'autres événements ont été enregistrés depuis la lecture.
   */
  save(gameId: string, expectedVersion: number, events: GameEvent[]): Promise<void>
}
