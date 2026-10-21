import { Hono } from 'hono'
import {
  ConcurrencyError,
  type EventStore,
  type StoredEvent,
} from '@/platform/event-store/event-store'
import { serviceHeaders } from '@/platform/http/service-auth'
import type { AppEnv } from '@/platform/http/types'
import { forwardTo } from '@/platform/outbox/inbox-api'
import type { MessageHandler } from '@/platform/outbox/outbox'
import type { PersonalDataContributor } from '@/platform/privacy/privacy'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { REALM_TOPICS, villageChannel } from './contracts'
import { redactVillageEvent } from './personal-data'

export interface RemoteRealmDeps {
  /** Adresse du service Village extrait, par exemple http://localhost:4000. */
  url: string
  /** Secret partagé entre l'application et le service. */
  secret: string
  /** Journal de l'application, où le relais dépose une copie des événements du service. */
  store: EventStore
  /** Moteur des projections, qui conserve la position du relais. */
  projections: ProjectionRunner
  /** Fonction d'envoi des requêtes ; remplacée dans les tests, pour appeler le service sans réseau. */
  fetch?: typeof fetch
  /** Horloge, pour la règle des positions manquantes récentes. */
  now?: () => number
}

/** Nom du point de reprise du relais. */
const RELAY = 'realm-relay'

/** Délai pendant lequel une position manquante du flux publié est attendue, comme au TD8. */
const GAP_GRACE_MS = 5_000

/**
 * Village extrait (TD11) : le module a la même forme que le Village exécuté dans le processus
 * (API, règle du canal, gestionnaires de messages, données personnelles), mais chacun de ses
 * éléments s'adresse au service Village par HTTP. Le reste de l'application ne voit pas
 * la différence : c'est la façade du motif de l'étrangleur.
 */
export function createRemoteRealmModule({
  url,
  secret,
  store,
  projections,
  fetch: fetchFn = fetch,
  now = () => Date.now(),
}: RemoteRealmDeps) {
  /**
   * Relais du flux d'événements publié : lit les événements du service postérieurs à sa
   * position, et en dépose une copie dans le journal de l'application. Le Classement et le
   * canal temps réel du village continuent ainsi de lire le journal local, sans modification.
   * Chaque copie garde le flux et la version de l'original : une copie déjà déposée est
   * refusée par la contrainte d'unicité, ce qui rend le relais idempotent.
   */
  async function relay() {
    let position = await projections.positionOf(RELAY)
    const res = await fetchFn(`${url}/events?after=${position}`, {
      headers: serviceHeaders(secret),
    })
    if (!res.ok) throw new Error(`Flux du service Village indisponible (${res.status})`)
    const { events } = (await res.json()) as { events: (StoredEvent & { occurredAt: string })[] }

    let relayed = 0
    for (const event of events) {
      // Une position manquante récente correspond peut-être à une insertion en cours dans
      // le service : le relais s'arrête, et reprendra à la lecture suivante (TD8).
      const gap = event.position !== position + 1
      if (gap && now() - new Date(event.occurredAt).getTime() < GAP_GRACE_MS) break
      try {
        await store.append(event.stream, event.version - 1, [
          { type: event.type, data: event.data },
        ])
        relayed++
      } catch (error) {
        if (!(error instanceof ConcurrencyError)) throw error
      }
      position = event.position
    }
    await projections.savePosition(RELAY, position)
    return { relayed }
  }

  // API : la passerelle transmet chaque requête au service, avec l'identité du joueur,
  // puis relaie les événements que la requête a pu produire.
  const api = new Hono<AppEnv>().all('/*', async (c) => {
    const target = new URL(c.req.url)
    const path = target.pathname.replace(/^\/api/, '')
    const hasBody = c.req.method !== 'GET' && c.req.method !== 'HEAD'
    const res = await fetchFn(`${url}${path}${target.search}`, {
      method: c.req.method,
      headers: {
        ...serviceHeaders(secret, { id: c.var.userId, name: c.var.userName }),
        'content-type': c.req.header('content-type') ?? 'application/json',
      },
      body: hasBody ? await c.req.text() : undefined,
    })
    if (hasBody) await relay()
    return new Response(res.body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    })
  })

  // Messages de la saga : transmis au service, puis relais des événements produits.
  const forward = forwardTo(url, secret, fetchFn)
  const relayAfter =
    (handler: MessageHandler): MessageHandler =>
    async (message) => {
      await handler(message)
      await relay()
    }
  const handlers: Record<string, MessageHandler> = {
    [REALM_TOPICS.withdraw]: relayAfter(forward),
    [REALM_TOPICS.deposit]: relayAfter(forward),
  }

  // Canal temps réel : inchangé, il lit les copies relayées dans le journal local.
  const channelPolicy: ChannelPolicy = {
    prefix: 'village-',
    canSubscribe: (channel, userId) => channel === villageChannel(userId),
  }

  // Droits des joueurs : l'export et l'effacement sont demandés au service ; les copies
  // relayées dans le journal local sont réécrites comme le seraient les originaux.
  const personalData: PersonalDataContributor = {
    name: 'realm',
    async export(playerId) {
      const res = await fetchFn(`${url}/personal-data/${encodeURIComponent(playerId)}`, {
        headers: serviceHeaders(secret),
      })
      if (!res.ok) throw new Error(`Export refusé par le service Village (${res.status})`)
      return res.json()
    },
    redact: redactVillageEvent,
    async erase(playerId) {
      const res = await fetchFn(`${url}/personal-data/${encodeURIComponent(playerId)}`, {
        method: 'DELETE',
        headers: serviceHeaders(secret),
      })
      if (!res.ok) throw new Error(`Effacement refusé par le service Village (${res.status})`)
    },
  }

  return { api, channelPolicy, handlers, personalData, dailyTask: relay }
}
