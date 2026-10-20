import { describe, expect, it } from 'vitest'
import type { GameView } from '@/modules/dungeon/contracts'
import { createTestApi } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/** Ouvre une expédition au nom d'alice, que bob rejoint. */
async function openGame({ post }: TestApi) {
  const { gameId } = (await (await post('/api/dungeon/games', {})).json()) as { gameId: string }
  await post(`/api/dungeon/games/${gameId}/join`, {}, 'bob')
  return gameId
}

/** Lit un flux jusqu'à sa fermeture volontaire, au nom d'un joueur. */
async function readStream({ get }: TestApi, gameId: string, player: string) {
  const res = await get(`/api/stream/dungeon-${gameId}`, player)
  return { status: res.status, body: await res.text() }
}

describe('Temps réel du Donjon', () => {
  it("réserve le canal d'une expédition à ses membres (403)", async () => {
    const api = await createTestApi()
    const gameId = await openGame(api)

    expect((await readStream(api, gameId, 'bob')).status).toBe(200)
    expect((await readStream(api, gameId, 'carol')).status).toBe(403)
  })

  it("signale l'action d'un héros sans la révéler", async () => {
    const api = await createTestApi()
    const gameId = await openGame(api)
    await api.post(`/api/dungeon/games/${gameId}/start`, {})

    // Les portes sont ouvertes à tour de rôle jusqu'au premier combat.
    let view: GameView
    for (;;) {
      const res = await api.get(`/api/dungeon/games/${gameId}`)
      view = ((await res.json()) as { view: GameView }).view
      if (view.phase === 'combat') break
      await api.post(`/api/dungeon/games/${gameId}/door`, {}, view.turnHeroId)
    }
    await api.post(`/api/dungeon/games/${gameId}/action`, {
      round: view.round,
      action: { type: 'heal', target: 'alice' },
    })

    const { body } = await readStream(api, gameId, 'bob')
    expect(body).toContain('"type":"ActionSubmitted"')
    expect(body).not.toContain('heal')
  })
})
