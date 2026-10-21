import { asc, eq, lt } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { PresenceRepository } from '../application/presence-repository'
import { presence } from './schema'

/** Adaptateur du port PresenceRepository, fondé sur la table tavern.presence. */
export function createDrizzlePresenceRepository(db: Db): PresenceRepository {
  return {
    async touch(player, at) {
      // Une seule instruction : insertion à l'arrivée, mise à jour aux signaux suivants.
      await db
        .insert(presence)
        .values({ playerId: player.id, playerName: player.name, lastSeen: at })
        .onConflictDoUpdate({
          target: presence.playerId,
          set: { playerName: player.name, lastSeen: at },
        })
    },

    async remove(playerId) {
      await db.delete(presence).where(eq(presence.playerId, playerId))
    },

    async removeStale(before) {
      await db.delete(presence).where(lt(presence.lastSeen, before))
    },

    list() {
      return db
        .select({ id: presence.playerId, name: presence.playerName })
        .from(presence)
        .orderBy(asc(presence.playerName))
    },
  }
}
