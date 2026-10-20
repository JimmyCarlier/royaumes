import { eq, sql } from 'drizzle-orm'
import type { StoredEvent } from '@/platform/event-store/event-store'
import type { Projection } from '@/platform/projection/projection'
import { GAME_CHANNEL_PREFIX } from '../contracts'
import type { GameEvent } from '../domain/game'
import { openGames } from './schema'

/** Identifiant de l'expédition tiré du nom de son flux : « dungeon-7f3a » donne « 7f3a ». */
const gameIdOf = (event: StoredEvent) => event.stream.slice(GAME_CHANNEL_PREFIX.length)

/**
 * Projection des expéditions ouvertes. Elle lit les propres événements du module :
 * ils sont donc typés par le domaine, et non décrits à nouveau comme dans le Classement.
 */
export const openGamesProjection: Projection = {
  name: 'dungeon-open-games',
  version: 1,
  eventTypes: ['GameCreated', 'PlayerJoined', 'CompanionAdded', 'GameStarted', 'GameEnded'],

  async apply(stored, tx) {
    const event = { type: stored.type, data: stored.data } as GameEvent
    const gameId = gameIdOf(stored)

    switch (event.type) {
      case 'GameCreated':
        await tx
          .insert(openGames)
          .values({ gameId, hostName: event.data.hostName, heroCount: 1, createdAt: event.data.at })
        return

      // Un compagnon occupe une place, comme un joueur : il compte parmi les héros.
      case 'PlayerJoined':
      case 'CompanionAdded':
        await tx
          .update(openGames)
          .set({ heroCount: sql`${openGames.heroCount} + 1` })
          .where(eq(openGames.gameId, gameId))
        return

      // Une expédition lancée, ou terminée sans avoir été lancée, ne peut plus être rejointe.
      case 'GameStarted':
      case 'GameEnded':
        await tx.delete(openGames).where(eq(openGames.gameId, gameId))
        return
    }
  },

  async reset(tx) {
    await tx.delete(openGames)
  },
}
