import { bigint, bigserial, index, pgSchema, text } from 'drizzle-orm/pg-core'

/**
 * Schéma PostgreSQL du module Taverne. Contrairement aux autres modules, la Taverne
 * n'enregistre aucun événement : ses tables sont sa seule source de vérité.
 */
export const tavern = pgSchema('tavern')

/** Messages du salon, supprimés à l'expiration de leur durée de conservation. */
export const messages = tavern.table(
  'messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    authorId: text('author_id').notNull(),
    /** Nom de l'auteur au moment de la publication ; effacé avec les messages de l'auteur. */
    authorName: text('author_name').notNull(),
    body: text('body').notNull(),
    postedAt: bigint('posted_at', { mode: 'number' }).notNull(),
  },
  (t) => [
    // La limitation compte les messages récents d'un auteur ; l'effacement les supprime tous.
    index('messages_author_idx').on(t.authorId, t.postedAt),
    // La durée de conservation supprime les messages les plus anciens.
    index('messages_posted_at_idx').on(t.postedAt),
  ],
)
