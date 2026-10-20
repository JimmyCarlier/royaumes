/**
 * Entrée publique « partagée » du module Classement : utilisable par le serveur
 * comme par l'interface.
 */

/** Ligne du classement, telle qu'elle est présentée aux joueurs. */
export interface RankingEntry {
  rank: number
  playerId: string
  /** Nom du joueur, ou à défaut nom de son village. */
  label: string
  gamesPlayed: number
  gamesWon: number
  /** Or rapporté des expéditions gagnées. */
  gold: number
  /** Nombre d'améliorations de bâtiments du village. */
  upgrades: number
  /** Or rapporté par la meilleure expédition gagnée. */
  bestLoot: number
}

/** Classement renvoyé par l'API. */
export interface Ranking {
  /**
   * Position du journal jusqu'à laquelle le classement est à jour. L'interface la compare
   * à la position des événements annoncés par le canal du classement.
   */
  position: number
  entries: RankingEntry[]
}

/** Nombre de joueurs présentés par le classement. */
export const RANKING_SIZE = 20

/** Nom du canal temps réel du classement, qui ne correspond à aucun flux du journal. */
export const RANKING_CHANNEL = 'ranking'
