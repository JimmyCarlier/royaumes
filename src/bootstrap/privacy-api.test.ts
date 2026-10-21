import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { RankingEntry } from '@/modules/ranking/contracts'
import { rankingProjection } from '@/modules/ranking/infrastructure/ranking-projection'
import { createProjectionRunner } from '@/platform/projection/projection'
import { createTestApi, TEST_CRON_SECRET } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/**
 * Application de test dans laquelle Alice a joué dans tous les modules : elle a fondé
 * Valombre, ouvert une expédition que Bob a rejointe, publié une offre, écrit dans la Taverne.
 */
async function aliceHasPlayed() {
  const api = await createTestApi()
  await api.post('/api/realm/village', { name: 'Valombre' }, 'alice')
  await api.post('/api/realm/village', { name: 'Roche-Haute' }, 'bob')
  const { gameId } = await (await api.post('/api/dungeon/games', {}, 'alice')).json()
  await api.post(`/api/dungeon/games/${gameId}/join`, {}, 'bob')
  await api.post('/api/market/offers', { give: { wood: 10 }, want: { stone: 5 } }, 'alice')
  await api.post('/api/tavern/messages', { body: 'Bonsoir, ici Alice de Valombre' }, 'alice')
  await api.post('/api/tavern/messages', { body: 'Bonsoir Alice' }, 'bob')
  await api.post('/api/tavern/presence', {}, 'alice')
  return { api, gameId: gameId as string }
}

/** Exécute une requête SQL de lecture, comme le ferait un auditeur, et renvoie ses lignes. */
async function query<T>(api: TestApi, statement: ReturnType<typeof sql>) {
  const result = await api.db.execute(statement)
  return (result as unknown as { rows: T[] }).rows
}

/** Données d'un événement du journal, désigné par son flux et son type. */
async function eventData(api: TestApi, stream: string, type: string) {
  const rows = await query<{ data: Record<string, unknown> }>(
    api,
    sql`SELECT data FROM platform.events WHERE stream = ${stream} AND type = ${type}`,
  )
  return rows[0]?.data
}

/** Ligne du classement d'un joueur. */
async function rankingOf(api: TestApi, player: string) {
  const res = await api.get('/api/ranking/players', 'bob')
  const { entries } = (await res.json()) as { entries: RankingEntry[] }
  return entries.find((entry) => entry.playerId === player)
}

describe('Droits des joueurs - export', () => {
  it('refuse une requête anonyme (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/account/export', null)).status).toBe(401)
    expect((await api.api.request('/api/account', { method: 'DELETE' })).status).toBe(401)
  })

  it('exporte les données du joueur, module par module, en un fichier JSON', async () => {
    const { api, gameId } = await aliceHasPlayed()
    const res = await api.get('/api/account/export')

    expect(res.headers.get('content-disposition')).toContain('attachment')
    const { sections } = await res.json()
    expect(sections.realm).toMatchObject({ village: 'Valombre' })
    expect(sections.dungeon).toEqual({
      expeditions: [{ gameId, role: 'host', joinedAt: expect.any(Number), result: null }],
    })
    expect(sections.market.published).toMatchObject([{ give: { wood: 10 }, want: { stone: 5 } }])
    expect(sections.tavern.messages).toMatchObject([{ body: 'Bonsoir, ici Alice de Valombre' }])
    expect(sections.ranking).toMatchObject({ playerId: 'alice' })
  })

  it('ne contient ni les données des autres joueurs, ni les secrets du jeu', async () => {
    const { api } = await aliceHasPlayed()
    const text = await (await api.get('/api/account/export')).text()

    expect(text).not.toContain('Bonsoir Alice')
    expect(text).not.toContain('Roche-Haute')
    expect(text).not.toContain('seed')
  })
})

describe('Droits des joueurs - effacement', () => {
  it('réécrit les seuls champs personnels du journal, sans toucher aux autres joueurs', async () => {
    const { api, gameId } = await aliceHasPlayed()
    const res = await api.api.request('/api/account', {
      method: 'DELETE',
      headers: { 'x-test-user': 'alice' },
    })
    // Trois événements réécrits : la fondation du village, l'ouverture de l'expédition, l'offre.
    expect(await res.json()).toEqual({ eventsRewritten: 3 })

    expect(await eventData(api, 'village-alice', 'VillageFounded')).toMatchObject({
      name: 'Village effacé',
    })
    const created = await eventData(api, `dungeon-${gameId}`, 'GameCreated')
    // Seul le nom est remplacé : l'identifiant, la graine et les autres données sont intacts.
    expect(created).toMatchObject({ hostId: 'alice', hostName: 'Joueur effacé' })
    expect(created?.seed).toEqual(expect.any(Number))
    expect(await eventData(api, `dungeon-${gameId}`, 'PlayerJoined')).toMatchObject({
      name: 'bob',
    })
    expect(await eventData(api, 'village-bob', 'VillageFounded')).toMatchObject({
      name: 'Roche-Haute',
    })
  })

  it('efface les données des tables de tous les modules', async () => {
    const { api, gameId } = await aliceHasPlayed()
    await api.api.request('/api/account', { method: 'DELETE', headers: { 'x-test-user': 'alice' } })

    // Taverne : les messages et la présence d'Alice sont supprimés, ceux de Bob conservés.
    const authors = await query<{ author_id: string }>(
      api,
      sql`SELECT author_id FROM tavern.messages`,
    )
    expect(authors.map((row) => row.author_id)).toEqual(['bob'])
    expect(await query(api, sql`SELECT * FROM tavern.presence`)).toEqual([])

    // Tables de lecture : le nom d'Alice est remplacé partout.
    expect((await rankingOf(api, 'alice'))?.label).toBe('Joueur effacé')
    const games = await (await api.get('/api/dungeon/games', 'carol')).json()
    expect(games.games).toMatchObject([{ gameId, hostName: 'Joueur effacé' }])
    const offers = await (await api.get('/api/market/offers', 'carol')).json()
    expect(offers.offers).toMatchObject([{ sellerName: 'Joueur effacé' }])
  })

  it("enregistre l'effacement dans le registre, sans aucune donnée sur le joueur", async () => {
    const { api } = await aliceHasPlayed()
    await api.api.request('/api/account', { method: 'DELETE', headers: { 'x-test-user': 'alice' } })

    const rows = await query<Record<string, unknown>>(api, sql`SELECT * FROM platform.erasures`)
    expect(rows).toHaveLength(1)
    expect(Object.keys(rows[0]).sort()).toEqual(['erased_at', 'events_rewritten', 'id'])
    expect(rows[0].events_rewritten).toBe(3)
  })

  it('peut être relancé sans effet supplémentaire', async () => {
    const { api } = await aliceHasPlayed()
    const erase = () =>
      api.api.request('/api/account', { method: 'DELETE', headers: { 'x-test-user': 'alice' } })
    await erase()

    expect(await (await erase()).json()).toEqual({ eventsRewritten: 0 })
  })

  it('donne le même classement après une reconstruction de la projection', async () => {
    const { api } = await aliceHasPlayed()
    await rankingOf(api, 'alice')
    await api.api.request('/api/account', { method: 'DELETE', headers: { 'x-test-user': 'alice' } })
    const corrected = await rankingOf(api, 'alice')

    // La table corrigée par l'effacement et la table reconstruite à partir du journal réécrit
    // sont identiques : les deux chemins mènent au même résultat.
    await createProjectionRunner(api.db).rebuild(rankingProjection)
    expect(await rankingOf(api, 'alice')).toEqual(corrected)
  })
})

describe('Droits des joueurs - durée de conservation', () => {
  it('ne présente plus, et supprime, les messages de plus de trente jours', async () => {
    const { api } = await aliceHasPlayed()
    api.advance(30 * 24 * 60 + 1)

    const res = await api.get('/api/tavern/messages')
    expect((await res.json()).messages).toEqual([])
    expect(await query(api, sql`SELECT * FROM tavern.messages`)).toEqual([])
  })

  it('applique la durée de conservation chaque jour, même sans visite de la Taverne', async () => {
    const { api } = await aliceHasPlayed()
    api.advance(30 * 24 * 60 + 1)

    const res = await api.api.request('/api/cron/daily', {
      headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
    })
    const reports = await res.json()
    expect(reports.tavern).toEqual({ ok: true, result: { messages: 2, presence: 1 } })
    expect(reports.outbox.ok).toBe(true)
  })
})
