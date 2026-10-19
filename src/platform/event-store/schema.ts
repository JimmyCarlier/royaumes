import { bigserial, integer, jsonb, pgSchema, text, timestamp, unique } from 'drizzle-orm/pg-core'

/** Schéma PostgreSQL de la plateforme technique. */
export const platform = pgSchema('platform')

/**
 * Journal d'événements, en ajout seul : aucune ligne n'est jamais modifiée ni supprimée.
 * - position : ordre global de tous les événements, attribué par la base ;
 * - stream   : flux auquel appartient l'événement (par exemple « village-<joueur> ») ;
 * - version  : rang de l'événement dans son flux, à partir de 1 ;
 * - type et data : l'événement lui-même, que la plateforme n'interprète pas.
 */
export const events = platform.table(
  'events',
  {
    position: bigserial('position', { mode: 'number' }).primaryKey(),
    stream: text('stream').notNull(),
    version: integer('version').notNull(),
    type: text('type').notNull(),
    data: jsonb('data').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Deux événements d'un même flux ne peuvent pas porter la même version :
  // c'est cette contrainte qui garantit la concurrence optimiste.
  (t) => [unique('events_stream_version').on(t.stream, t.version)],
)
