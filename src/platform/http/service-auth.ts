import { createMiddleware } from 'hono/factory'
import type { AppEnv } from './types'

/**
 * Échanges entre l'application et un service extrait (TD11).
 * Le service n'a pas accès aux sessions des joueurs : l'application authentifie le joueur,
 * puis transmet son identité au service. Le service ne croit cette identité que si la requête
 * porte le secret partagé, que seule l'application connaît.
 */

/** En-têtes qui transmettent au service l'identité du joueur authentifié par l'application. */
export const PLAYER_ID_HEADER = 'x-player-id'
export const PLAYER_NAME_HEADER = 'x-player-name'

/** En-têtes d'une requête adressée à un service, au nom d'un joueur ou de l'application. */
export function serviceHeaders(secret: string, player?: { id: string; name: string }) {
  const headers: Record<string, string> = { authorization: `Bearer ${secret}` }
  if (player) {
    headers[PLAYER_ID_HEADER] = player.id
    // Le nom peut contenir des caractères accentués, interdits dans un en-tête HTTP.
    headers[PLAYER_NAME_HEADER] = encodeURIComponent(player.name)
  }
  return headers
}

/** Refuse toute requête qui ne porte pas le secret partagé (401). */
export const requireServiceSecret = (secret: string) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (c.req.header('authorization') !== `Bearer ${secret}`) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Accès refusé' } }, 401)
    }
    await next()
  })

/**
 * Place dans le contexte le joueur transmis par l'application, comme le fait requireUser
 * pour une session. À n'utiliser qu'après requireServiceSecret.
 */
export const playerFromHeaders = createMiddleware<AppEnv>(async (c, next) => {
  const id = c.req.header(PLAYER_ID_HEADER)
  if (!id) return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Joueur absent' } }, 401)
  c.set('userId', id)
  c.set('userName', decodeURIComponent(c.req.header(PLAYER_NAME_HEADER) ?? id))
  await next()
})
