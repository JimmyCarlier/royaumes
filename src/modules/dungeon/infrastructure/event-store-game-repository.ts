import type { EventStore, NewEvent, StoredEvent } from '@/platform/event-store/event-store'
import type { GameRepository } from '../application/game-repository'
import { GAME_CHANNEL_PREFIX, gameChannel } from '../contracts'
import { type GameEvent, replay } from '../domain/game'
import { openGames } from '../domain/lobby'

/** Reconvertit un événement relu dans le journal en événement du domaine. */
const toGameEvent = (stored: StoredEvent) => ({ type: stored.type, data: stored.data }) as GameEvent

/** Adaptateur du port GameRepository fondé sur le journal d'événements. */
export function createEventStoreGameRepository(store: EventStore): GameRepository {
  return {
    async load(gameId) {
      const stored = await store.read(gameChannel(gameId))
      return { state: replay(stored.map(toGameEvent)), version: stored.at(-1)?.version ?? 0 }
    },

    async save(gameId, expectedVersion, events) {
      await store.append(gameChannel(gameId), expectedVersion, events as unknown as NewEvent[])
    },

    async listOpenGames(now) {
      // Seuls les trois types d'événements utiles à la liste sont relus, pour toutes les expéditions.
      const stored = await store.readAll({
        streamPrefix: GAME_CHANNEL_PREFIX,
        types: ['GameCreated', 'PlayerJoined', 'GameStarted'],
      })
      const events = stored.map((event) => ({
        gameId: event.stream.slice(GAME_CHANNEL_PREFIX.length),
        event: toGameEvent(event),
      }))
      return openGames(events, now)
    },
  }
}
