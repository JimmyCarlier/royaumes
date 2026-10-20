/**
 * Règles du Donjon, selon le modèle decider :
 *   decide(état, commande, maintenant) -> événements ou erreur métier
 * Tout le hasard du jeu est tiré ici, avec un générateur à graine, et enregistré
 * dans les événements : evolve (game.ts) ne fait qu'appliquer les résultats.
 */
import {
  BOSS,
  COMMON_MONSTERS,
  DAMAGE_SPREAD,
  type Difficulty,
  DUNGEON_LENGTH,
  HEAL_AMOUNT,
  HERO,
  MAX_HEROES,
  MONSTERS,
  type MonsterKind,
  ROOM_ODDS,
  ROUND_MS,
  TREASURE_GOLD,
} from './content'
import {
  type Action,
  applyEffect,
  type Effect,
  evolve,
  type GameEvent,
  type GameState,
  type MonsterSpec,
  type Phase,
  type Room,
  standingHeroes,
  standingMonsters,
} from './game'
import { MONSTER_STRATEGIES } from './monster-strategies'
import { mix, pick, type Random, randomInt, seeded } from './random'

// ---------------------------------------------------------------------------
// Commandes : des intentions, nommées à l'impératif
// ---------------------------------------------------------------------------

export type GameCommand =
  | { type: 'CreateGame'; playerId: string; name: string; difficulty: Difficulty; seed: number }
  | { type: 'JoinGame'; playerId: string; name: string }
  | { type: 'StartGame'; playerId: string }
  | { type: 'OpenDoor'; playerId: string }
  // round : la manche pour laquelle le joueur a choisi, telle qu'il l'a vue à l'écran.
  | { type: 'SubmitAction'; playerId: string; round: number; action: Action }
  // Commande d'échéance : n'a pas d'autre effet que d'enregistrer les manches échues.
  | { type: 'CheckDeadline' }

// ---------------------------------------------------------------------------
// Résultat d'une décision : des événements, ou une erreur métier
// ---------------------------------------------------------------------------

export type GameError =
  | { code: 'GAME_NOT_FOUND' }
  | { code: 'ALREADY_EXISTS' }
  | { code: 'WRONG_PHASE'; phase: Phase }
  | { code: 'GAME_FULL' }
  | { code: 'ALREADY_JOINED' }
  | { code: 'NOT_A_MEMBER' }
  | { code: 'NOT_HOST' }
  | { code: 'NOT_YOUR_TURN' }
  | { code: 'HERO_DOWN' }
  | { code: 'ROUND_OVER'; round: number }
  | { code: 'ALREADY_CHOSEN' }
  | { code: 'INVALID_TARGET' }

export type Decision = { ok: true; events: GameEvent[] } | { ok: false; error: GameError }

const fail = (error: GameError): Decision => ({ ok: false, error })

// ---------------------------------------------------------------------------
// Tirages au sort
// ---------------------------------------------------------------------------

/**
 * Tire le contenu des salles. La graine dérivée mix(seed, 0) ne sert qu'aux salles :
 * le même donjon est obtenu pour la même graine et le même nombre de héros.
 */
export function generateRooms(seed: number, heroCount: number): Room[] {
  const random = seeded(mix(seed, 0))
  const rooms: Room[] = []
  for (let index = 0; index < DUNGEON_LENGTH - 1; index++) {
    const roll = random()
    if (roll < ROOM_ODDS.empty) {
      rooms.push({ kind: 'empty' })
    } else if (roll < ROOM_ODDS.empty + ROOM_ODDS.treasure) {
      rooms.push({
        kind: 'treasure',
        gold: randomInt(random, TREASURE_GOLD.min, TREASURE_GOLD.max),
      })
    } else {
      // Le nombre de monstres suit le nombre de héros, sans dépasser 3.
      const count = randomInt(random, 1, Math.min(3, heroCount))
      const monsters = Array.from({ length: count }, () => spec(pick(random, COMMON_MONSTERS)))
      rooms.push({ kind: 'monsters', monsters })
    }
  }
  // La dernière salle abrite toujours le troll, dont les points de vie dépendent du nombre de héros.
  const boss = spec(BOSS)
  rooms.push({ kind: 'monsters', monsters: [{ ...boss, hp: boss.hp * heroCount }] })
  return rooms
}

/** Caractéristiques d'un monstre, lues dans le contenu du jeu au moment du tirage. */
const spec = (kind: MonsterKind): MonsterSpec => ({
  kind,
  hp: MONSTERS[kind].hp,
  attack: MONSTERS[kind].attack,
})

/** Dégâts infligés par un combattant : son attaque, plus ou moins l'écart autorisé. */
const rollDamage = (random: Random, attack: number, spread: number) =>
  Math.max(1, randomInt(random, attack - spread, attack + spread))

// ---------------------------------------------------------------------------
// Résolution d'une manche
// ---------------------------------------------------------------------------

/**
 * Résout la manche en cours à l'instant at, et renvoie les événements qui en résultent.
 * La graine dérivée mix(seed, 1, round) ne dépend que de la manche : la résolution
 * produit toujours le même résultat, quel que soit le moment où elle est calculée.
 */
export function resolveRound(state: GameState, at: number): GameEvent[] {
  const random = seeded(mix(state.seed, 1, state.round))

  // Un héros debout qui n'a rien choisi se défend.
  const actions: Record<string, Action> = {}
  for (const hero of standingHeroes(state)) {
    actions[hero.id] = state.choices[hero.id] ?? { type: 'defend' }
  }

  // Copies de travail, mises à jour effet après effet.
  let heroes = state.heroes
  let monsters = state.monsters
  const effects: Effect[] = []

  const record = (effect: Effect) => {
    effects.push(effect)
    heroes = applyEffect(heroes, effect)
    monsters = applyEffect(monsters, effect)
  }
  const isStanding = (id: string) => [...heroes, ...monsters].some((f) => f.id === id && f.hp > 0)

  // 1. Les soins, appliqués avant toute attaque.
  for (const [heroId, action] of Object.entries(actions)) {
    if (action.type !== 'heal' || !isStanding(action.target)) continue
    record({ kind: 'heal', source: heroId, target: action.target, amount: HEAL_AMOUNT })
  }

  // 2. Les attaques des héros. Si la cible est déjà vaincue, le premier monstre debout est visé.
  for (const [heroId, action] of Object.entries(actions)) {
    if (action.type !== 'attack') continue
    const target = isStanding(action.target)
      ? action.target
      : monsters.find((monster) => monster.hp > 0)?.id
    if (!target) break
    const attack = heroes.find((hero) => hero.id === heroId)?.attack ?? 0
    const amount = rollDamage(random, attack, DAMAGE_SPREAD.hero)
    record({ kind: 'damage', source: heroId, target, amount })
  }

  // 3. Les attaques des monstres encore debout, dont la cible est choisie par la stratégie
  //    du niveau de difficulté. La défense divise les dégâts par deux.
  const strategy = MONSTER_STRATEGIES[state.difficulty]
  for (const monster of monsters) {
    const targets = heroes.filter((hero) => hero.hp > 0)
    if (monster.hp <= 0 || targets.length === 0) continue
    const target = strategy({ monster, heroes: targets, actions, random })
    let amount = rollDamage(random, monster.attack, DAMAGE_SPREAD.monster)
    if (actions[target.id]?.type === 'defend') amount = Math.ceil(amount / 2)
    record({ kind: 'damage', source: monster.id, target: target.id, amount })
  }

  // 4. Issue de la manche.
  const heroesLeft = heroes.some((hero) => hero.hp > 0)
  const monstersLeft = monsters.some((monster) => monster.hp > 0)
  const combatGoesOn = heroesLeft && monstersLeft
  const events: GameEvent[] = [
    {
      type: 'RoundResolved',
      data: {
        round: state.round,
        actions,
        effects,
        nextDeadline: combatGoesOn ? at + ROUND_MS : null,
        at,
      },
    },
  ]
  const lastRoom = state.room === DUNGEON_LENGTH - 1
  if (!heroesLeft || (!monstersLeft && lastRoom)) {
    const result = heroesLeft ? 'won' : 'lost'
    const heroIds = state.heroes.map((hero) => hero.id)
    events.push({ type: 'GameEnded', data: { result, loot: state.loot, heroIds, at } })
  }
  return events
}

/**
 * Échéances paresseuses : renvoie les événements de résolution de toutes les manches
 * dont l'échéance est passée à l'instant now. Chaque manche échue est résolue à l'instant
 * de son échéance, et non à l'instant now : le résultat ne dépend pas du moment du calcul.
 */
export function settle(state: GameState, now: number): GameEvent[] {
  const events: GameEvent[] = []
  let current = state
  while (current.phase === 'combat' && current.deadline !== null && current.deadline <= now) {
    const resolution = resolveRound(current, current.deadline)
    events.push(...resolution)
    current = resolution.reduce(evolve, current)
  }
  return events
}

// ---------------------------------------------------------------------------
// decide : enregistre les manches échues, puis traite la commande
// ---------------------------------------------------------------------------

export function decide(state: GameState, command: GameCommand, now: number): Decision {
  const due = settle(state, now)
  const current = due.reduce(evolve, state)
  const decision = decideCommand(current, command, now)
  // Si la commande est refusée, rien n'est enregistré, pas même les manches échues.
  return decision.ok ? { ok: true, events: [...due, ...decision.events] } : decision
}

const isMember = (state: GameState, playerId: string) =>
  state.heroes.some((hero) => hero.id === playerId)

function decideCommand(state: GameState, command: GameCommand, now: number): Decision {
  if (command.type === 'CreateGame') {
    if (state.exists) return fail({ code: 'ALREADY_EXISTS' })
    const { playerId, name, difficulty, seed } = command
    return {
      ok: true,
      events: [
        {
          type: 'GameCreated',
          data: { hostId: playerId, hostName: name, hero: { ...HERO }, difficulty, seed, at: now },
        },
      ],
    }
  }

  if (!state.exists) return fail({ code: 'GAME_NOT_FOUND' })

  switch (command.type) {
    case 'JoinGame':
      if (state.phase !== 'lobby') return fail({ code: 'WRONG_PHASE', phase: state.phase })
      if (isMember(state, command.playerId)) return fail({ code: 'ALREADY_JOINED' })
      if (state.heroes.length >= MAX_HEROES) return fail({ code: 'GAME_FULL' })
      return {
        ok: true,
        events: [
          {
            type: 'PlayerJoined',
            data: { playerId: command.playerId, name: command.name, hero: { ...HERO }, at: now },
          },
        ],
      }

    case 'StartGame':
      if (state.phase !== 'lobby') return fail({ code: 'WRONG_PHASE', phase: state.phase })
      if (command.playerId !== state.hostId) return fail({ code: 'NOT_HOST' })
      // Les salles tirées au sort sont enregistrées dans l'événement.
      return {
        ok: true,
        events: [
          {
            type: 'GameStarted',
            data: { rooms: generateRooms(state.seed, state.heroes.length), at: now },
          },
        ],
      }

    case 'OpenDoor': {
      // DETTE TECHNIQUE DT-006 (docs/qualite/dette-technique.md) : l'exploration n'a pas d'échéance ;
      // un joueur absent lorsque vient son tour bloque toute l'expédition.
      if (state.phase !== 'exploring') return fail({ code: 'WRONG_PHASE', phase: state.phase })
      if (!isMember(state, command.playerId)) return fail({ code: 'NOT_A_MEMBER' })
      if (state.heroes[state.turn].id !== command.playerId) return fail({ code: 'NOT_YOUR_TURN' })
      const room = state.room + 1
      // Une salle occupée par des monstres ouvre la première manche, dont l'échéance est fixée ici.
      const deadline = state.rooms[room].kind === 'monsters' ? now + ROUND_MS : null
      return {
        ok: true,
        events: [
          { type: 'RoomEntered', data: { heroId: command.playerId, room, deadline, at: now } },
        ],
      }
    }

    case 'SubmitAction': {
      if (state.phase !== 'combat') return fail({ code: 'WRONG_PHASE', phase: state.phase })
      const hero = state.heroes.find((candidate) => candidate.id === command.playerId)
      if (!hero) return fail({ code: 'NOT_A_MEMBER' })
      if (hero.hp <= 0) return fail({ code: 'HERO_DOWN' })
      // Le joueur a choisi pour une manche qui a déjà été résolue.
      if (command.round !== state.round) return fail({ code: 'ROUND_OVER', round: state.round })
      if (state.choices[hero.id]) return fail({ code: 'ALREADY_CHOSEN' })
      if (!isValidTarget(state, command.action)) return fail({ code: 'INVALID_TARGET' })

      const submitted: GameEvent = {
        type: 'ActionSubmitted',
        data: { heroId: hero.id, round: state.round, action: command.action, at: now },
      }
      // Si tous les héros debout ont choisi, la manche est résolue sans attendre l'échéance.
      const after = evolve(state, submitted)
      const everyoneReady = standingHeroes(after).every((h) => after.choices[h.id] !== undefined)
      return {
        ok: true,
        events: everyoneReady ? [submitted, ...resolveRound(after, now)] : [submitted],
      }
    }

    case 'CheckDeadline':
      // Les manches échues ont déjà été résolues par decide : il n'y a rien d'autre à faire.
      return { ok: true, events: [] }
  }
}

/** Une attaque vise un monstre debout, un soin un héros debout. */
function isValidTarget(state: GameState, action: Action): boolean {
  if (action.type === 'attack') {
    return standingMonsters(state).some((monster) => monster.id === action.target)
  }
  if (action.type === 'heal') {
    return standingHeroes(state).some((hero) => hero.id === action.target)
  }
  return true
}
