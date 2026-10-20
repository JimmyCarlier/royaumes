import { describe, expect, it } from 'vitest'
import { ROUND_MS } from './content'
import type { Action, GameEvent, Hero, Monster } from './game'
import { replay } from './game'
import { easyStrategy, hardStrategy, type TargetingContext } from './monster-strategies'
import { seeded } from './random'
import { resolveRound } from './rules'

// Combattants fabriqués pour les tests.
const hero = (id: string, hp: number): Hero => ({ id, name: id, hp, maxHp: 30, attack: 6 })
const troll: Monster = { id: 'm0', kind: 'troll', hp: 40, maxHp: 40, attack: 7 }

/** Situation de test : le troll attaque, avec les actions données. */
const context = (heroes: Hero[], actions: Record<string, Action> = {}, seed = 1) =>
  ({ monster: troll, heroes, actions, random: seeded(seed) }) satisfies TargetingContext

const DEFEND: Action = { type: 'defend' }
const ATTACK: Action = { type: 'attack', target: 'm0' }

describe('Stratégie facile', () => {
  const heroes = [hero('alice', 30), hero('bob', 30), hero('carol', 30)]

  it('vise toujours un des héros proposés (invariant, sur 200 graines)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      expect(heroes).toContain(easyStrategy(context(heroes, {}, seed)))
    }
  })

  it('répartit ses attaques entre tous les héros (statistique, sur 300 graines)', () => {
    const counts: Record<string, number> = {}
    for (let seed = 1; seed <= 300; seed++) {
      const target = easyStrategy(context(heroes, {}, seed))
      counts[target.id] = (counts[target.id] ?? 0) + 1
    }
    // Chacun des trois héros est visé environ 100 fois ; au moins 70 fois avec ces graines.
    for (const { id } of heroes) expect(counts[id]).toBeGreaterThanOrEqual(70)
  })
})

describe('Stratégie difficile', () => {
  it("vise un héros qu'elle fera tomber à coup sûr, plutôt que le plus faible", () => {
    // Alice est la plus faible, mais se défend : 3 dégâts au moins, elle survit.
    // Bob n'a que 5 points de vie et ne se défend pas : 6 dégâts au moins, il tombe.
    const target = hardStrategy(
      context([hero('alice', 4), hero('bob', 5)], { alice: DEFEND, bob: ATTACK }),
    )
    expect(target.id).toBe('bob')
  })

  it('évite les héros qui se défendent', () => {
    const target = hardStrategy(
      context([hero('alice', 10), hero('bob', 20)], { alice: DEFEND, bob: ATTACK }),
    )
    expect(target.id).toBe('bob')
  })

  it('vise le plus faible lorsque tous les héros se défendent', () => {
    const target = hardStrategy(
      context([hero('alice', 20), hero('bob', 10)], { alice: DEFEND, bob: DEFEND }),
    )
    expect(target.id).toBe('bob')
  })
})

describe('Stratégies dans la résolution', () => {
  /** Alice et Bob face à un troll, Alice étant déjà tombée. */
  const events = (difficulty: 'easy' | 'hard', seed: number): GameEvent[] => [
    {
      type: 'GameCreated',
      data: {
        hostId: 'alice',
        hostName: 'Alice',
        hero: { hp: 30, attack: 6 },
        difficulty,
        seed,
        at: 0,
      },
    },
    {
      type: 'PlayerJoined',
      data: { playerId: 'bob', name: 'Bob', hero: { hp: 30, attack: 6 }, at: 0 },
    },
    {
      type: 'GameStarted',
      data: {
        rooms: [{ kind: 'monsters', monsters: [{ kind: 'troll', hp: 40, attack: 7 }] }],
        at: 0,
      },
    },
    { type: 'RoomEntered', data: { heroId: 'alice', room: 0, deadline: ROUND_MS, at: 0 } },
    {
      type: 'RoundResolved',
      data: {
        round: 1,
        actions: {},
        effects: [{ kind: 'damage', source: 'test', target: 'alice', amount: 30 }],
        nextDeadline: 2 * ROUND_MS,
        at: ROUND_MS,
      },
    },
  ]

  it('ne vise jamais un héros tombé, à aucun niveau (invariant, sur 100 graines)', () => {
    for (const difficulty of ['easy', 'hard'] as const) {
      for (let seed = 1; seed <= 100; seed++) {
        const [resolved] = resolveRound(replay(events(difficulty, seed)), 2 * ROUND_MS)
        if (resolved.type !== 'RoundResolved') throw new Error('RoundResolved attendu')
        const hits = resolved.data.effects.filter((effect) => effect.source === 'm0')
        expect(hits.map((effect) => effect.target)).toEqual(['bob'])
      }
    }
  })
})
