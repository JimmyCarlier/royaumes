/**
 * État et événements d'une expédition, et fonction evolve.
 * Les règles du jeu (decide) se trouvent dans rules.ts, la vue de chaque joueur dans view.ts.
 */
import { DEFAULT_DIFFICULTY, type Difficulty, type MonsterKind } from './content'

// ---------------------------------------------------------------------------
// Éléments du jeu
// ---------------------------------------------------------------------------

/** Phase d'une expédition. */
export type Phase = 'lobby' | 'exploring' | 'combat' | 'won' | 'lost'

/** Contenu d'une salle, tiré au sort au lancement de l'expédition. */
export type Room =
  | { kind: 'empty' }
  | { kind: 'treasure'; gold: number }
  | { kind: 'monsters'; monsters: MonsterSpec[] }

/** Caractéristiques d'un monstre, fixées lors du tirage des salles. */
export interface MonsterSpec {
  kind: MonsterKind
  hp: number
  attack: number
}

export interface Hero {
  /** Identifiant du joueur qui incarne le héros. */
  id: string
  name: string
  hp: number
  maxHp: number
  attack: number
}

/** Caractéristiques de départ d'un héros, enregistrées lorsqu'il rejoint l'expédition. */
export interface HeroSpec {
  hp: number
  attack: number
}

export interface Monster {
  /** Identifiant unique dans la salle : « m0 », « m1 »... */
  id: string
  kind: MonsterKind
  hp: number
  maxHp: number
  attack: number
}

/** Action choisie par un héros pour une manche de combat. */
export type Action =
  | { type: 'attack'; target: string }
  | { type: 'defend' }
  | { type: 'heal'; target: string }

/** Effet produit par la résolution d'une manche. */
export type Effect =
  | { kind: 'damage'; source: string; target: string; amount: number }
  | { kind: 'heal'; source: string; target: string; amount: number }

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

export interface GameState {
  /** Faux tant que l'expédition n'a pas été ouverte. */
  exists: boolean
  hostId: string
  /** Niveau de difficulté, qui détermine la stratégie des monstres. */
  difficulty: Difficulty
  /** Graine du hasard de l'expédition : information secrète, jamais transmise aux joueurs. */
  seed: number
  phase: Phase
  heroes: Hero[]
  /** Toutes les salles du donjon, y compris celles qui n'ont pas encore été ouvertes. */
  rooms: Room[]
  /** Indice de la salle courante ; -1 tant qu'aucune porte n'a été ouverte. */
  room: number
  /** Monstres de la salle courante, vaincus compris. */
  monsters: Monster[]
  /** Indice, dans heroes, du héros qui doit ouvrir la prochaine porte. */
  turn: number
  /** Numéro de la manche en cours ; il ne repart jamais de 1, d'une salle à l'autre. */
  round: number
  /** Échéance de la manche en cours, en millisecondes ; null hors combat. */
  deadline: number | null
  /** Actions déjà choisies pour la manche en cours, par identifiant de héros. */
  choices: Record<string, Action>
  /** Résultat de la dernière manche résolue, affiché aux joueurs. */
  lastRound: { round: number; actions: Record<string, Action>; effects: Effect[] } | null
  /** Or ramassé dans les trésors. */
  loot: number
}

/** État d'une expédition qui n'a encore connu aucun événement. */
export const initialState: GameState = {
  exists: false,
  hostId: '',
  difficulty: DEFAULT_DIFFICULTY,
  seed: 0,
  phase: 'lobby',
  heroes: [],
  rooms: [],
  room: -1,
  monsters: [],
  turn: 0,
  round: 0,
  deadline: null,
  choices: {},
  lastRound: null,
  loot: 0,
}

// ---------------------------------------------------------------------------
// Événements : des faits accomplis, nommés au participe passé
// ---------------------------------------------------------------------------

export type GameEvent =
  | {
      type: 'GameCreated'
      data: {
        hostId: string
        hostName: string
        hero: HeroSpec
        /** Facultatif : absent des événements enregistrés avant le TD7. */
        difficulty?: Difficulty
        seed: number
        at: number
      }
    }
  | { type: 'PlayerJoined'; data: { playerId: string; name: string; hero: HeroSpec; at: number } }
  | { type: 'GameStarted'; data: { rooms: Room[]; at: number } }
  | {
      type: 'RoomEntered'
      // deadline : échéance de la première manche si la salle abrite des monstres, sinon null.
      data: { heroId: string; room: number; deadline: number | null; at: number }
    }
  | { type: 'ActionSubmitted'; data: { heroId: string; round: number; action: Action; at: number } }
  | {
      type: 'RoundResolved'
      data: {
        round: number
        /** Actions de tous les héros debout, y compris la défense des héros sans choix. */
        actions: Record<string, Action>
        /** Effets tirés au sort lors de la résolution, appliqués tels quels par evolve. */
        effects: Effect[]
        /** Échéance de la manche suivante ; null si le combat est terminé. */
        nextDeadline: number | null
        at: number
      }
    }
  | {
      type: 'GameEnded'
      data: { result: 'won' | 'lost'; loot: number; heroIds: string[]; at: number }
    }

// ---------------------------------------------------------------------------
// Fonctions utilitaires sur l'état
// ---------------------------------------------------------------------------

/** Héros encore debout. */
export const standingHeroes = (state: GameState) => state.heroes.filter((hero) => hero.hp > 0)

/** Monstres encore debout. */
export const standingMonsters = (state: GameState) =>
  state.monsters.filter((monster) => monster.hp > 0)

/** Indice du prochain héros debout après l'indice from, en revenant au début si nécessaire. */
export function nextStandingHero(heroes: Hero[], from: number): number {
  for (let step = 1; step <= heroes.length; step++) {
    const index = (from + step) % heroes.length
    if (heroes[index].hp > 0) return index
  }
  return from
}

/** Crée un héros à partir des caractéristiques enregistrées dans l'événement. */
const newHero = (id: string, name: string, spec: HeroSpec): Hero => ({
  id,
  name,
  hp: spec.hp,
  maxHp: spec.hp,
  attack: spec.attack,
})

/** Crée les monstres d'une salle à partir des caractéristiques enregistrées dans les salles. */
const spawn = (specs: MonsterSpec[]): Monster[] =>
  specs.map((spec, index) => ({
    id: `m${index}`,
    kind: spec.kind,
    hp: spec.hp,
    maxHp: spec.hp,
    attack: spec.attack,
  }))

/** Applique un effet aux combattants, sans descendre sous 0 ni dépasser le maximum. */
export function applyEffect<T extends { id: string; hp: number; maxHp: number }>(
  fighters: T[],
  effect: Effect,
): T[] {
  return fighters.map((fighter) => {
    if (fighter.id !== effect.target) return fighter
    const change = effect.kind === 'damage' ? -effect.amount : effect.amount
    return { ...fighter, hp: Math.max(0, Math.min(fighter.maxHp, fighter.hp + change)) }
  })
}

// ---------------------------------------------------------------------------
// evolve : applique un événement, sans aucune vérification ni aucun tirage.
// Toutes les valeurs viennent des événements : evolve ne lit pas le contenu du jeu.
// ---------------------------------------------------------------------------

export function evolve(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'GameCreated':
      return {
        ...initialState,
        exists: true,
        hostId: event.data.hostId,
        // Upcasting : un événement enregistré avant le TD7 ne porte pas de niveau de difficulté.
        difficulty: event.data.difficulty ?? DEFAULT_DIFFICULTY,
        seed: event.data.seed,
        heroes: [newHero(event.data.hostId, event.data.hostName, event.data.hero)],
      }

    case 'PlayerJoined':
      return {
        ...state,
        heroes: [...state.heroes, newHero(event.data.playerId, event.data.name, event.data.hero)],
      }

    case 'GameStarted':
      return { ...state, phase: 'exploring', rooms: event.data.rooms, turn: 0 }

    case 'RoomEntered': {
      const room = state.rooms[event.data.room]
      const turn = nextStandingHero(state.heroes, state.turn)
      if (room.kind === 'treasure') {
        return { ...state, room: event.data.room, turn, loot: state.loot + room.gold }
      }
      if (room.kind === 'monsters') {
        // La salle déclenche un combat : la première manche commence aussitôt.
        return {
          ...state,
          room: event.data.room,
          turn,
          phase: 'combat',
          monsters: spawn(room.monsters),
          round: state.round + 1,
          deadline: event.data.deadline,
          choices: {},
          lastRound: null,
        }
      }
      return { ...state, room: event.data.room, turn }
    }

    case 'ActionSubmitted':
      return { ...state, choices: { ...state.choices, [event.data.heroId]: event.data.action } }

    case 'RoundResolved': {
      // Les effets enregistrés sont appliqués dans leur ordre : aucun hasard ici.
      let heroes = state.heroes
      let monsters = state.monsters
      for (const effect of event.data.effects) {
        heroes = applyEffect(heroes, effect)
        monsters = applyEffect(monsters, effect)
      }
      const lastRound = {
        round: event.data.round,
        actions: event.data.actions,
        effects: event.data.effects,
      }
      const combatOver = event.data.nextDeadline === null
      return {
        ...state,
        heroes,
        monsters,
        lastRound,
        choices: {},
        // Combat terminé : retour à l'exploration (GameEnded suit si l'expédition s'achève).
        phase: combatOver ? 'exploring' : 'combat',
        round: combatOver ? state.round : state.round + 1,
        deadline: event.data.nextDeadline,
        // Le tour d'exploration ne doit jamais désigner un héros tombé au combat.
        turn: heroes[state.turn]?.hp > 0 ? state.turn : nextStandingHero(heroes, state.turn),
      }
    }

    case 'GameEnded':
      return { ...state, phase: event.data.result, deadline: null, choices: {} }
  }
}

/** Reconstruit l'état d'une expédition à partir de la suite de ses événements. */
export function replay(events: GameEvent[]): GameState {
  return events.reduce(evolve, initialState)
}
