import { Hono } from 'hono'
import type { AppEnv } from '../http/types'
import type { Dispatcher } from './outbox'

/**
 * Sous-application de la distribution planifiée, montée sur /api/outbox.
 * La tâche planifiée de Vercel appelle la route avec l'en-tête
 * « Authorization: Bearer <CRON_SECRET> » ; toute autre requête est refusée.
 */
export function createDispatchApi(dispatcher: Dispatcher, secret: string | undefined) {
  return new Hono<AppEnv>().get('/dispatch', async (c) => {
    // Sans secret configuré, la route est fermée : elle ne doit jamais être ouverte par défaut.
    if (!secret || c.req.header('authorization') !== `Bearer ${secret}`) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Accès refusé' } }, 401)
    }
    const result = await dispatcher.dispatch()
    // DETTE TECHNIQUE DT-007 (docs/qualite/dette-technique.md) : les messages abandonnés sont
    // seulement comptés ; aucun outil ne permet de les examiner ni de les relancer.
    return c.json({ ...result, ...(await dispatcher.status()) })
  })
}
