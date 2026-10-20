import { describe, expect, it } from 'vitest'
import type { GameView } from '@/modules/dungeon/contracts'
import { createTestApi } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/** Ouvre une expédition au nom du premier joueur, que les suivants rejoignent. */
async function openGame({ post }: TestApi, players: string[]) {
  const res = await post('/api/dungeon/games', {}, players[0])
  const { gameId } = (await res.json()) as { gameId: string }
  for (const player of players.slice(1)) {
    await post(`/api/dungeon/games/${gameId}/join`, {}, player)
  }
  return gameId
}

/** Lance l'expédition, puis ouvre les portes à tour de rôle jusqu'au premier combat. */
async function untilCombat(api: TestApi, players: string[]) {
  const gameId = await openGame(api, players)
  await api.post(`/api/dungeon/games/${gameId}/start`, {}, players[0])
  for (;;) {
    const view = await viewOf(api, gameId, players[0])
    if (view.phase === 'combat') return { gameId, view }
    await api.post(`/api/dungeon/games/${gameId}/door`, {}, view.turnHeroId)
  }
}

/** Vue d'une expédition pour un joueur. */
async function viewOf({ get }: TestApi, gameId: string, player: string) {
  const res = await get(`/api/dungeon/games/${gameId}`, player)
  return ((await res.json()) as { view: GameView }).view
}

describe('API du module Donjon', () => {
  it('ouvre une expédition (201) et la propose parmi les expéditions ouvertes', async () => {
    const api = await createTestApi()
    const res = await api.post('/api/dungeon/games', {})
    expect(res.status).toBe(201)
    const { gameId } = await res.json()

    const list = await (await api.get('/api/dungeon/games', 'bob')).json()
    expect(list.games).toMatchObject([{ gameId, hostName: 'alice', heroCount: 1 }])
  })

  it("ne laisse que l'hôte lancer l'expédition (403)", async () => {
    const api = await createTestApi()
    const gameId = await openGame(api, ['alice', 'bob'])

    const refused = await api.post(`/api/dungeon/games/${gameId}/start`, {}, 'bob')
    expect(refused.status).toBe(403)
    expect(await refused.json()).toEqual({ error: { code: 'NOT_HOST' } })

    const started = await api.post(`/api/dungeon/games/${gameId}/start`, {}, 'alice')
    expect(started.status).toBe(200)
    expect((await (await api.get('/api/dungeon/games')).json()).games).toEqual([])
  })

  it('renvoie une erreur 404 pour une expédition inconnue', async () => {
    const api = await createTestApi()
    const res = await api.get('/api/dungeon/games/inconnue')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: { code: 'GAME_NOT_FOUND' } })
  })

  it('rejette une action mal formée avant tout appel au service (400)', async () => {
    const api = await createTestApi()
    const { gameId, view } = await untilCombat(api, ['alice'])
    const res = await api.post(`/api/dungeon/games/${gameId}/action`, {
      round: view.round,
      action: { type: 'fuir' },
    })
    expect(res.status).toBe(400)
  })

  it("ne révèle pas l'action d'un héros aux autres joueurs", async () => {
    const api = await createTestApi()
    const { gameId, view } = await untilCombat(api, ['alice', 'bob'])
    await api.post(`/api/dungeon/games/${gameId}/action`, {
      round: view.round,
      action: { type: 'defend' },
    })

    const seenByBob = await viewOf(api, gameId, 'bob')
    expect(seenByBob.heroes[0]).toMatchObject({ id: 'alice', ready: true, action: null })
    const seenByAlice = await viewOf(api, gameId, 'alice')
    expect(seenByAlice.heroes[0]).toMatchObject({ action: { type: 'defend' } })
  })

  it("fait défendre, à l'échéance, les héros qui n'ont rien choisi", async () => {
    const api = await createTestApi()
    const { gameId, view } = await untilCombat(api, ['alice', 'bob'])
    api.advance(0.5)
    const res = await api.post(`/api/dungeon/games/${gameId}/deadline`, {}, 'bob')
    const { view: after } = (await res.json()) as { view: GameView }

    expect(after.lastRound?.round).toBe(view.round)
    expect(after.lastRound?.actions).toEqual({ alice: { type: 'defend' }, bob: { type: 'defend' } })
  })
})

describe("Contrôle d'accès à l'API du Donjon", () => {
  it('refuse toute requête anonyme (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/dungeon/games', null)).status).toBe(401)
    expect((await api.post('/api/dungeon/games', {}, null)).status).toBe(401)
  })
})

describe('Écritures concurrentes sur une expédition', () => {
  it('enregistre les actions de quatre héros envoyées au même instant', async () => {
    const api = await createTestApi()
    const players = ['alice', 'bob', 'carol', 'dan']
    const { gameId, view } = await untilCombat(api, players)

    const responses = await Promise.all(
      players.map((player) =>
        api.post(
          `/api/dungeon/games/${gameId}/action`,
          { round: view.round, action: { type: 'defend' } },
          player,
        ),
      ),
    )
    expect(responses.map((res) => res.status)).toEqual([200, 200, 200, 200])
    // Les quatre actions ont été prises en compte : la manche a été résolue.
    const after = await viewOf(api, gameId, 'alice')
    expect(Object.keys(after.lastRound?.actions ?? {})).toHaveLength(4)
  })

  it("n'enregistre qu'une résolution pour deux commandes d'échéance simultanées", async () => {
    const api = await createTestApi()
    const { gameId, view } = await untilCombat(api, ['alice', 'bob'])
    api.advance(0.5)

    const responses = await Promise.all(
      ['alice', 'bob'].map((player) =>
        api.post(`/api/dungeon/games/${gameId}/deadline`, {}, player),
      ),
    )
    expect(responses.map((res) => res.status)).toEqual([200, 200])
    const after = await viewOf(api, gameId, 'alice')
    expect(after.round).toBe(view.round + 1)
  })
})
