import { describe, expect, it } from 'vitest'
import { chooseCompanionAction } from './companion'
import { ROUND_MS } from './content'
import type { GameEvent, Hero, Monster } from './game'
import { replay } from './game'
import { toView } from './view'

// Combattants fabriqués pour les tests.
const hero = (id: string, hp: number): Hero => ({
  id,
  name: id,
  hp,
  maxHp: 30,
  attack: 6,
  companion: id.startsWith('companion'),
})
const monster = (id: string, hp: number): Monster => ({
  id,
  kind: 'goblin',
  hp,
  maxHp: 10,
  attack: 3,
})

describe('Intelligence artificielle du compagnon', () => {
  it('soigne le plus atteint des héros en danger', () => {
    const action = chooseCompanionAction({
      heroes: [hero('alice', 10), hero('bob', 5), hero('companion-1', 30)],
      monsters: [monster('m0', 10)],
    })
    expect(action).toEqual({ type: 'heal', target: 'bob' })
  })

  it("attaque le monstre le plus affaibli lorsqu'aucun héros n'est en danger", () => {
    // 12 points de vie sur 30 : exactement 40 %, ce n'est pas encore un danger.
    const action = chooseCompanionAction({
      heroes: [hero('alice', 12), hero('companion-1', 30)],
      monsters: [monster('m0', 10), monster('m1', 4)],
    })
    expect(action).toEqual({ type: 'attack', target: 'm1' })
  })

  it('se soigne lui-même lorsque lui seul est en danger', () => {
    const action = chooseCompanionAction({
      heroes: [hero('alice', 30), hero('companion-1', 6)],
      monsters: [monster('m0', 10)],
    })
    expect(action).toEqual({ type: 'heal', target: 'companion-1' })
  })
})

describe('Compagnon dans la vue', () => {
  // Alice et son compagnon, en combat contre un gobelin ; Alice n'a pas encore choisi.
  const events: GameEvent[] = [
    {
      type: 'GameCreated',
      data: { hostId: 'alice', hostName: 'Alice', hero: { hp: 30, attack: 6 }, seed: 1, at: 0 },
    },
    {
      type: 'CompanionAdded',
      data: { companionId: 'companion-1', name: 'Compagnon 1', hero: { hp: 30, attack: 6 }, at: 0 },
    },
    {
      type: 'GameStarted',
      data: {
        rooms: [{ kind: 'monsters', monsters: [{ kind: 'goblin', hp: 10, attack: 3 }] }],
        at: 0,
      },
    },
    { type: 'RoomEntered', data: { heroId: 'alice', room: 0, deadline: ROUND_MS, at: 0 } },
  ]

  it('présente le compagnon comme prêt, et ne le compte pas parmi les membres', () => {
    const view = toView(replay(events), 'companion-1', 0)
    expect(view?.heroes.map((h) => [h.id, h.companion, h.ready])).toEqual([
      ['alice', false, false],
      ['companion-1', true, true],
    ])
    // Personne ne peut se faire passer pour un compagnon : il n'est pas membre de l'expédition.
    expect(view?.isMember).toBe(false)
  })
})
