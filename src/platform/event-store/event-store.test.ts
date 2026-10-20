import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from '../db/client'
import { ConcurrencyError, createEventStore, type EventStore } from './event-store'
import { withOptimisticRetry } from './retry'

// Chaque test dispose d'un journal neuf, sur une base vidée.
let store: EventStore
beforeEach(async () => {
  store = createEventStore(await createTestDatabase())
})

describe("Journal d'événements", () => {
  it("numérote les événements d'un flux et les relit dans l'ordre", async () => {
    await store.append('s-1', 0, [
      { type: 'A', data: { n: 1 } },
      { type: 'B', data: { n: 2 } },
    ])
    const events = await store.read('s-1')

    expect(events.map((e) => [e.version, e.type, e.data])).toEqual([
      [1, 'A', { n: 1 }],
      [2, 'B', { n: 2 }],
    ])
  })

  it('attribue une position globale croissante, tous flux confondus', async () => {
    await store.append('s-1', 0, [{ type: 'A', data: {} }])
    await store.append('s-2', 0, [{ type: 'B', data: {} }])
    await store.append('s-1', 1, [{ type: 'C', data: {} }])

    expect((await store.read('s-1')).map((e) => e.position)).toEqual([1, 3])
    expect((await store.read('s-2')).map((e) => e.position)).toEqual([2])
  })

  it('relit seulement les événements postérieurs à une version', async () => {
    await store.append('s-1', 0, [
      { type: 'A', data: {} },
      { type: 'B', data: {} },
      { type: 'C', data: {} },
    ])
    expect((await store.read('s-1', 2)).map((e) => e.type)).toEqual(['C'])
  })

  it('refuse une écriture fondée sur une version périmée', async () => {
    await store.append('s-1', 0, [{ type: 'A', data: {} }])

    await expect(store.append('s-1', 0, [{ type: 'B', data: {} }])).rejects.toBeInstanceOf(
      ConcurrencyError,
    )
    // L'écriture refusée n'a rien laissé dans le journal.
    expect(await store.read('s-1')).toHaveLength(1)
  })

  it("n'enregistre aucun événement d'un lot refusé", async () => {
    await store.append('s-1', 0, [{ type: 'A', data: {} }])
    // Le lot visait les versions 1 et 2 ; la version 1 existe déjà, tout le lot est refusé.
    await expect(
      store.append('s-1', 0, [
        { type: 'B', data: {} },
        { type: 'C', data: {} },
      ]),
    ).rejects.toBeInstanceOf(ConcurrencyError)

    expect((await store.read('s-1')).map((e) => e.type)).toEqual(['A'])
  })

  it('départage deux écritures simultanées : une seule réussit', async () => {
    const results = await Promise.allSettled([
      store.append('s-1', 0, [{ type: 'A', data: {} }]),
      store.append('s-1', 0, [{ type: 'B', data: {} }]),
    ])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await store.read('s-1')).toHaveLength(1)
  })
})

describe('Lecture de plusieurs flux', () => {
  it("relit tous les flux d'un même préfixe, dans l'ordre global", async () => {
    await store.append('game-1', 0, [{ type: 'A', data: {} }])
    await store.append('other-1', 0, [{ type: 'B', data: {} }])
    await store.append('game-2', 0, [{ type: 'C', data: {} }])
    await store.append('game-1', 1, [{ type: 'D', data: {} }])

    const events = await store.readAll({ streamPrefix: 'game-' })
    expect(events.map((e) => [e.stream, e.type])).toEqual([
      ['game-1', 'A'],
      ['game-2', 'C'],
      ['game-1', 'D'],
    ])
  })

  it('ne relit que les types demandés', async () => {
    await store.append('game-1', 0, [
      { type: 'A', data: {} },
      { type: 'B', data: {} },
      { type: 'C', data: {} },
    ])
    const events = await store.readAll({ streamPrefix: 'game-', types: ['A', 'C'] })
    expect(events.map((e) => e.type)).toEqual(['A', 'C'])
  })
})

describe('Nouvel essai en cas de conflit', () => {
  it("rejoue l'opération après un conflit, en relisant l'état", async () => {
    await store.append('s-1', 0, [{ type: 'A', data: {} }])
    let attempts = 0

    await withOptimisticRetry(async () => {
      attempts++
      // Première tentative : version périmée (0). Ensuite : version relue dans le journal.
      const version = attempts === 1 ? 0 : (await store.read('s-1')).length
      return store.append('s-1', version, [{ type: 'B', data: {} }])
    })

    expect(attempts).toBe(2)
    expect((await store.read('s-1')).map((e) => e.type)).toEqual(['A', 'B'])
  })

  it('abandonne après le nombre maximal de tentatives', async () => {
    await store.append('s-1', 0, [{ type: 'A', data: {} }])
    let attempts = 0

    await expect(
      withOptimisticRetry(async () => {
        attempts++
        return store.append('s-1', 0, [{ type: 'B', data: {} }])
      }, 3),
    ).rejects.toBeInstanceOf(ConcurrencyError)
    expect(attempts).toBe(3)
  })

  it('transmet immédiatement une erreur qui ne relève pas de la concurrence', async () => {
    let attempts = 0
    await expect(
      withOptimisticRetry(async () => {
        attempts++
        throw new Error('panne')
      }),
    ).rejects.toThrow('panne')
    expect(attempts).toBe(1)
  })
})
