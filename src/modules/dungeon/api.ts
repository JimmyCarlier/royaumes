import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { DungeonService } from './application/dungeon-service'
import { CreateGameInput, type GameError, SubmitActionInput } from './contracts'

/** Code HTTP associé à chaque erreur métier. */
const STATUS: Record<GameError['code'], 403 | 404 | 409 | 422> = {
  GAME_NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  WRONG_PHASE: 409,
  GAME_FULL: 409,
  ALREADY_JOINED: 409,
  NOT_A_MEMBER: 403,
  NOT_HOST: 403,
  NOT_YOUR_TURN: 409,
  HERO_DOWN: 409,
  ROUND_OVER: 409,
  ALREADY_CHOSEN: 409,
  INVALID_TARGET: 422,
}

/**
 * Sous-application Hono du module Donjon, montée sur /api/dungeon.
 * Le joueur est toujours celui que l'authentification a identifié (c.var.userId) :
 * aucune route n'accepte un identifiant de joueur dans la requête.
 */
export function createDungeonApi(service: DungeonService) {
  return (
    new Hono<AppEnv>()
      // Expéditions ouvertes.
      .get('/games', async (c) => c.json({ games: await service.listOpenGames() }))

      // Ouverture d'une expédition, au niveau de difficulté choisi : le joueur en devient l'hôte.
      .post('/games', validateJson(CreateGameInput), async (c) => {
        const player = { id: c.var.userId, name: c.var.userName }
        const { gameId, result } = await service.create(player, c.req.valid('json').difficulty)
        return result.ok
          ? c.json({ gameId, view: result.view }, 201)
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Vue d'une expédition, filtrée pour le joueur.
      .get('/games/:id', async (c) => {
        const view = await service.getView(c.req.param('id'), c.var.userId)
        return view ? c.json({ view }) : c.json({ error: { code: 'GAME_NOT_FOUND' as const } }, 404)
      })

      .post('/games/:id/join', async (c) => {
        const result = await service.execute(c.req.param('id'), c.var.userId, {
          type: 'JoinGame',
          playerId: c.var.userId,
          name: c.var.userName,
        })
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Ajout d'un compagnon par l'hôte, pendant le salon.
      .post('/games/:id/companion', async (c) => {
        const result = await service.execute(c.req.param('id'), c.var.userId, {
          type: 'AddCompanion',
          playerId: c.var.userId,
        })
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      .post('/games/:id/start', async (c) => {
        const result = await service.execute(c.req.param('id'), c.var.userId, {
          type: 'StartGame',
          playerId: c.var.userId,
        })
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      .post('/games/:id/door', async (c) => {
        const result = await service.execute(c.req.param('id'), c.var.userId, {
          type: 'OpenDoor',
          playerId: c.var.userId,
        })
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      .post('/games/:id/action', validateJson(SubmitActionInput), async (c) => {
        const { round, action } = c.req.valid('json')
        const result = await service.execute(c.req.param('id'), c.var.userId, {
          type: 'SubmitAction',
          playerId: c.var.userId,
          round,
          action,
        })
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Commande d'échéance, envoyée par l'interface lorsque son compte à rebours atteint zéro.
      .post('/games/:id/deadline', async (c) => {
        const result = await service.execute(c.req.param('id'), c.var.userId, {
          type: 'CheckDeadline',
        })
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })
  )
}

/** Type de la sous-application, utilisé par le client typé de l'interface. */
export type DungeonApi = ReturnType<typeof createDungeonApi>
