import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type Db } from '../db/client'
import { ConcurrencyError, createEventStore, type EventStore } from '../event-store/event-store'
import { createDispatchApi } from './dispatch-api'
import { createDispatcher, type Message } from './outbox'
import { outbox } from './schema'

// Chaque test dispose d'un journal neuf et d'une boîte d'envoi vide.
let db: Db
let store: EventStore
beforeEach(async () => {
  db = await createTestDatabase()
  store = createEventStore(db)
})

/**
 * Horloge de test, que chaque test peut faire avancer. Elle est créée après l'enregistrement
 * des messages : la base les date à l'instant de leur insertion, et une horloge figée plus tôt
 * les considérerait comme pas encore disponibles.
 */
function testClock() {
  let now = Date.now()
  return { now: () => now, advance: (ms: number) => (now += ms) }
}

/** Message de test, sur le sujet « test.ping ». */
const ping = (n: number) => ({ topic: 'test.ping', payload: { n } })

describe("Boîte d'envoi : enregistrement", () => {
  it('enregistre les messages avec les événements, dans la même transaction', async () => {
    await store.append('s-1', 0, [{ type: 'A', data: {} }], [ping(1), ping(2)])

    const rows = await db.select().from(outbox)
    expect(rows.map((row) => row.payload)).toEqual([{ n: 1 }, { n: 2 }])
    expect(rows.every((row) => row.processedAt === null)).toBe(true)
  })

  it("n'enregistre aucun message si les événements sont refusés", async () => {
    await store.append('s-1', 0, [{ type: 'A', data: {} }])
    await expect(
      store.append('s-1', 0, [{ type: 'B', data: {} }], [ping(1)]),
    ).rejects.toBeInstanceOf(ConcurrencyError)

    expect(await db.select().from(outbox)).toEqual([])
  })
})

describe("Boîte d'envoi : distribution", () => {
  it('remet chaque message à son gestionnaire, puis le marque comme traité', async () => {
    const received: number[] = []
    const dispatcher = createDispatcher(db)
    dispatcher.register({
      'test.ping': async (message) => void received.push(message.payload.n as number),
    })
    await store.append('s-1', 0, [{ type: 'A', data: {} }], [ping(1), ping(2)])

    expect(await dispatcher.dispatch()).toEqual({ delivered: 2, failed: 0 })
    // Aucun ordre n'est garanti entre les messages : ils sont triés avant d'être comparés.
    expect(received.sort()).toEqual([1, 2])
    // Une seconde distribution ne remet rien : les messages sont traités.
    expect(await dispatcher.dispatch()).toEqual({ delivered: 0, failed: 0 })
    expect(await dispatcher.status()).toEqual({ pending: 0, abandoned: 0 })
  })

  it('remet aussi les messages produits par les gestionnaires pendant la distribution', async () => {
    const dispatcher = createDispatcher(db)
    dispatcher.register({
      // Chaque message en produit un autre, jusqu'au troisième : une petite saga.
      'test.ping': async (message) => {
        const n = message.payload.n as number
        if (n < 3) await store.append(`s-${n + 1}`, 0, [{ type: 'A', data: {} }], [ping(n + 1)])
      },
    })
    await store.append('s-1', 0, [{ type: 'A', data: {} }], [ping(1)])

    expect(await dispatcher.dispatch()).toEqual({ delivered: 3, failed: 0 })
  })

  it("ne remet qu'une fois un message lors de deux distributions simultanées", async () => {
    let calls = 0
    const dispatcher = createDispatcher(db)
    dispatcher.register({ 'test.ping': async () => void calls++ })
    await store.append('s-1', 0, [{ type: 'A', data: {} }], [ping(1)])

    await Promise.all([dispatcher.dispatch(), dispatcher.dispatch()])
    expect(calls).toBe(1)
  })
})

describe("Boîte d'envoi : échecs", () => {
  it('retente un message en échec, après un délai', async () => {
    await store.append('s-1', 0, [{ type: 'A', data: {} }], [ping(1)])
    const clock = testClock()
    let calls = 0
    const dispatcher = createDispatcher(db, { now: clock.now })
    dispatcher.register({
      'test.ping': async () => {
        calls++
        if (calls === 1) throw new Error('panne passagère')
      },
    })

    expect(await dispatcher.dispatch()).toEqual({ delivered: 0, failed: 1 })
    // Le délai avant un nouvel essai n'est pas écoulé : le message n'est pas remis.
    expect(await dispatcher.dispatch()).toEqual({ delivered: 0, failed: 0 })
    const [row] = await db.select().from(outbox)
    expect(row.lastError).toBe('panne passagère')

    clock.advance(10_000)
    expect(await dispatcher.dispatch()).toEqual({ delivered: 1, failed: 0 })
  })

  it('abandonne un message après le nombre maximal de tentatives', async () => {
    await store.append('s-1', 0, [{ type: 'A', data: {} }], [ping(1)])
    const clock = testClock()
    const dispatcher = createDispatcher(db, { now: clock.now, maxAttempts: 3 })
    dispatcher.register({
      'test.ping': async () => {
        throw new Error('panne durable')
      },
    })

    for (let i = 0; i < 5; i++) {
      await dispatcher.dispatch()
      clock.advance(3_600_000)
    }
    const [row] = await db.select().from(outbox)
    expect(row.attempts).toBe(3)
    expect(await dispatcher.status()).toEqual({ pending: 0, abandoned: 1 })
  })

  it('remet de nouveau un message dont le traitement a été interrompu, à la fin du bail', async () => {
    await store.append('s-1', 0, [{ type: 'A', data: {} }], [ping(1)])
    const clock = testClock()
    const received: Message[] = []
    // Première distribution : le gestionnaire ne se termine jamais, comme une fonction
    // interrompue par la plateforme avant d'avoir enregistré le succès.
    // La promesse started est résolue dès que le gestionnaire a reçu le message.
    let markStarted = () => {}
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const interrupted = createDispatcher(db, { now: clock.now })
    interrupted.register({
      'test.ping': () => {
        markStarted()
        return new Promise<void>(() => {})
      },
    })
    void interrupted.dispatch()
    await started

    const dispatcher = createDispatcher(db, { now: clock.now })
    dispatcher.register({ 'test.ping': async (message) => void received.push(message) })
    // Le bail court encore : le message est considéré comme en cours de traitement.
    expect(await dispatcher.dispatch()).toEqual({ delivered: 0, failed: 0 })

    clock.advance(30_000)
    expect(await dispatcher.dispatch()).toEqual({ delivered: 1, failed: 0 })
    expect(received[0].attempt).toBe(2)
  })

  it("compte comme un échec un message dont le sujet n'a aucun gestionnaire", async () => {
    const dispatcher = createDispatcher(db)
    await store.append('s-1', 0, [{ type: 'A', data: {} }], [ping(1)])

    expect(await dispatcher.dispatch()).toEqual({ delivered: 0, failed: 1 })
    const [row] = await db.select().from(outbox)
    expect(row.lastError).toBe('Aucun gestionnaire pour le sujet test.ping')
  })
})

describe('Distribution planifiée', () => {
  it('refuse une requête sans le secret attendu (401)', async () => {
    const api = createDispatchApi(createDispatcher(db), 'secret')
    expect((await api.request('/dispatch')).status).toBe(401)
    const wrong = await api.request('/dispatch', { headers: { authorization: 'Bearer autre' } })
    expect(wrong.status).toBe(401)
    // Sans secret configuré, la route est fermée, même pour une requête sans en-tête.
    const closed = createDispatchApi(createDispatcher(db), undefined)
    expect((await closed.request('/dispatch')).status).toBe(401)
  })

  it('distribue les messages en attente à la demande de la tâche planifiée', async () => {
    const dispatcher = createDispatcher(db)
    dispatcher.register({ 'test.ping': async () => {} })
    await store.append('s-1', 0, [{ type: 'A', data: {} }], [ping(1)])

    const api = createDispatchApi(dispatcher, 'secret')
    const res = await api.request('/dispatch', { headers: { authorization: 'Bearer secret' } })
    expect(await res.json()).toEqual({ delivered: 1, failed: 0, pending: 0, abandoned: 0 })
  })
})
