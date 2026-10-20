/**
 * Simulation d'expéditions, jouées entièrement en mémoire par des joueurs simulés.
 * Le domaine étant fait de fonctions pures, une expédition complète se joue en
 * une fraction de milliseconde : des milliers de parties mesurent l'équilibre du jeu.
 */
import type { Difficulty } from './content'
import {
  type Action,
  evolve,
  type GameState,
  type Hero,
  initialState,
  standingMonsters,
} from './game'
import { decide, type GameCommand } from './rules'

/** Comportement des joueurs simulés : actifs, ou absents pendant toute l'expédition. */
export type PlayerBehaviour = 'active' | 'absent'

export interface SimulationSetup {
  difficulty: Difficulty
  /** Nombre de joueurs, hôte compris. */
  players: number
  companions: number
  behaviour: PlayerBehaviour
}

/**
 * Action d'un joueur actif simulé : il se défend lorsqu'il est en danger,
 * et attaque sinon le monstre le plus affaibli. Il ne soigne jamais personne.
 */
function activeAction(state: GameState, hero: Hero): Action {
  if (hero.hp < hero.maxHp * 0.3) return { type: 'defend' }
  const target = standingMonsters(state).reduce((a, b) => (b.hp < a.hp ? b : a))
  return { type: 'attack', target: target.id }
}

/** Joue une expédition complète avec la graine donnée, et renvoie son issue. */
export function playExpedition(setup: SimulationSetup, seed: number): 'won' | 'lost' {
  let state = initialState
  let now = 0
  const run = (command: GameCommand) => {
    const decision = decide(state, command, now)
    if (!decision.ok) throw new Error(`Commande refusée : ${decision.error.code}`)
    state = decision.events.reduce(evolve, state)
  }

  // Composition de l'expédition, puis lancement.
  const players = Array.from({ length: setup.players }, (_, i) => `player-${i + 1}`)
  run({
    type: 'CreateGame',
    playerId: players[0],
    name: players[0],
    difficulty: setup.difficulty,
    seed,
  })
  for (const id of players.slice(1)) run({ type: 'JoinGame', playerId: id, name: id })
  for (let i = 0; i < setup.companions; i++) run({ type: 'AddCompanion', playerId: players[0] })
  run({ type: 'StartGame', playerId: players[0] })

  while (state.phase !== 'won' && state.phase !== 'lost') {
    now += 1000
    if (setup.behaviour === 'absent') {
      // Personne n'agit : le temps passe jusqu'à l'échéance suivante.
      now = Math.max(now, state.deadline ?? now)
      run({ type: 'CheckDeadline' })
    } else if (state.phase === 'exploring') {
      run({ type: 'OpenDoor', playerId: state.heroes[state.turn].id })
    } else {
      for (const hero of state.heroes) {
        if (state.phase !== 'combat') break
        if (hero.companion || hero.hp <= 0 || state.choices[hero.id]) continue
        run({
          type: 'SubmitAction',
          playerId: hero.id,
          round: state.round,
          action: activeAction(state, hero),
        })
      }
    }
  }
  return state.phase
}

/** Part des expéditions gagnées, en pourcentage, sur les graines 1 à count. */
export function winRate(setup: SimulationSetup, count: number): number {
  let won = 0
  for (let seed = 1; seed <= count; seed++) {
    if (playExpedition(setup, seed) === 'won') won++
  }
  return Math.round((won / count) * 100)
}
