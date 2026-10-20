import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { EventStore } from '../event-store/event-store'
import type { AppEnv } from '../http/types'
import { type ChannelPolicy, isAllowed } from './channel-policy'

export interface RealtimeOptions {
  /** Journal d'événements : un canal correspond à un flux du journal. */
  store: EventStore
  /** Règles d'accès aux canaux, fournies par les modules. */
  policies: ChannelPolicy[]
  /** Intervalle entre deux lectures du journal, en millisecondes. */
  pollMs?: number
  /** Durée maximale d'un flux avant sa fermeture volontaire, en millisecondes. */
  maxStreamMs?: number
  /** Délai de reconnexion conseillé au navigateur, en millisecondes. */
  retryMs?: number
  /** Intervalle maximal sans message avant l'envoi d'un signe de vie, en millisecondes. */
  pingMs?: number
}

/** Réponse commune aux deux routes lorsque le canal n'est pas autorisé. */
const FORBIDDEN = { error: { code: 'FORBIDDEN', message: 'Canal non autorisé' } } as const

/**
 * Sous-application du temps réel, montée sur /api/stream.
 * Le flux ne conserve aucun état en mémoire : il relit le journal, et n'importe quelle
 * instance de l'application peut donc servir n'importe quel joueur.
 */
export function createRealtimeApi({
  store,
  policies,
  pollMs = 500,
  maxStreamMs = 240_000,
  retryMs = 1_000,
  pingMs = 15_000,
}: RealtimeOptions) {
  return (
    new Hono<AppEnv>()
      // Flux SSE d'un canal.
      .get('/:channel', async (c) => {
        const channel = c.req.param('channel')
        if (!(await isAllowed(policies, channel, c.var.userId))) return c.json(FORBIDDEN, 403)

        // Point de reprise : l'en-tête Last-Event-ID, envoyé par le navigateur à la reconnexion,
        // ou à défaut le paramètre after ; 0 pour recevoir tout le flux.
        let lastVersion = Number(c.req.header('last-event-id') ?? c.req.query('after') ?? 0) || 0

        return streamSSE(c, async (stream) => {
          let aborted = false
          stream.onAbort(() => {
            aborted = true
          })
          const deadline = Date.now() + maxStreamMs
          let lastWrite = Date.now()

          // Premier message : le flux est ouvert, et le délai de reconnexion est communiqué.
          await stream.writeSSE({ event: 'ready', data: String(lastVersion), retry: retryMs })

          // Tant que le navigateur est connecté et que la durée maximale n'est pas atteinte,
          // le journal est relu et chaque nouvel événement est transmis.
          while (!aborted && Date.now() < deadline) {
            const fresh = await store.read(channel, lastVersion)
            for (const event of fresh) {
              // La version de l'événement sert d'identifiant SSE : c'est elle que
              // le navigateur renverra dans Last-Event-ID après une interruption.
              await stream.writeSSE({
                id: String(event.version),
                event: 'domain-event',
                data: JSON.stringify(event),
              })
              lastVersion = event.version
              lastWrite = Date.now()
            }
            // Signe de vie : un commentaire SSE, ignoré par le navigateur, qui empêche
            // les intermédiaires du réseau de fermer une connexion jugée inactive.
            if (Date.now() - lastWrite > pingMs) {
              await stream.write(': ping\n\n')
              lastWrite = Date.now()
            }
            await stream.sleep(pollMs)
          }
          // À la sortie de la boucle, la réponse se termine : le navigateur se reconnectera.
        })
      })

      // Repli sans diffusion progressive : les événements du canal postérieurs à after.
      .get('/:channel/events', async (c) => {
        const channel = c.req.param('channel')
        if (!(await isAllowed(policies, channel, c.var.userId))) return c.json(FORBIDDEN, 403)
        const after = Number(c.req.query('after') ?? 0) || 0
        return c.json({ events: await store.read(channel, after) })
      })
  )
}
