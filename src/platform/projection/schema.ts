import { bigint, text, timestamp } from 'drizzle-orm/pg-core'
import { platform } from '../event-store/schema'

/**
 * Points de reprise des projections : pour chaque projection, la position, dans l'ordre
 * global du journal, du dernier événement qu'elle a traité. Une ligne par projection.
 */
export const projections = platform.table('projections', {
  name: text('name').primaryKey(),
  position: bigint('position', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
