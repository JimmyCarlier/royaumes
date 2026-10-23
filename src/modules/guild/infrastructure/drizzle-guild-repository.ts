import { asc, eq, inArray, lt } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { DbTransaction } from '@/platform/projection/projection'
import {
  GuildConflict,
  type GuildReads,
  type GuildRepository,
  type GuildUnitOfWork,
} from '../application/guild-repository'
import type { JoinRequest, Member } from '../domain/guild'
import { guilds, members, requests } from './schema'

/** Connexion ou transaction : les mêmes requêtes s'exécutent sur l'une comme sur l'autre. */
type Executor = Db | DbTransaction

/** Contrainte d'unicité à l'origine de chaque conflit, d'après son nom dans la base. */
const CONSTRAINTS: Record<string, GuildConflict['constraint']> = {
  guilds_name_key_unique: 'name',
  members_pkey: 'member',
  requests_player_unique: 'request',
}

/**
 * Traduit une violation de contrainte d'unicité (code SQLSTATE 23505) en conflit du port.
 * Drizzle encapsule l'erreur du pilote : la chaîne des causes est parcourue jusqu'au code.
 */
function toConflict(error: unknown): GuildConflict | null {
  let current: unknown = error
  while (current && typeof current === 'object') {
    const { code, constraint } = current as { code?: string; constraint?: string }
    if (code === '23505' && constraint && CONSTRAINTS[constraint]) {
      return new GuildConflict(CONSTRAINTS[constraint])
    }
    current = (current as { cause?: unknown }).cause
  }
  return null
}

const toMember = (row: typeof members.$inferSelect): Member => ({
  playerId: row.playerId,
  name: row.name,
  role: row.role,
  joinedAt: row.joinedAt,
})

const toRequest = (row: typeof requests.$inferSelect): JoinRequest => ({
  id: row.id,
  guildId: row.guildId,
  playerId: row.playerId,
  playerName: row.playerName,
  sentAt: row.sentAt,
})

/** Lectures, sur une connexion ou dans une transaction. */
function reads(db: Executor): GuildReads {
  return {
    async situation(playerId) {
      const [member] = await db.select().from(members).where(eq(members.playerId, playerId))
      const [request] = await db.select().from(requests).where(eq(requests.playerId, playerId))
      return { guildId: member?.guildId ?? null, request: request ? toRequest(request) : null }
    },

    async findGuild(guildId, { lock = false } = {}) {
      const query = db.select().from(guilds).where(eq(guilds.id, guildId))
      const [row] = lock ? await query.for('update') : await query
      return row ? { id: row.id, name: row.name, createdAt: row.createdAt } : null
    },

    async members(guildId) {
      const rows = await db.select().from(members).where(eq(members.guildId, guildId))
      return rows.map(toMember)
    },

    async requestsOf(guildId) {
      const rows = await db.select().from(requests).where(eq(requests.guildId, guildId))
      return rows.map(toRequest)
    },

    async findRequest(requestId) {
      const [row] = await db.select().from(requests).where(eq(requests.id, requestId))
      return row ? toRequest(row) : null
    },
  }
}

/** Lectures et écritures d'une transaction. */
function unitOfWork(tx: DbTransaction): GuildUnitOfWork {
  return {
    ...reads(tx),

    async createGuild(guild) {
      await tx.insert(guilds).values(guild)
    },

    async addMember(guildId, member) {
      await tx.insert(members).values({ ...member, guildId })
    },

    async removeMember(playerId) {
      await tx.delete(members).where(eq(members.playerId, playerId))
    },

    async setRole(playerId, role) {
      await tx.update(members).set({ role }).where(eq(members.playerId, playerId))
    },

    async deleteGuild(guildId) {
      await tx.delete(requests).where(eq(requests.guildId, guildId))
      await tx.delete(members).where(eq(members.guildId, guildId))
      await tx.delete(guilds).where(eq(guilds.id, guildId))
    },

    async addRequest(request) {
      await tx.insert(requests).values(request)
    },

    async deleteRequest(requestId) {
      const removed = await tx
        .delete(requests)
        .where(eq(requests.id, requestId))
        .returning({ id: requests.id })
      return removed.length > 0
    },
  }
}

/** Adaptateur du port GuildRepository, fondé sur les tables du schéma guild. */
export function createDrizzleGuildRepository(db: Db): GuildRepository {
  return {
    ...reads(db),

    async atomically(work) {
      try {
        return await db.transaction((tx) => work(unitOfWork(tx)))
      } catch (error) {
        // La transaction est annulée ; un conflit d'unicité devient une erreur du port.
        throw toConflict(error) ?? error
      }
    },

    async allWithMembers() {
      const all = await db.select().from(guilds).orderBy(asc(guilds.createdAt))
      if (all.length === 0) return []
      const rows = await db
        .select()
        .from(members)
        .where(
          inArray(
            members.guildId,
            all.map((g) => g.id),
          ),
        )
      return all.map((g) => ({
        guild: { id: g.id, name: g.name, createdAt: g.createdAt },
        members: rows.filter((row) => row.guildId === g.id).map(toMember),
      }))
    },

    async removeRequestsSentBefore(before) {
      const removed = await db
        .delete(requests)
        .where(lt(requests.sentAt, before))
        .returning({ id: requests.id })
      return removed.length
    },
  }
}
