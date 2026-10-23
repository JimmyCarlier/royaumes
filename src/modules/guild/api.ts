import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { ZodType } from 'zod'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { GuildService } from './application/guild-service'
import { FoundGuildInput, type GuildError, IdParam, PlayerIdParam } from './contracts'

/** Code HTTP associé à chaque erreur métier. */
const STATUS: Record<GuildError['code'], 403 | 404 | 409 | 422> = {
  INVALID_NAME: 422,
  NAME_TAKEN: 409,
  ALREADY_MEMBER: 409,
  NOT_A_MEMBER: 404,
  GUILD_NOT_FOUND: 404,
  GUILD_FULL: 409,
  REQUEST_PENDING: 409,
  NO_PENDING_REQUEST: 404,
  REQUEST_NOT_FOUND: 404,
  REQUEST_EXPIRED: 409,
  NOT_LEADER: 403,
  CANNOT_KICK_SELF: 409,
  MEMBER_NOT_FOUND: 404,
}

/**
 * Valide les paramètres de l'adresse, avec la même réponse d'erreur que validateJson :
 * un identifiant mal formé est refusé (400) avant d'atteindre le service.
 */
const validateParams = <T extends ZodType>(schema: T) =>
  zValidator('param', schema, (result, c) => {
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? 'Entrée invalide'
      return c.json({ error: { code: 'INVALID_INPUT' as const, message } }, 400)
    }
  })

/**
 * Sous-application Hono du module Guildes, montée sur /api/guild.
 * Le joueur qui agit est toujours celui que l'authentification a identifié (c.var.userId) :
 * aucune route n'accepte un identifiant de joueur pour désigner l'auteur de l'action.
 * Aucune règle métier n'est écrite ici.
 */
export function createGuildApi(service: GuildService) {
  return (
    new Hono<AppEnv>()
      // Situation du joueur connecté : sa guilde, ou sa demande en attente.
      .get('/me', async (c) => c.json(await service.mine(c.var.userId)))

      // Classement de toutes les guildes.
      .get('/guilds', async (c) => c.json(await service.ranking()))

      // Fondation d'une guilde : le joueur en devient le chef.
      .post('/guilds', validateJson(FoundGuildInput), async (c) => {
        const player = { id: c.var.userId, name: c.var.userName }
        const result = await service.found(player, c.req.valid('json').name)
        return result.ok
          ? c.json(result.mine, 201)
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Demande d'adhésion à une guilde.
      .post('/guilds/:id/requests', validateParams(IdParam), async (c) => {
        const player = { id: c.var.userId, name: c.var.userName }
        const result = await service.requestToJoin(player, c.req.valid('param').id)
        return result.ok
          ? c.json(result.mine, 201)
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Retrait de la demande en attente du joueur.
      .delete('/requests/mine', async (c) => {
        const result = await service.cancelRequest(c.var.userId)
        return result.ok
          ? c.json(result.mine, 200)
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Décisions du chef sur une demande.
      .post('/requests/:id/accept', validateParams(IdParam), async (c) => {
        const result = await service.accept(c.var.userId, c.req.valid('param').id)
        return result.ok
          ? c.json(result.mine, 200)
          : c.json({ error: result.error }, STATUS[result.error.code])
      })
      .post('/requests/:id/refuse', validateParams(IdParam), async (c) => {
        const result = await service.refuse(c.var.userId, c.req.valid('param').id)
        return result.ok
          ? c.json(result.mine, 200)
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Exclusion d'un membre par le chef.
      .post('/members/:playerId/kick', validateParams(PlayerIdParam), async (c) => {
        const result = await service.kick(c.var.userId, c.req.valid('param').playerId)
        return result.ok
          ? c.json(result.mine, 200)
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Départ du joueur de sa guilde.
      .post('/leave', async (c) => {
        const result = await service.leave(c.var.userId)
        return result.ok
          ? c.json(result.mine, 200)
          : c.json({ error: result.error }, STATUS[result.error.code])
      })
  )
}

/** Type de la sous-application, utilisé par le client typé de l'interface. */
export type GuildApi = ReturnType<typeof createGuildApi>
