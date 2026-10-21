import { sql } from 'drizzle-orm'
import { index, integer, jsonb, text, timestamp } from 'drizzle-orm/pg-core'
import { platform } from '../event-store/schema'

/**
 * Boîte d'envoi : messages adressés à un module, enregistrés dans la même transaction
 * que les événements qui les ont produits, puis remis par le distributeur.
 * - topic        : sujet du message, qui désigne le gestionnaire chargé de le traiter ;
 * - available_at : instant à partir duquel le message peut être remis ; il est repoussé
 *                  pendant un traitement (bail) et après un échec (délai avant nouvel essai) ;
 * - processed_at : instant du traitement réussi ; null tant que le message est en attente.
 */
export const outbox = platform.table(
  'outbox',
  {
    id: text('id').primaryKey(),
    topic: text('topic').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  // Index partiel : seuls les messages en attente y figurent. La recherche des messages
  // à remettre ne parcourt jamais les messages déjà traités, quel que soit leur nombre.
  (t) => [index('outbox_pending_idx').on(t.availableAt).where(sql`processed_at is null`)],
)
