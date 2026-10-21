import { Hono } from 'hono'
import type { AppEnv } from '../http/types'

/** Tâche quotidienne : elle renvoie un compte rendu de son exécution, par exemple des nombres. */
export type DailyTask = () => Promise<unknown>

/** Compte rendu d'une tâche : son résultat, ou le message de l'erreur qu'elle a levée. */
type TaskReport = { ok: true; result: unknown } | { ok: false; error: string }

/**
 * Sous-application des tâches planifiées, montée sur /api/cron.
 * La tâche planifiée de Vercel appelle chaque jour la route /daily, avec l'en-tête
 * « Authorization: Bearer <CRON_SECRET> » ; toute autre requête est refusée.
 * Les tâches sont fournies par la racine de composition : la plateforme ne connaît aucun module.
 */
export function createCronApi(tasks: Record<string, DailyTask>, secret: string | undefined) {
  return new Hono<AppEnv>().get('/daily', async (c) => {
    // Sans secret configuré, la route est fermée : elle ne doit jamais être ouverte par défaut.
    if (!secret || c.req.header('authorization') !== `Bearer ${secret}`) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Accès refusé' } }, 401)
    }
    // Les tâches sont exécutées l'une après l'autre ; l'échec de l'une n'empêche pas les suivantes.
    const reports: Record<string, TaskReport> = {}
    for (const [name, task] of Object.entries(tasks)) {
      try {
        reports[name] = { ok: true, result: await task() }
      } catch (error) {
        reports[name] = { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
    return c.json(reports)
  })
}
