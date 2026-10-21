import type { NewMessage } from '@/platform/outbox/outbox'
import type { VillageEvent, VillageState } from '../domain/village'

/**
 * Port de persistance du Village, défini par la couche application.
 * Il est exprimé dans les termes du domaine (états, événements) et ignore
 * tout du stockage concret, fourni par un adaptateur de l'infrastructure.
 */
export interface VillageRepository {
  /**
   * Charge l'état du village d'un joueur, reconstruit à partir de ses événements,
   * ainsi que sa version : le nombre d'événements déjà enregistrés.
   */
  load(userId: string): Promise<{ state: VillageState; version: number }>

  /**
   * Enregistre de nouveaux événements à la suite des précédents.
   * expectedVersion est la version lue au chargement : si d'autres événements
   * ont été enregistrés entre-temps, l'enregistrement est refusé par une
   * ConcurrencyError, l'erreur du journal d'événements de la plateforme.
   * Les messages éventuels sont enregistrés dans la boîte d'envoi, avec les événements.
   */
  save(
    userId: string,
    expectedVersion: number,
    events: VillageEvent[],
    messages?: NewMessage[],
  ): Promise<void>
}
