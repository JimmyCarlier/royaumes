import { bigint, index, integer, pgSchema, text } from 'drizzle-orm/pg-core'

/** Schéma PostgreSQL du module Donjon. Ses événements restent dans le journal de la plateforme. */
export const dungeon = pgSchema('dungeon')

/**
 * Expéditions qui n'ont été ni lancées ni terminées, tenues à jour par la projection
 * des expéditions ouvertes. Une expédition quitte la table dès son lancement.
 */
export const openGames = dungeon.table(
  'open_games',
  {
    gameId: text('game_id').primaryKey(),
    hostName: text('host_name').notNull(),
    /** Nombre de héros, compagnons compris. */
    heroCount: integer('hero_count').notNull(),
    /** Date d'ouverture, en millisecondes, comme le champ at des événements. */
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  },
  // Index sur la date d'ouverture : seules les expéditions récentes sont lues, et la requête
  // ignore les expéditions abandonnées depuis longtemps sans avoir à les parcourir.
  (t) => [index('open_games_created_at_idx').on(t.createdAt)],
)
