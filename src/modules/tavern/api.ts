import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { TavernService } from './application/tavern-service'
import { type MessageError, PostMessageInput } from './contracts'

/** Code HTTP associé à chaque erreur. */
const STATUS: Record<MessageError['code'], 422 | 429> = {
  EMPTY_MESSAGE: 422,
  MESSAGE_TOO_LONG: 422,
  TOO_MANY_MESSAGES: 429,
}

/**
 * Sous-application Hono du module Taverne, montée sur /api/tavern.
 * L'auteur d'un message est toujours le joueur connecté.
 */
export function createTavernApi(service: TavernService) {
  return new Hono<AppEnv>()
    .get('/messages', async (c) => c.json({ messages: await service.latest() }))

    .post('/messages', validateJson(PostMessageInput), async (c) => {
      const player = { id: c.var.userId, name: c.var.userName }
      const result = await service.post(player, c.req.valid('json').body)
      if (result.ok) return c.json({ message: result.message }, 201)
      // En cas de limitation, l'en-tête Retry-After indique le délai à attendre, en secondes.
      if (result.error.code === 'TOO_MANY_MESSAGES') {
        c.header('Retry-After', String(Math.ceil(result.error.retryAfterMs / 1000)))
      }
      return c.json({ error: result.error }, STATUS[result.error.code])
    })
}

export type TavernApi = ReturnType<typeof createTavernApi>
