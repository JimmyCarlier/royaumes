import { inArray } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { EventStore, StoredEvent } from '@/platform/event-store/event-store'
import { ERASED_NAME, type PersonalDataContributor } from '@/platform/privacy/privacy'
import { GAME_CHANNEL_PREFIX } from './contracts'
import { openGames } from './infrastructure/schema'

/** Identifiant de l'expédition d'un événement du Donjon. */
const gameIdOf = (event: StoredEvent) => event.stream.slice(GAME_CHANNEL_PREFIX.length)

/** Participation d'un joueur à une expédition, telle qu'elle figure dans l'export. */
interface Participation {
  gameId: string
  role: 'host' | 'member'
  joinedAt: number
  result: 'won' | 'lost' | null
}

/**
 * Données personnelles du Donjon : le nom du joueur, copié dans les événements de chaque
 * expédition qu'il a ouverte ou rejointe.
 */
export function createDungeonPersonalData(store: EventStore, db: Db): PersonalDataContributor {
  return {
    name: 'dungeon',

    // L'export présente les participations du joueur, et non les événements eux-mêmes :
    // ceux-ci contiennent la graine des expéditions et les noms des autres joueurs.
    async export(playerId) {
      const stored = await store.readAll({
        streamPrefix: GAME_CHANNEL_PREFIX,
        types: ['GameCreated', 'PlayerJoined', 'GameEnded'],
      })
      const games = new Map<string, Participation>()
      for (const event of stored) {
        const gameId = gameIdOf(event)
        const at = event.data.at as number
        if (event.type === 'GameCreated' && event.data.hostId === playerId) {
          games.set(gameId, { gameId, role: 'host', joinedAt: at, result: null })
        } else if (event.type === 'PlayerJoined' && event.data.playerId === playerId) {
          games.set(gameId, { gameId, role: 'member', joinedAt: at, result: null })
        } else if (event.type === 'GameEnded' && games.has(gameId)) {
          const game = games.get(gameId)
          if (game) game.result = event.data.result as 'won' | 'lost'
        }
      }
      return { expeditions: [...games.values()] }
    },

    redact(event, playerId) {
      if (!event.stream.startsWith(GAME_CHANNEL_PREFIX)) return null
      if (event.type === 'GameCreated' && event.data.hostId === playerId) {
        return event.data.hostName === ERASED_NAME ? null : { ...event.data, hostName: ERASED_NAME }
      }
      if (event.type === 'PlayerJoined' && event.data.playerId === playerId) {
        return event.data.name === ERASED_NAME ? null : { ...event.data, name: ERASED_NAME }
      }
      return null
    },

    // La liste des expéditions ouvertes contient le nom de l'hôte : celui des expéditions
    // dont l'événement GameCreated vient d'être réécrit est remplacé.
    async erase(_playerId, rewritten) {
      const hosted = rewritten
        .filter(
          (event) => event.type === 'GameCreated' && event.stream.startsWith(GAME_CHANNEL_PREFIX),
        )
        .map(gameIdOf)
      if (hosted.length === 0) return
      await db
        .update(openGames)
        .set({ hostName: ERASED_NAME })
        .where(inArray(openGames.gameId, hosted))
    },
  }
}
