import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type Db } from '@/platform/db/client'
import { createEventStore, type EventStore } from '@/platform/event-store/event-store'
import { createDispatcher, type Dispatcher, type Message } from '@/platform/outbox/outbox'
import { outbox } from '@/platform/outbox/schema'
import { createVillageService, type VillageService } from './application/village-service'
import { REALM_TOPICS, type TransferRequest } from './contracts'
import { createEventStoreVillageRepository } from './infrastructure/event-store-village-repository'
import { createRealmHandlers } from './messages'

const NOW = Date.UTC(2026, 0, 1)

// Chaque test dispose d'un journal neuf, du service du Village, et d'un distributeur
// auquel sont confiés les gestionnaires du Village et un gestionnaire de réponses de test.
let db: Db
let store: EventStore
let service: VillageService
let dispatcher: Dispatcher
let replies: unknown[]
beforeEach(async () => {
  db = await createTestDatabase()
  store = createEventStore(db)
  // L'horloge du service est figée : le stock ne varie pas pendant le test.
  service = createVillageService(createEventStoreVillageRepository(store), () => NOW)
  replies = []
  dispatcher = createDispatcher(db)
  dispatcher.register(createRealmHandlers(service))
  dispatcher.register({ 'test.reply': async (message) => void replies.push(message.payload) })
  await service.execute('alice', { type: 'FoundVillage', name: 'Valombre' })
})

/** Enregistre une demande de mouvement, comme le ferait un autre module. */
async function request(topic: string, payload: Partial<TransferRequest>) {
  await store.append(
    `test-${crypto.randomUUID()}`,
    0,
    [{ type: 'Asked', data: {} }],
    [{ topic, payload }],
  )
}

/** Stock du village d'Alice. */
const stockOfAlice = async () => (await service.getView('alice'))?.stock

describe('Village - gestionnaires de messages', () => {
  it('prélève les ressources et répond au demandeur', async () => {
    await request(REALM_TOPICS.withdraw, {
      transferId: 't1',
      playerId: 'alice',
      resources: { wood: 60 },
      replyTo: 'test.reply',
    })

    expect(await dispatcher.dispatch()).toEqual({ delivered: 2, failed: 0 })
    expect(replies).toEqual([{ transferId: 't1', outcome: 'withdrawn' }])
    expect((await stockOfAlice())?.wood).toBe(40)
  })

  it('répond par un refus lorsque le stock ne suffit pas', async () => {
    await request(REALM_TOPICS.withdraw, {
      transferId: 't1',
      playerId: 'alice',
      resources: { stone: 80 },
      replyTo: 'test.reply',
    })

    await dispatcher.dispatch()
    expect(replies).toEqual([{ transferId: 't1', outcome: 'refused', missing: { stone: 30 } }])
    expect((await stockOfAlice())?.stone).toBe(50)
  })

  it("n'a qu'un effet, et ne répond qu'une fois, lorsqu'un message est remis deux fois", async () => {
    const handlers = createRealmHandlers(service)
    const message: Message = {
      id: 'm1',
      topic: REALM_TOPICS.withdraw,
      attempt: 1,
      payload: {
        transferId: 't1',
        playerId: 'alice',
        resources: { wood: 60 },
        replyTo: 'test.reply',
      },
    }
    // Le même message est remis deux fois, comme après l'interruption d'une distribution.
    await handlers[REALM_TOPICS.withdraw](message)
    await handlers[REALM_TOPICS.withdraw]({ ...message, attempt: 2 })

    expect((await stockOfAlice())?.wood).toBe(40)
    const answers = await db.select().from(outbox).where(eq(outbox.topic, 'test.reply'))
    expect(answers).toHaveLength(1)
  })

  it("verse les ressources sans répondre, lorsque aucune réponse n'est demandée", async () => {
    await request(REALM_TOPICS.deposit, {
      transferId: 't1',
      playerId: 'alice',
      resources: { gold: 15 },
    })

    expect(await dispatcher.dispatch()).toEqual({ delivered: 1, failed: 0 })
    expect((await stockOfAlice())?.gold).toBe(15)
    expect(replies).toEqual([])
  })

  it("échoue sur un message mal formé, ou sur un versement à un village qui n'existe pas", async () => {
    await request(REALM_TOPICS.withdraw, { transferId: 't1', playerId: 'alice' })
    await request(REALM_TOPICS.deposit, {
      transferId: 't2',
      playerId: 'inconnu',
      resources: { gold: 15 },
    })

    expect(await dispatcher.dispatch()).toEqual({ delivered: 0, failed: 2 })
    expect(await dispatcher.status()).toEqual({ pending: 2, abandoned: 0 })
  })
})
