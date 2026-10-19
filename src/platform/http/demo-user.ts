import { createMiddleware } from 'hono/factory'
import type { AppEnv } from './types'

/** Identifiant du joueur unique, en attendant l'authentification (TD4). */
export const DEMO_USER_ID = 'demo'

/**
 * Middleware provisoire : toutes les requêtes sont attribuées au même joueur.
 * DETTE TECHNIQUE DT-001 (docs/qualite/dette-technique.md) : à remplacer au TD4
 * par un middleware qui identifie le joueur connecté.
 */
export const demoUser = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set('userId', DEMO_USER_ID)
    await next()
  })
