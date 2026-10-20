import { describe, expect, it } from 'vitest'
import { OPEN_GAME_MS } from './content'
import type { GameEvent } from './game'
import { type GameEventOf, openGames } from './lobby'

const T0 = Date.UTC(2026, 0, 1)
const hero = { hp: 30, attack: 6 }

// Fabriques d'événements, rattachés à une expédition.
const created = (gameId: string, hostName: string, at = T0): GameEventOf => ({
  gameId,
  event: { type: 'GameCreated', data: { hostId: hostName, hostName, hero, seed: 1, at } },
})
const joined = (gameId: string, name: string): GameEventOf => ({
  gameId,
  event: { type: 'PlayerJoined', data: { playerId: name, name, hero, at: T0 } },
})
const started = (gameId: string): GameEventOf => ({
  gameId,
  event: { type: 'GameStarted', data: { rooms: [], at: T0 } } satisfies GameEvent,
})

describe('Donjon - expéditions ouvertes', () => {
  it('liste les expéditions non lancées, les plus récentes en tête', () => {
    const games = openGames([created('g1', 'Alice'), created('g2', 'Bob', T0 + 1000)], T0 + 2000)
    expect(games).toEqual([
      { gameId: 'g2', hostName: 'Bob', heroCount: 1, createdAt: T0 + 1000 },
      { gameId: 'g1', hostName: 'Alice', heroCount: 1, createdAt: T0 },
    ])
  })

  it('écarte les expéditions lancées ou complètes, et compte les héros', () => {
    const events = [
      created('g1', 'Alice'),
      joined('g1', 'Bob'),
      created('g2', 'Carol'),
      started('g2'),
      created('g3', 'Dan'),
      ...['e', 'f', 'g'].map((name) => joined('g3', name)),
    ]
    expect(openGames(events, T0).map((game) => [game.gameId, game.heroCount])).toEqual([['g1', 2]])
  })

  it("écarte les expéditions ouvertes depuis plus d'une heure", () => {
    expect(openGames([created('g1', 'Alice')], T0 + OPEN_GAME_MS)).toEqual([])
  })
})
