import { and, asc, desc, eq, gt, gte, max } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { MessageRepository } from '../application/message-repository'
import { messages } from './schema'

/** Adaptateur du port MessageRepository, fondé sur la table tavern.messages. */
export function createDrizzleMessageRepository(db: Db): MessageRepository {
  return {
    async add(message) {
      const [row] = await db.insert(messages).values(message).returning()
      return row
    },

    async latest(limit) {
      // Les derniers messages sont lus du plus récent au plus ancien, puis remis dans l'ordre.
      const rows = await db.select().from(messages).orderBy(desc(messages.id)).limit(limit)
      return rows.reverse()
    },

    after(id, limit) {
      return db
        .select()
        .from(messages)
        .where(gt(messages.id, id))
        .orderBy(asc(messages.id))
        .limit(limit)
    },

    async lastId() {
      const [row] = await db.select({ value: max(messages.id) }).from(messages)
      return Number(row?.value ?? 0)
    },

    async postedSince(authorId, since) {
      const rows = await db
        .select({ postedAt: messages.postedAt })
        .from(messages)
        .where(and(eq(messages.authorId, authorId), gte(messages.postedAt, since)))
      return rows.map((row) => row.postedAt)
    },
  }
}
