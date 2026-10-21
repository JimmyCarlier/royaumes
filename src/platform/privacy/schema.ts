import { bigserial, integer, timestamp } from 'drizzle-orm/pg-core'
import { platform } from '../event-store/schema'

/**
 * Registre des effacements : une ligne par compte effacé, avec la date de l'effacement et le
 * nombre d'événements réécrits. Il ne contient, à dessein, aucune donnée sur le joueur effacé :
 * il prouve que les effacements ont eu lieu, sans conserver ce qu'ils ont effacé.
 */
export const erasures = platform.table('erasures', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  erasedAt: timestamp('erased_at', { withTimezone: true }).notNull().defaultNow(),
  eventsRewritten: integer('events_rewritten').notNull(),
})
