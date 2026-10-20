import { describe, expect, it } from 'vitest'
import { DUNGEON_LENGTH, ROUND_MS } from './content'
import { evolve, type GameEvent, type GameState, initialState, type Room, replay } from './game'
import { decide, type GameCommand, generateRooms, resolveRound } from './rules'

// Instant et graine de référence.
const T0 = Date.UTC(2026, 0, 1)
const SEED = 42

// Événements de départ : Alice ouvre l'expédition, Bob la rejoint.
const created: GameEvent = {
  type: 'GameCreated',
  data: { hostId: 'alice', hostName: 'Alice', hero: { hp: 30, attack: 6 }, seed: SEED, at: T0 },
}
const bobJoined: GameEvent = {
  type: 'PlayerJoined',
  data: { playerId: 'bob', name: 'Bob', hero: { hp: 30, attack: 6 }, at: T0 },
}

// Salles choisies par les tests : l'événement GameStarted porte les salles, qui ne sont
// donc pas nécessairement tirées au sort. Les tests décident ainsi du contenu du donjon.
const EMPTY: Room = { kind: 'empty' }
const TROLL: Room = { kind: 'monsters', monsters: [{ kind: 'troll', hp: 20, attack: 7 }] }
const started = (rooms: Room[]): GameEvent => ({ type: 'GameStarted', data: { rooms, at: T0 } })
const withFirstRoom = (first: Room): Room[] => [first, EMPTY, EMPTY, EMPTY, EMPTY, TROLL]
const GOBLIN_FIRST = withFirstRoom({
  kind: 'monsters',
  monsters: [{ kind: 'goblin', hp: 10, attack: 3 }],
})

/** Applique une commande supposée acceptée ; renvoie le nouvel état et les événements produits. */
function play(state: GameState, command: GameCommand, now = T0) {
  const decision = decide(state, command, now)
  if (!decision.ok) throw new Error(`Commande refusée : ${decision.error.code}`)
  return { state: decision.events.reduce(evolve, state), events: decision.events }
}

/** Expédition d'Alice et Bob, entrée dans une première salle occupée par un gobelin. */
function inCombat(): GameState {
  const state = replay([created, bobJoined, started(GOBLIN_FIRST)])
  return play(state, { type: 'OpenDoor', playerId: 'alice' }).state
}

const eventTypes = (events: GameEvent[]) => events.map((event) => event.type)

describe('Donjon - salon', () => {
  it("ouvre une expédition dont l'hôte est le premier héros", () => {
    const command: GameCommand = {
      type: 'CreateGame',
      playerId: 'alice',
      name: 'Alice',
      difficulty: 'hard',
      seed: 1,
    }
    const { state } = play(initialState, command)
    expect(state.phase).toBe('lobby')
    expect(state.difficulty).toBe('hard')
    expect(state.heroes.map((hero) => hero.name)).toEqual(['Alice'])
    expect(state.heroes[0]).toMatchObject({ hp: 30, maxHp: 30, attack: 6 })
  })

  it('lit comme facile une expédition enregistrée sans niveau de difficulté', () => {
    // L'événement created, comme ceux enregistrés au TD6, ne porte pas de niveau de difficulté.
    expect(replay([created]).difficulty).toBe('easy')
  })

  it("refuse qu'un joueur rejoigne deux fois la même expédition", () => {
    const decision = decide(
      replay([created, bobJoined]),
      { type: 'JoinGame', playerId: 'bob', name: 'Bob' },
      T0,
    )
    expect(decision).toEqual({ ok: false, error: { code: 'ALREADY_JOINED' } })
  })

  it('refuse un cinquième héros', () => {
    let state = replay([created])
    for (const id of ['b', 'c', 'd']) {
      state = play(state, { type: 'JoinGame', playerId: id, name: id }).state
    }
    const decision = decide(state, { type: 'JoinGame', playerId: 'e', name: 'e' }, T0)
    expect(decision).toEqual({ ok: false, error: { code: 'GAME_FULL' } })
  })

  it("ne laisse que l'hôte lancer l'expédition", () => {
    const state = replay([created, bobJoined])
    expect(decide(state, { type: 'StartGame', playerId: 'bob' }, T0)).toEqual({
      ok: false,
      error: { code: 'NOT_HOST' },
    })
    expect(play(state, { type: 'StartGame', playerId: 'alice' }).state.phase).toBe('exploring')
  })

  it("refuse de nouveaux héros une fois l'expédition lancée", () => {
    const state = replay([created, started(GOBLIN_FIRST)])
    const decision = decide(state, { type: 'JoinGame', playerId: 'bob', name: 'Bob' }, T0)
    expect(decision).toEqual({ ok: false, error: { code: 'WRONG_PHASE', phase: 'exploring' } })
  })
})

describe('Donjon - tirage des salles', () => {
  it('tire six salles, dont la dernière abrite le troll', () => {
    const rooms = generateRooms(SEED, 2)
    expect(rooms).toHaveLength(DUNGEON_LENGTH)
    expect(rooms[DUNGEON_LENGTH - 1]).toEqual({
      kind: 'monsters',
      monsters: [{ kind: 'troll', hp: 40, attack: 7 }],
    })
  })

  it('donne au troll 20 points de vie par héros', () => {
    const trollHp = (heroCount: number) => {
      const last = generateRooms(SEED, heroCount)[DUNGEON_LENGTH - 1]
      return last.kind === 'monsters' ? last.monsters[0].hp : 0
    }
    expect([1, 2, 3, 4].map(trollHp)).toEqual([20, 40, 60, 80])
  })

  it('tire le même donjon pour la même graine, et un autre pour une autre graine', () => {
    expect(generateRooms(SEED, 2)).toEqual(generateRooms(SEED, 2))
    expect(generateRooms(SEED, 2)).not.toEqual(generateRooms(SEED + 1, 2))
  })

  it("enregistre les salles tirées dans l'événement GameStarted", () => {
    const { events } = play(replay([created]), { type: 'StartGame', playerId: 'alice' })
    expect(events).toEqual([
      { type: 'GameStarted', data: { rooms: generateRooms(SEED, 1), at: T0 } },
    ])
  })
})

describe('Donjon - exploration', () => {
  it('fait ouvrir les portes à tour de rôle', () => {
    const state = replay([created, bobJoined, started(withFirstRoom(EMPTY))])
    expect(decide(state, { type: 'OpenDoor', playerId: 'bob' }, T0)).toEqual({
      ok: false,
      error: { code: 'NOT_YOUR_TURN' },
    })
    const next = play(state, { type: 'OpenDoor', playerId: 'alice' }).state
    expect(next.room).toBe(0)
    expect(next.heroes[next.turn].id).toBe('bob')
  })

  it("ajoute au butin l'or d'un trésor", () => {
    const state = replay([created, started(withFirstRoom({ kind: 'treasure', gold: 25 }))])
    expect(play(state, { type: 'OpenDoor', playerId: 'alice' }).state.loot).toBe(25)
  })

  it('ouvre un combat, avec une échéance, dans une salle occupée par des monstres', () => {
    const state = inCombat()
    expect(state.phase).toBe('combat')
    expect(state.monsters.map((monster) => monster.kind)).toEqual(['goblin'])
    expect(state.round).toBe(1)
    expect(state.deadline).toBe(T0 + ROUND_MS)
  })
})

describe('Donjon - combat', () => {
  it('résout la manche dès que tous les héros ont choisi', () => {
    const attack: GameCommand = {
      type: 'SubmitAction',
      playerId: 'alice',
      round: 1,
      action: { type: 'attack', target: 'm0' },
    }
    const first = play(inCombat(), attack)
    expect(eventTypes(first.events)).toEqual(['ActionSubmitted'])

    const second = play(first.state, { ...attack, playerId: 'bob' })
    expect(eventTypes(second.events)).toEqual(['ActionSubmitted', 'RoundResolved'])
  })

  it("inflige des dégâts compris dans l'écart autorisé autour de l'attaque", () => {
    const state = play(inCombat(), {
      type: 'SubmitAction',
      playerId: 'alice',
      round: 1,
      action: { type: 'attack', target: 'm0' },
    }).state
    const [resolved] = resolveRound(state, T0)
    if (resolved.type !== 'RoundResolved') throw new Error('RoundResolved attendu')
    const hit = resolved.data.effects.find((effect) => effect.source === 'alice')
    expect(hit?.amount).toBeGreaterThanOrEqual(4)
    expect(hit?.amount).toBeLessThanOrEqual(8)
  })

  it('refuse un choix pour une manche déjà résolue', () => {
    const state = inCombat()
    // Bob choisit pour la manche 1 alors que son échéance est passée : la manche 2 a commencé.
    const decision = decide(
      state,
      { type: 'SubmitAction', playerId: 'bob', round: 1, action: { type: 'defend' } },
      T0 + ROUND_MS + 1,
    )
    expect(decision).toEqual({ ok: false, error: { code: 'ROUND_OVER', round: 2 } })
  })

  it("fait défendre, à l'échéance, les héros qui n'ont rien choisi", () => {
    const { events } = play(inCombat(), { type: 'CheckDeadline' }, T0 + ROUND_MS + 1)
    const [resolved] = events
    if (resolved.type !== 'RoundResolved') throw new Error('RoundResolved attendu')
    expect(resolved.data.actions).toEqual({ alice: { type: 'defend' }, bob: { type: 'defend' } })
    // La manche est résolue à l'instant de son échéance, et non à l'instant de la commande.
    expect(resolved.data.at).toBe(T0 + ROUND_MS)
  })

  it('résout toutes les manches échues, chacune à son échéance', () => {
    const { events, state } = play(inCombat(), { type: 'CheckDeadline' }, T0 + 2 * ROUND_MS + 1)
    expect(events.map((event) => event.data.at)).toEqual([T0 + ROUND_MS, T0 + 2 * ROUND_MS])
    expect(state.round).toBe(3)
  })

  it("produit la même résolution quel que soit l'instant du calcul", () => {
    const state = inCombat()
    const early = decide(state, { type: 'CheckDeadline' }, T0 + ROUND_MS + 1)
    const late = decide(state, { type: 'CheckDeadline' }, T0 + ROUND_MS + 20_000)
    expect(early).toEqual(late)
  })

  it("n'enregistre rien lorsqu'aucune manche n'est échue", () => {
    expect(decide(inCombat(), { type: 'CheckDeadline' }, T0 + 1000)).toEqual({
      ok: true,
      events: [],
    })
  })
})

describe("Donjon - fin de l'expédition", () => {
  /** Alice, seule, entre dans la salle du troll après avoir traversé cinq salles vides. */
  function facingTroll(): GameState {
    let state = replay([created, started([EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, TROLL])])
    for (let door = 0; door < DUNGEON_LENGTH; door++) {
      state = play(state, { type: 'OpenDoor', playerId: 'alice' }).state
    }
    return state
  }

  /** Événement de manche fabriqué pour le test : un effet de dégâts, sans tirage. */
  const wound = (state: GameState, target: string, amount: number): GameEvent => ({
    type: 'RoundResolved',
    data: {
      round: state.round,
      actions: {},
      effects: [{ kind: 'damage', source: 'test', target, amount }],
      nextDeadline: T0 + ROUND_MS,
      at: T0,
    },
  })

  it('est gagnée lorsque le troll de la dernière salle est vaincu', () => {
    const state = evolve(facingTroll(), wound(facingTroll(), 'm0', 18))
    const { events, state: after } = play(state, {
      type: 'SubmitAction',
      playerId: 'alice',
      round: state.round,
      action: { type: 'attack', target: 'm0' },
    })
    expect(eventTypes(events)).toEqual(['ActionSubmitted', 'RoundResolved', 'GameEnded'])
    expect(after.phase).toBe('won')
  })

  it('est perdue lorsque tous les héros sont tombés', () => {
    const state = evolve(facingTroll(), wound(facingTroll(), 'alice', 29))
    const { state: after } = play(state, {
      type: 'SubmitAction',
      playerId: 'alice',
      round: state.round,
      action: { type: 'defend' },
    })
    expect(after.phase).toBe('lost')
  })
})
