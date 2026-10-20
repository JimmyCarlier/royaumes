/**
 * Vue filtrée d'une expédition : ce qu'un joueur donné a le droit de connaître.
 * L'API ne renvoie jamais l'état complet, seulement cette vue.
 */
import { type Difficulty, DUNGEON_LENGTH } from './content'
import { type Action, evolve, type GameState, type Monster, type Phase, type Room } from './game'
import { settle } from './rules'

export interface HeroView {
  id: string
  name: string
  hp: number
  maxHp: number
  /** Vrai si le héros a choisi son action pour la manche en cours. */
  ready: boolean
  /** Action choisie : connue du seul joueur qui incarne le héros, null pour les autres. */
  action: Action | null
}

export interface GameView {
  phase: Phase
  /** Niveau de difficulté, choisi par l'hôte : il n'a rien de secret. */
  difficulty: Difficulty
  hostId: string
  /** Vrai si le joueur qui consulte la vue est l'hôte, ou un membre de l'expédition. */
  isHost: boolean
  isMember: boolean
  heroes: HeroView[]
  /** Héros qui doit ouvrir la prochaine porte ; null hors exploration. */
  turnHeroId: string | null
  /** Indice de la salle courante (-1 avant la première porte) et nombre total de salles. */
  room: number
  roomCount: number
  /** Contenu de la salle courante ; les salles suivantes ne sont jamais transmises. */
  currentRoom: Room | null
  monsters: Monster[]
  round: number
  deadline: number | null
  lastRound: GameState['lastRound']
  loot: number
}

/**
 * Calcule la vue d'une expédition pour le joueur viewerId, à l'instant now.
 * Les manches échues sont résolues dans la vue, mais rien n'est enregistré :
 * une lecture n'écrit jamais.
 */
export function toView(state: GameState, viewerId: string, now: number): GameView | null {
  if (!state.exists) return null
  const current = settle(state, now).reduce(evolve, state)
  const inCombat = current.phase === 'combat'

  // La graine (seed), la liste des salles (rooms) et les choix des autres héros (choices)
  // ne figurent pas dans la vue : ce qui n'est pas transmis ne peut pas être lu.
  return {
    phase: current.phase,
    difficulty: current.difficulty,
    hostId: current.hostId,
    isHost: current.hostId === viewerId,
    isMember: current.heroes.some((hero) => hero.id === viewerId),
    heroes: current.heroes.map((hero) => ({
      id: hero.id,
      name: hero.name,
      hp: hero.hp,
      maxHp: hero.maxHp,
      ready: inCombat && current.choices[hero.id] !== undefined,
      // Le choix des autres héros n'est jamais transmis avant la résolution de la manche.
      action: hero.id === viewerId ? (current.choices[hero.id] ?? null) : null,
    })),
    turnHeroId: current.phase === 'exploring' ? current.heroes[current.turn].id : null,
    room: current.room,
    roomCount: DUNGEON_LENGTH,
    currentRoom: current.room >= 0 ? current.rooms[current.room] : null,
    monsters: current.monsters,
    round: current.round,
    deadline: current.deadline,
    lastRound: current.lastRound,
    loot: current.loot,
  }
}
