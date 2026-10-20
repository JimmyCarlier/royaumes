import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from '../db/client'
import { createEventStore, type EventStore } from '../event-store/event-store'
import type { AppEnv } from '../http/types'
import type { ChannelPolicy } from './channel-policy'
import { createRealtimeApi } from './stream-api'

// Règle de test : un joueur n'écoute que le canal « test-<joueur> ».
const policy: ChannelPolicy = {
  prefix: 'test-',
  canSubscribe: (channel, userId) => channel === `test-${userId}`,
}

// Règle de test d'un canal discret : tout joueur peut écouter « secret-... »,
// mais le flux ne transmet pas les données des événements.
const secretPolicy: ChannelPolicy = { prefix: 'secret-', canSubscribe: () => true, redact: true }

// Règle de test d'un canal global : « all » suit les événements de type A de tous les flux.
const globalPolicy: ChannelPolicy = {
  prefix: 'all',
  canSubscribe: (channel) => channel === 'all',
  global: { types: ['A'] },
}

let store: EventStore
let app: Hono<AppEnv>

beforeEach(async () => {
  store = createEventStore(await createTestDatabase())
  // Application minimale : le joueur est lu dans un en-tête, et les flux sont très courts.
  app = new Hono<AppEnv>()
    .use(async (c, next) => {
      c.set('userId', c.req.header('x-test-user') ?? '')
      await next()
    })
    .route(
      '/stream',
      createRealtimeApi({
        store,
        policies: [policy, secretPolicy, globalPolicy],
        pollMs: 20,
        maxStreamMs: 150,
      }),
    )
})

/** Ouvre un flux et lit sa réponse jusqu'à sa fermeture volontaire. */
async function readStream(path: string, headers: Record<string, string> = {}) {
  const res = await app.request(path, { headers: { 'x-test-user': 'alice', ...headers } })
  return { status: res.status, body: await res.text() }
}

/**
 * Identifiants des messages domain-event d'un flux, dans l'ordre.
 * Les messages sont séparés par une ligne vide ; l'ordre de leurs champs est libre.
 */
function eventIds(body: string): string[] {
  return body
    .split('\n\n')
    .filter((message) => message.includes('event: domain-event'))
    .map((message) => message.match(/^id: (\d+)$/m)?.[1] ?? '')
}

describe('Flux temps réel', () => {
  it('annonce son ouverture avec un délai de reconnexion', async () => {
    const { status, body } = await readStream('/stream/test-alice')

    expect(status).toBe(200)
    expect(body).toContain('event: ready')
    expect(body).toContain('retry: 1000')
  })

  it('transmet les événements du canal, identifiés par leur version', async () => {
    await store.append('test-alice', 0, [
      { type: 'A', data: {} },
      { type: 'B', data: {} },
    ])
    const { body } = await readStream('/stream/test-alice')

    expect(eventIds(body)).toEqual(['1', '2'])
    expect(body).toContain('"type":"B"')
  })

  it('transmet un événement enregistré pendant que le flux est ouvert', async () => {
    const reading = readStream('/stream/test-alice')
    await new Promise((resolve) => setTimeout(resolve, 50))
    await store.append('test-alice', 0, [{ type: 'A', data: {} }])

    expect(eventIds((await reading).body)).toEqual(['1'])
  })

  it('reprend après Last-Event-ID, sans perte ni doublon', async () => {
    await store.append('test-alice', 0, [
      { type: 'A', data: {} },
      { type: 'B', data: {} },
      { type: 'C', data: {} },
    ])
    const { body } = await readStream('/stream/test-alice', { 'last-event-id': '2' })

    expect(eventIds(body)).toEqual(['3'])
  })

  it("refuse le canal d'un autre joueur (403)", async () => {
    const { status } = await readStream('/stream/test-bob')
    expect(status).toBe(403)
  })

  it("refuse un canal qu'aucune règle ne couvre (403)", async () => {
    const { status } = await readStream('/stream/inconnu-alice')
    expect(status).toBe(403)
  })

  it('fournit une route de repli sans diffusion progressive', async () => {
    await store.append('test-alice', 0, [
      { type: 'A', data: {} },
      { type: 'B', data: {} },
    ])
    const res = await app.request('/stream/test-alice/events?after=1', {
      headers: { 'x-test-user': 'alice' },
    })
    const { events } = await res.json()

    expect(events.map((e: { type: string }) => e.type)).toEqual(['B'])
  })
})

describe('Canal discret', () => {
  it("transmet le type et la version d'un événement, sans ses données", async () => {
    await store.append('secret-1', 0, [{ type: 'A', data: { choice: 'attack' } }])
    const { body } = await readStream('/stream/secret-1')

    expect(eventIds(body)).toEqual(['1'])
    expect(body).toContain('"type":"A"')
    expect(body).not.toContain('attack')
  })

  it('retire aussi les données sur la route de repli', async () => {
    await store.append('secret-1', 0, [{ type: 'A', data: { choice: 'attack' } }])
    const res = await app.request('/stream/secret-1/events', {
      headers: { 'x-test-user': 'alice' },
    })
    expect(await res.json()).toEqual({
      events: [{ position: 1, stream: 'secret-1', version: 1, type: 'A', data: {} }],
    })
  })
})

describe('Canal global', () => {
  it('transmet les événements à venir de tous les flux, identifiés par leur position', async () => {
    // Événement antérieur à l'ouverture du flux : il n'est pas transmis.
    await store.append('x-1', 0, [{ type: 'A', data: {} }])
    const reading = readStream('/stream/all')
    await new Promise((resolve) => setTimeout(resolve, 50))
    await store.append('x-2', 0, [{ type: 'A', data: {} }])
    await store.append('x-1', 1, [{ type: 'B', data: {} }])
    await store.append('x-3', 0, [{ type: 'A', data: {} }])

    expect(eventIds((await reading).body)).toEqual(['2', '4'])
  })

  it('reprend après Last-Event-ID, qui désigne une position', async () => {
    await store.append('x-1', 0, [{ type: 'A', data: {} }])
    await store.append('x-2', 0, [
      { type: 'B', data: {} },
      { type: 'A', data: {} },
    ])
    const { body } = await readStream('/stream/all', { 'last-event-id': '1' })

    expect(eventIds(body)).toEqual(['3'])
  })
})
