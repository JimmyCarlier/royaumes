import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { EventStore, StoredEvent } from '../event-store/event-store'
import type { AppEnv } from '../http/types'
import { authorize, type ChannelPolicy } from './channel-policy'

export interface RealtimeOptions {
  /** Journal d'événements : un canal correspond à un flux du journal, ou à tout le journal. */
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
 * Forme sous laquelle un événement est transmis au navigateur. Sur un canal discret,
 * ses données sont retirées : seuls restent sa position, le flux, la version et le type.
 */
function present(event: StoredEvent, policy: ChannelPolicy) {
  if (!policy.redact) return event
  return {
    position: event.position,
    stream: event.stream,
    version: event.version,
    type: event.type,
    data: {},
  }
}

/** Source des événements d'un canal : comment les lire, et comment les identifier. */
interface ChannelSource {
  /** Événements postérieurs à un identifiant, dans l'ordre. */
  read(after: number): Promise<StoredEvent[]>
  /** Identifiant d'un événement, renvoyé par le navigateur dans Last-Event-ID. */
  idOf(event: StoredEvent): number
  /** Identifiant de départ, lorsque le navigateur n'en fournit aucun. */
  start(): Promise<number>
}

/**
 * Un canal ordinaire est un flux du journal, dont les événements sont identifiés par leur
 * version, et transmis depuis le début. Un canal global suit tout le journal : ses événements
 * sont identifiés par leur position, et seuls les événements à venir sont transmis.
 */
function sourceOf(store: EventStore, channel: string, policy: ChannelPolicy): ChannelSource {
  const global = policy.global
  if (global) {
    return {
      read: (after) => store.readAll({ types: global.types, afterPosition: after }),
      idOf: (event) => event.position,
      start: () => store.lastPosition(),
    }
  }
  return {
    read: (after) => store.read(channel, after),
    idOf: (event) => event.version,
    start: async () => 0,
  }
}

/** Identifiant de reprise fourni par le navigateur (en-tête ou paramètre), ou celui de départ. */
async function startFrom(given: string | undefined, source: ChannelSource) {
  return given === undefined ? source.start() : Number(given) || 0
}

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
        const policy = await authorize(policies, channel, c.var.userId)
        if (!policy) return c.json(FORBIDDEN, 403)
        const source = sourceOf(store, channel, policy)

        // Point de reprise : l'en-tête Last-Event-ID, envoyé par le navigateur à la reconnexion,
        // ou à défaut le paramètre after ; sinon, l'identifiant de départ du canal.
        let lastId = await startFrom(c.req.header('last-event-id') ?? c.req.query('after'), source)

        return streamSSE(c, async (stream) => {
          let aborted = false
          stream.onAbort(() => {
            aborted = true
          })
          const deadline = Date.now() + maxStreamMs
          let lastWrite = Date.now()

          // Premier message : le flux est ouvert, et le délai de reconnexion est communiqué.
          await stream.writeSSE({ event: 'ready', data: String(lastId), retry: retryMs })

          // Tant que le navigateur est connecté et que la durée maximale n'est pas atteinte,
          // le journal est relu et chaque nouvel événement est transmis.
          while (!aborted && Date.now() < deadline) {
            const fresh = await source.read(lastId)
            for (const event of fresh) {
              // L'identifiant SSE de l'événement est celui que le navigateur renverra
              // dans Last-Event-ID après une interruption.
              lastId = source.idOf(event)
              await stream.writeSSE({
                id: String(lastId),
                event: 'domain-event',
                data: JSON.stringify(present(event, policy)),
              })
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
        const policy = await authorize(policies, channel, c.var.userId)
        if (!policy) return c.json(FORBIDDEN, 403)
        const source = sourceOf(store, channel, policy)
        const events = await source.read(await startFrom(c.req.query('after'), source))
        return c.json({ events: events.map((event) => present(event, policy)) })
      })
  )
}
