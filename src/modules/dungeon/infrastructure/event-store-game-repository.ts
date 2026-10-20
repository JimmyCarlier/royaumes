import type { EventStore, NewEvent, StoredEvent } from '@/platform/event-store/event-store'
import type { GameRepository } from '../application/game-repository'
import { gameChannel } from '../contracts'
import { type GameEvent, replay } from '../domain/game'

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
  }
}
