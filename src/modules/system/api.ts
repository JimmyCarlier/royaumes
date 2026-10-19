import { Hono } from 'hono'

/**
 * Sous-application Hono du module System, montée sur /api/system.
 * Les routes sont déclarées par appels chaînés : le type renvoyé décrit
 * alors chaque route, sa méthode et la forme de sa réponse.
 */
export function createSystemApi(startedAt: number) {
  return new Hono().get('/health', (c) =>
    c.json({
      ok: true,
      // Heure du serveur et durée de fonctionnement de l'instance, en secondes.
      time: new Date().toISOString(),
      uptime: Math.round((Date.now() - startedAt) / 1000),
    }),
  )
}

/** Type de la sous-application, utilisé par le client typé de l'interface. */
export type SystemApi = ReturnType<typeof createSystemApi>
