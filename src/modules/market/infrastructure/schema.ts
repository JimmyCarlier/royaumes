import { bigint, index, jsonb, pgSchema, text } from 'drizzle-orm/pg-core'

/** Schéma PostgreSQL du module Marché. Ses événements restent dans le journal de la plateforme. */
export const market = pgSchema('market')

/**
 * Offres en cours, tenues à jour par la projection des offres : une offre y entre à sa
 * publication, et en sort lorsqu'elle atteint un état final (conclue, refusée ou retirée).
 */
export const offers = market.table(
  'offers',
  {
    offerId: text('offer_id').primaryKey(),
    sellerId: text('seller_id').notNull(),
    sellerName: text('seller_name').notNull(),
    give: jsonb('give').notNull(),
    want: jsonb('want').notNull(),
    /** reserving, open ou settling : les seuls états qui ne sont pas finaux. */
    status: text('status').notNull(),
    publishedAt: bigint('published_at', { mode: 'number' }).notNull(),
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('offers_seller_idx').on(t.sellerId)],
)
