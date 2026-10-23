import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from '@/platform/db/client'
import {
  createEventStore,
  type EventStore,
  type NewEvent,
} from '@/platform/event-store/event-store'
import { createProjectionRunner, type ProjectionRunner } from '@/platform/projection/projection'
import type { ContributionReader } from '../application/contribution-reader'
import { contributionsProjection } from './contributions-projection'
import { createDrizzleContributionReader } from './drizzle-contribution-reader'

// Chaque test dispose d'un journal neuf et de contributions vides.
let store: EventStore
let runner: ProjectionRunner
let reader: ContributionReader
beforeEach(async () => {
  const db = await createTestDatabase()
  store = createEventStore(db)
  runner = createProjectionRunner(db)
  reader = createDrizzleContributionReader(db, runner)
})

// Événements du Village et du Donjon, réduits aux champs lus par la projection.
const upgraded: NewEvent = { type: 'BuildingUpgraded', data: {} }
const ended = (result: 'won' | 'lost', loot: number, heroIds: string[]): NewEvent => ({
  type: 'GameEnded',
  data: { result, loot, heroIds },
})

describe('Projection des contributions', () => {
  it("compte les améliorations du Village de chaque joueur, d'après le flux de son village", async () => {
    await store.append('village-alice', 0, [upgraded, upgraded])
    await store.append('village-bob', 0, [upgraded])
    expect(await reader.of(['alice', 'bob'])).toEqual({
      alice: { gold: 0, upgrades: 2 },
      bob: { gold: 0, upgrades: 1 },
    })
  })

  it("attribue l'or d'une expédition gagnée à chacun de ses héros, et rien pour une défaite", async () => {
    await store.append('dungeon-g1', 0, [ended('won', 40, ['alice', 'bob'])])
    await store.append('dungeon-g2', 0, [ended('won', 15, ['alice'])])
    await store.append('dungeon-g3', 0, [ended('lost', 90, ['alice'])])
    expect(await reader.of(['alice', 'bob'])).toEqual({
      alice: { gold: 55, upgrades: 0 },
      bob: { gold: 40, upgrades: 0 },
    })
  })

  it('ignore un événement de même type enregistré hors des flux du Village et du Donjon', async () => {
    await store.append('autre-alice', 0, [upgraded, ended('won', 40, ['alice'])])
    expect(await reader.of(['alice'])).toEqual({})
  })

  it("n'applique chaque événement qu'une fois, quel que soit le nombre de lectures", async () => {
    await store.append('village-alice', 0, [upgraded])
    await reader.of(['alice'])
    await reader.of(['alice'])
    expect(await reader.of(['alice'])).toEqual({ alice: { gold: 0, upgrades: 1 } })
  })

  it('reconstruit les mêmes contributions à partir du journal', async () => {
    await store.append('village-alice', 0, [upgraded])
    await store.append('dungeon-g1', 0, [ended('won', 40, ['alice'])])
    const before = await reader.of(['alice'])

    await runner.rebuild(contributionsProjection)
    expect(await reader.of(['alice'])).toEqual(before)
    expect(await runner.positionOf(contributionsProjection.name)).toBe(2)
  })
})
