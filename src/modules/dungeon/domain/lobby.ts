/**
 * Liste des expéditions ouvertes, calculée à partir des événements de toutes les expéditions.
 * C'est une vue de lecture qui porte sur plusieurs flux à la fois, et non sur un seul.
 */
import { MAX_HEROES, OPEN_GAME_MS } from './content'
import type { GameEvent } from './game'

/** Expédition qui peut encore être rejointe. */
export interface OpenGame {
  gameId: string
  hostName: string
  heroCount: number
  createdAt: number
}

/** Événement accompagné de l'identifiant de l'expédition dont il provient. */
export interface GameEventOf {
  gameId: string
  event: GameEvent
}

/**
 * Parcourt les événements de toutes les expéditions, dans l'ordre de leur enregistrement,
 * et retient celles qui ne sont ni lancées, ni complètes, ni trop anciennes.
 * Les plus récentes sont placées en tête.
 */
export function openGames(events: GameEventOf[], now: number): OpenGame[] {
  const games = new Map<string, OpenGame & { started: boolean }>()
  for (const { gameId, event } of events) {
    const game = games.get(gameId)
    switch (event.type) {
      case 'GameCreated':
        games.set(gameId, {
          gameId,
          hostName: event.data.hostName,
          heroCount: 1,
          createdAt: event.data.at,
          started: false,
        })
        break
      case 'PlayerJoined':
        if (game) game.heroCount++
        break
      case 'GameStarted':
        if (game) game.started = true
        break
    }
  }
  return [...games.values()]
    .filter((game) => !game.started && game.heroCount < MAX_HEROES)
    .filter((game) => now - game.createdAt < OPEN_GAME_MS)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(({ gameId, hostName, heroCount, createdAt }) => ({
      gameId,
      hostName,
      heroCount,
      createdAt,
    }))
}
