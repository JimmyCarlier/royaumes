import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from '@/platform/db/client'
import {
  createEventStore,
  type EventStore,
  type NewEvent,
} from '@/platform/event-store/event-store'
import { createProjectionRunner } from '@/platform/projection/projection'
import type { OpenGamesReader } from '../application/open-games-reader'
import { OPEN_GAME_MS } from '../domain/content'
import { createDrizzleOpenGamesReader } from './drizzle-open-games-reader'

const T0 = Date.UTC(2026, 0, 1)
const hero = { hp: 30, attack: 6 }

// Chaque test dispose d'un journal neuf et d'une liste vide.
let store: EventStore
let reader: OpenGamesReader
beforeEach(async () => {
  const db = await createTestDatabase()
  store = createEventStore(db)
  reader = createDrizzleOpenGamesReader(db, createProjectionRunner(db))
})

// Fabriques d'événements du Donjon.
const created = (hostName: string, at = T0): NewEvent => ({
  type: 'GameCreated',
  data: { hostId: hostName, hostName, hero, seed: 1, at },
})
const joined = (name: string): NewEvent => ({
  type: 'PlayerJoined',
  data: { playerId: name, name, hero, at: T0 },
})
const companion = (n: number): NewEvent => ({
  type: 'CompanionAdded',
  data: { companionId: `companion-${n}`, name: `Compagnon ${n}`, hero, at: T0 },
})
const started: NewEvent = { type: 'GameStarted', data: { rooms: [], at: T0 } }

describe('Projection des expéditions ouvertes', () => {
  it('liste les expéditions non lancées, les plus récentes en tête', async () => {
    await store.append('dungeon-g1', 0, [created('Alice')])
    await store.append('dungeon-g2', 0, [created('Bob', T0 + 1000)])

    expect(await reader.list(T0 + 2000)).toEqual([
      { gameId: 'g2', hostName: 'Bob', heroCount: 1, createdAt: T0 + 1000 },
      { gameId: 'g1', hostName: 'Alice', heroCount: 1, createdAt: T0 },
    ])
  })

  it('écarte les expéditions lancées, et compte les héros', async () => {
    await store.append('dungeon-g1', 0, [created('Alice'), joined('Bob')])
    await store.append('dungeon-g2', 0, [created('Carol'), started])

    const games = await reader.list(T0)
    expect(games.map((game) => [game.gameId, game.heroCount])).toEqual([['g1', 2]])
  })

  it('compte les compagnons parmi les héros, et écarte les expéditions complètes', async () => {
    await store.append('dungeon-g1', 0, [created('Alice'), companion(1)])
    await store.append('dungeon-g2', 0, [created('Bob'), companion(1), companion(2), companion(3)])

    const games = await reader.list(T0)
    expect(games.map((game) => [game.gameId, game.heroCount])).toEqual([['g1', 2]])
  })

  it("écarte les expéditions ouvertes depuis plus d'une heure", async () => {
    await store.append('dungeon-g1', 0, [created('Alice')])
    expect(await reader.list(T0 + OPEN_GAME_MS)).toEqual([])
  })
})
