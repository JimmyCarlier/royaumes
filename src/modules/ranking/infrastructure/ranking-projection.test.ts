import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from '@/platform/db/client'
import {
  createEventStore,
  type EventStore,
  type NewEvent,
} from '@/platform/event-store/event-store'
import { createProjectionRunner } from '@/platform/projection/projection'
import type { RankingReader } from '../application/ranking-reader'
import { createDrizzleRankingReader } from './drizzle-ranking-reader'

// Chaque test dispose d'un journal neuf et d'un classement vide.
let store: EventStore
let reader: RankingReader
beforeEach(async () => {
  const db = await createTestDatabase()
  store = createEventStore(db)
  reader = createDrizzleRankingReader(db, createProjectionRunner(db))
})

// Événements du Donjon et du Village, réduits aux champs lus par le classement.
const created = (hostId: string): NewEvent => ({
  type: 'GameCreated',
  data: { hostId, hostName: hostId.toUpperCase() },
})
const joined = (playerId: string): NewEvent => ({
  type: 'PlayerJoined',
  data: { playerId, name: playerId.toUpperCase() },
})
const companion: NewEvent = { type: 'CompanionAdded', data: { companionId: 'companion-1' } }
const ended = (result: 'won' | 'lost', loot: number, heroIds: string[]): NewEvent => ({
  type: 'GameEnded',
  data: { result, loot, heroIds },
})

/** Ligne du classement d'un joueur. */
const entryOf = async (playerId: string) =>
  (await reader.top(20)).find((entry) => entry.playerId === playerId)

describe('Projection du classement', () => {
  it("attribue le résultat d'une expédition gagnée à ses joueurs, sans les compagnons", async () => {
    await store.append('dungeon-g1', 0, [
      created('alice'),
      joined('bob'),
      companion,
      ended('won', 40, ['alice', 'bob', 'companion-1']),
    ])

    const entries = await reader.top(20)
    expect(entries.map((entry) => entry.playerId).sort()).toEqual(['alice', 'bob'])
    expect(await entryOf('alice')).toMatchObject({
      label: 'ALICE',
      gamesPlayed: 1,
      gamesWon: 1,
      gold: 40,
    })
  })

  it('compte une défaite comme une expédition, sans victoire ni or', async () => {
    await store.append('dungeon-g1', 0, [created('alice'), ended('lost', 25, ['alice'])])
    expect(await entryOf('alice')).toMatchObject({ gamesPlayed: 1, gamesWon: 0, gold: 0 })
  })

  it("compte les améliorations du Village, et nomme le joueur d'après son village", async () => {
    await store.append('village-carol', 0, [
      { type: 'VillageFounded', data: { name: 'Valombre' } },
      { type: 'BuildingUpgraded', data: {} },
      { type: 'BuildingUpgraded', data: {} },
    ])
    expect(await entryOf('carol')).toMatchObject({ label: 'Seigneur de Valombre', upgrades: 2 })
  })

  it('retient le meilleur butin des expéditions gagnées', async () => {
    await store.append('dungeon-g1', 0, [created('alice'), ended('won', 25, ['alice'])])
    await store.append('dungeon-g2', 0, [created('alice'), ended('won', 40, ['alice'])])
    await store.append('dungeon-g3', 0, [created('alice'), ended('won', 10, ['alice'])])
    await store.append('dungeon-g4', 0, [created('alice'), ended('lost', 90, ['alice'])])
    expect(await entryOf('alice')).toMatchObject({ gamesWon: 3, gold: 75, bestLoot: 40 })
  })

  it('range les joueurs par victoires, puis par or', async () => {
    await store.append('dungeon-g1', 0, [created('alice'), ended('won', 10, ['alice'])])
    await store.append('dungeon-g2', 0, [created('bob'), ended('won', 30, ['bob'])])
    await store.append('dungeon-g3', 0, [created('carol'), ended('lost', 0, ['carol'])])
    await store.append('dungeon-g4', 0, [created('alice'), ended('won', 5, ['alice'])])

    const entries = await reader.top(20)
    expect(entries.map((entry) => [entry.rank, entry.playerId])).toEqual([
      [1, 'alice'],
      [2, 'bob'],
      [3, 'carol'],
    ])
  })
})
