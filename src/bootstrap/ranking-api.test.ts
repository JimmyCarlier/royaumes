import { describe, expect, it } from 'vitest'
import type { RankingEntry } from '@/modules/ranking/contracts'
import { createTestApi } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/** Lignes du classement, telles que l'API les renvoie. */
async function ranking({ get }: TestApi) {
  const res = await get('/api/ranking/players')
  return ((await res.json()) as { entries: RankingEntry[] }).entries
}

describe('API du module Classement', () => {
  it('refuse une requête anonyme (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/ranking/players', null)).status).toBe(401)
  })

  it("présente l'activité enregistrée par le Village et le Donjon", async () => {
    const api = await createTestApi()
    // Village : fondation, puis une amélioration une heure plus tard.
    await api.post('/api/realm/village', { name: 'Valombre' })
    api.advance(60)
    await api.post('/api/realm/village/upgrade', { building: 'sawmill' })
    // Donjon : une expédition en solo, abandonnée pendant une heure, donc perdue.
    const { gameId } = await (await api.post('/api/dungeon/games', {})).json()
    await api.post(`/api/dungeon/games/${gameId}/start`, {})
    api.advance(60)
    await api.post(`/api/dungeon/games/${gameId}/deadline`, {})

    expect(await ranking(api)).toEqual([
      {
        rank: 1,
        playerId: 'alice',
        label: 'alice',
        gamesPlayed: 1,
        gamesWon: 0,
        gold: 0,
        upgrades: 1,
        bestLoot: 0,
      },
    ])
  })

  it('annonce sur son canal les événements du classement, sans leurs données', async () => {
    const api = await createTestApi()
    await api.post('/api/dungeon/games', {})

    const res = await api.get('/api/stream/ranking/events?after=0')
    const { events } = (await res.json()) as { events: { type: string }[] }
    expect(events.map((event) => event.type)).toEqual(['GameCreated'])
    // La graine de l'expédition, présente dans l'événement GameCreated, n'est pas transmise.
    expect(JSON.stringify(events)).not.toContain('seed')
  })

  it("ne compte qu'une fois chaque événement, quel que soit le nombre de consultations", async () => {
    const api = await createTestApi()
    await api.post('/api/realm/village', { name: 'Valombre' })
    api.advance(60)
    await api.post('/api/realm/village/upgrade', { building: 'sawmill' })

    const first = await ranking(api)
    const second = await ranking(api)
    expect(second).toEqual(first)
    expect(second[0].upgrades).toBe(1)
  })
})
