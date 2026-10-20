import { describe, expect, it } from 'vitest'
import { ROUND_MS } from './content'
import { evolve, type GameEvent, initialState, replay } from './game'
import { decide } from './rules'
import { toView } from './view'

const T0 = Date.UTC(2026, 0, 1)

// Expédition d'Alice et Bob, dont la première salle abrite un gobelin.
const events: GameEvent[] = [
  {
    type: 'GameCreated',
    data: { hostId: 'alice', hostName: 'Alice', hero: { hp: 30, attack: 6 }, seed: 42, at: T0 },
  },
  {
    type: 'PlayerJoined',
    data: { playerId: 'bob', name: 'Bob', hero: { hp: 30, attack: 6 }, at: T0 },
  },
  {
    type: 'GameStarted',
    data: {
      rooms: [
        { kind: 'monsters', monsters: [{ kind: 'goblin', hp: 10, attack: 3 }] },
        { kind: 'treasure', gold: 30 },
        { kind: 'empty' },
        { kind: 'empty' },
        { kind: 'empty' },
        { kind: 'monsters', monsters: [{ kind: 'troll', hp: 20, attack: 7 }] },
      ],
      at: T0,
    },
  },
  { type: 'RoomEntered', data: { heroId: 'alice', room: 0, deadline: T0 + ROUND_MS, at: T0 } },
  {
    type: 'ActionSubmitted',
    data: { heroId: 'alice', round: 1, action: { type: 'attack', target: 'm0' }, at: T0 },
  },
]
const state = replay(events)

describe('Donjon - vue filtrée', () => {
  it('ne transmet ni la graine ni le contenu des salles suivantes', () => {
    const view = toView(state, 'bob', T0)
    const json = JSON.stringify(view)
    expect(json).not.toContain('seed')
    expect(json).not.toContain('treasure')
    expect(json).not.toContain('troll')
    expect(view?.currentRoom).toEqual({
      kind: 'monsters',
      monsters: [{ kind: 'goblin', hp: 10, attack: 3 }],
    })
  })

  it("cache l'action choisie par les autres héros, mais signale qu'ils sont prêts", () => {
    const alice = toView(state, 'bob', T0)?.heroes.find((hero) => hero.id === 'alice')
    expect(alice).toMatchObject({ ready: true, action: null })
  })

  it('montre au joueur sa propre action', () => {
    const alice = toView(state, 'alice', T0)?.heroes.find((hero) => hero.id === 'alice')
    expect(alice).toMatchObject({ ready: true, action: { type: 'attack', target: 'm0' } })
  })

  it("distingue l'hôte, les membres et les autres joueurs", () => {
    expect(toView(state, 'alice', T0)).toMatchObject({ isHost: true, isMember: true })
    expect(toView(state, 'bob', T0)).toMatchObject({ isHost: false, isMember: true })
    expect(toView(state, 'carol', T0)).toMatchObject({ isHost: false, isMember: false })
  })

  it('affiche comme résolue une manche échue, sans rien enregistrer', () => {
    const after = T0 + ROUND_MS + 1
    const lazy = toView(state, 'bob', after)
    expect(lazy?.round).toBe(2)
    expect(lazy?.lastRound?.round).toBe(1)

    // La vue calculée lors de la lecture est identique à celle obtenue
    // une fois la résolution enregistrée par la commande d'échéance.
    const decision = decide(state, { type: 'CheckDeadline' }, after + 5000)
    if (!decision.ok) throw new Error('Commande refusée')
    const persisted = decision.events.reduce(evolve, state)
    expect(toView(persisted, 'bob', after)).toEqual(lazy)
  })

  it("renvoie null pour une expédition qui n'existe pas", () => {
    expect(toView(initialState, 'alice', T0)).toBeNull()
  })
})
