import { describe, expect, it } from 'vitest'
import type { TavernMessage } from '@/modules/tavern/contracts'
import { createTestApi } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/** Publie un message au nom d'un joueur, Alice par défaut. */
const say = (api: TestApi, body: string, player = 'alice') =>
  api.post('/api/tavern/messages', { body }, player)

/** Messages de la Taverne, tels que l'API les renvoie. */
async function history(api: TestApi) {
  const res = await api.get('/api/tavern/messages')
  return ((await res.json()) as { messages: TavernMessage[] }).messages
}

describe('API du module Taverne', () => {
  it('refuse une requête anonyme (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/tavern/messages', null)).status).toBe(401)
  })

  it("publie les messages au nom du joueur connecté, et les présente dans l'ordre", async () => {
    const api = await createTestApi()
    expect((await say(api, 'Bonsoir la compagnie')).status).toBe(201)
    await say(api, 'Bonsoir Alice', 'bob')

    expect((await history(api)).map((m) => [m.authorName, m.body])).toEqual([
      ['alice', 'Bonsoir la compagnie'],
      ['bob', 'Bonsoir Alice'],
    ])
  })

  it('refuse un message vide ou trop long (422)', async () => {
    const api = await createTestApi()
    expect((await say(api, '   ')).status).toBe(422)
    expect((await say(api, 'a'.repeat(281))).status).toBe(422)
    expect(await history(api)).toEqual([])
  })

  it('limite le nombre de messages par joueur, puis accepte de nouveau (429)', async () => {
    const api = await createTestApi()
    for (let i = 1; i <= 5; i++) expect((await say(api, `Message ${i}`)).status).toBe(201)

    const refused = await say(api, 'Message 6')
    expect(refused.status).toBe(429)
    expect(refused.headers.get('retry-after')).toBe('30')
    // La limite est propre à chaque joueur : Bob peut toujours parler.
    expect((await say(api, 'Je peux parler ?', 'bob')).status).toBe(201)

    api.advance(1)
    expect((await say(api, 'Message 6')).status).toBe(201)
  })

  it('diffuse les messages sur le canal de la Taverne, avec leur contenu', async () => {
    const api = await createTestApi()
    await say(api, 'Premier')
    await say(api, 'Second', 'bob')

    const res = await api.get('/api/stream/tavern/events?after=1', 'carol')
    const { events } = (await res.json()) as {
      events: { position: number; type: string; data: TavernMessage }[]
    }
    expect(events).toMatchObject([
      { position: 2, type: 'MessagePosted', data: { authorName: 'bob', body: 'Second' } },
    ])
  })
})
