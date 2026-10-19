import { createMiddleware } from 'hono/factory'
import type { AuthPort } from '../auth/port'
import type { AppEnv } from './types'

/**
 * Intergiciel qui exige un joueur connecté.
 * - Personne n'est connecté : la requête est refusée avec le code 401, sans atteindre la route.
 * - Un joueur est connecté : son identifiant et son nom sont placés dans le contexte,
 *   où les routes des modules les lisent (c.var.userId, c.var.userName).
 */
export const requireUser = (auth: AuthPort) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const user = await auth.getUser(c.req.raw.headers)
    if (!user) {
      return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Connexion requise' } }, 401)
    }
    c.set('userId', user.id)
    c.set('userName', user.name)
    await next()
  })
