import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { GuildRanking, MyGuild } from '@/modules/guild/contracts'
import { createTestApi, TEST_CRON_SECRET } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/** Situation d'un joueur, telle que l'API la renvoie. */
async function mine(api: TestApi, player = 'alice') {
  return (await (await api.get('/api/guild/me', player)).json()) as MyGuild
}

/** Fonde une guilde au nom d'un joueur, Alice par défaut, et renvoie son identifiant. */
async function found(api: TestApi, name = 'Les Loups', player = 'alice') {
  const res = await api.post('/api/guild/guilds', { name }, player)
  expect(res.status).toBe(201)
  return ((await res.json()) as MyGuild).guild?.id as string
}

/** Envoie une demande d'adhésion au nom d'un joueur. */
const ask = (api: TestApi, guildId: string, player: string) =>
  api.post(`/api/guild/guilds/${guildId}/requests`, {}, player)

/** Identifiant de la demande d'un joueur, lu dans sa propre situation. */
async function requestOf(api: TestApi, player: string) {
  return (await mine(api, player)).request?.id as string
}

/** Fait entrer un joueur dans une guilde : demande, puis acceptation par le chef. */
async function join(api: TestApi, guildId: string, player: string, leader = 'alice') {
  await ask(api, guildId, player)
  const requestId = await requestOf(api, player)
  const res = await api.post(`/api/guild/requests/${requestId}/accept`, {}, leader)
  expect(res.status).toBe(200)
}

/** Envoie une requête DELETE au nom d'un joueur. */
const remove = (api: TestApi, path: string, player = 'alice') =>
  api.api.request(path, { method: 'DELETE', headers: { 'x-test-user': player } })

/** Classement des guildes. */
async function ranking(api: TestApi) {
  return ((await (await api.get('/api/guild/guilds')).json()) as GuildRanking).entries
}

describe('API du module Guildes - accès', () => {
  it('refuse toute requête anonyme (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/guild/me', null)).status).toBe(401)
    expect((await api.get('/api/guild/guilds', null)).status).toBe(401)
    expect((await api.post('/api/guild/guilds', { name: 'Les Loups' }, null)).status).toBe(401)
    expect((await api.post('/api/guild/leave', {}, null)).status).toBe(401)
  })

  it('refuse un identifiant mal formé dans l’adresse (400)', async () => {
    const api = await createTestApi()
    const res = await api.post('/api/guild/guilds/pas-un-uuid/requests', {}, 'bob')
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'INVALID_INPUT' } })
  })
})

describe('API du module Guildes - fondation', () => {
  it('fonde une guilde dont le joueur devient le chef (201)', async () => {
    const api = await createTestApi()
    await found(api, '  Les   Loups ')

    expect((await mine(api)).guild).toMatchObject({
      name: 'Les Loups',
      isLeader: true,
      members: [{ playerId: 'alice', role: 'leader' }],
    })
  })

  it('refuse un nom trop court (422), ou démesuré (400)', async () => {
    const api = await createTestApi()
    expect((await api.post('/api/guild/guilds', { name: 'ab' })).status).toBe(422)
    expect((await api.post('/api/guild/guilds', { name: 'a'.repeat(500) })).status).toBe(400)
  })

  it('refuse un nom déjà pris, sans tenir compte des majuscules (409)', async () => {
    const api = await createTestApi()
    await found(api, 'Les Loups')
    const res = await api.post('/api/guild/guilds', { name: 'LES LOUPS' }, 'bob')
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: { code: 'NAME_TAKEN' } })
  })

  it("n'accepte qu'une fondation lorsque deux joueurs choisissent le même nom au même instant", async () => {
    const api = await createTestApi()
    const statuses = await Promise.all([
      api.post('/api/guild/guilds', { name: 'Les Loups' }, 'alice'),
      api.post('/api/guild/guilds', { name: 'les loups' }, 'bob'),
    ]).then((responses) => responses.map((res) => res.status).sort())
    expect(statuses).toEqual([201, 409])
    expect(await ranking(api)).toHaveLength(1)
  })

  it('refuse à un membre de fonder une seconde guilde (409)', async () => {
    const api = await createTestApi()
    await found(api)
    expect((await api.post('/api/guild/guilds', { name: 'Les Ours' })).status).toBe(409)
  })
})

describe('API du module Guildes - demandes', () => {
  it('présente la demande au demandeur et au seul chef', async () => {
    const api = await createTestApi()
    const guildId = await found(api)
    await join(api, guildId, 'bob')
    expect((await ask(api, guildId, 'carol')).status).toBe(201)

    expect((await mine(api, 'carol')).request).toMatchObject({ guildId, guildName: 'Les Loups' })
    expect((await mine(api, 'alice')).guild?.requests).toMatchObject([{ playerName: 'carol' }])
    expect((await mine(api, 'bob')).guild?.requests).toEqual([])
  })

  it('refuse une demande vers une guilde inconnue (404) ou une seconde demande (409)', async () => {
    const api = await createTestApi()
    const guildId = await found(api)
    const other = await found(api, 'Les Ours', 'bob')
    const unknown = '00000000-0000-4000-8000-000000000000'
    expect((await ask(api, unknown, 'carol')).status).toBe(404)
    await ask(api, guildId, 'carol')
    const res = await ask(api, other, 'carol')
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: { code: 'REQUEST_PENDING' } })
  })

  it('refuse la demande adressée à une guilde complète (409)', async () => {
    const api = await createTestApi()
    const guildId = await found(api)
    for (let i = 1; i < 8; i++) await join(api, guildId, `joueur${i}`)
    const res = await ask(api, guildId, 'dave')
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: { code: 'GUILD_FULL', max: 8 } })
  })

  it('retire la demande du joueur, puis refuse de retirer une demande absente (404)', async () => {
    const api = await createTestApi()
    const guildId = await found(api)
    await ask(api, guildId, 'bob')

    expect((await remove(api, '/api/guild/requests/mine', 'bob')).status).toBe(200)
    expect((await mine(api, 'bob')).request).toBeNull()
    expect((await remove(api, '/api/guild/requests/mine', 'bob')).status).toBe(404)
  })
})

describe('API du module Guildes - décisions du chef', () => {
  it('accepte une demande : le demandeur devient membre', async () => {
    const api = await createTestApi()
    const guildId = await found(api)
    await join(api, guildId, 'bob')

    expect((await mine(api, 'bob')).guild).toMatchObject({ id: guildId, isLeader: false })
    expect((await mine(api)).guild?.members.map((m) => m.playerId)).toEqual(['alice', 'bob'])
  })

  it("refuse qu'un simple membre accepte une demande (403)", async () => {
    const api = await createTestApi()
    const guildId = await found(api)
    await join(api, guildId, 'bob')
    await ask(api, guildId, 'carol')
    const requestId = await requestOf(api, 'carol')
    expect((await api.post(`/api/guild/requests/${requestId}/accept`, {}, 'bob')).status).toBe(403)
  })

  it("refuse au chef d'une autre guilde d'accepter ou de refuser la demande (403)", async () => {
    const api = await createTestApi()
    const loups = await found(api, 'Les Loups')
    await found(api, 'Les Ours', 'bob')
    await ask(api, loups, 'carol')
    const requestId = await requestOf(api, 'carol')

    expect((await api.post(`/api/guild/requests/${requestId}/accept`, {}, 'bob')).status).toBe(403)
    expect((await api.post(`/api/guild/requests/${requestId}/refuse`, {}, 'bob')).status).toBe(403)
    expect((await mine(api, 'carol')).request).toMatchObject({ guildId: loups })
  })

  it("refuse d'accepter une demande expirée (409), qui disparaît des vues", async () => {
    const api = await createTestApi()
    const guildId = await found(api)
    await ask(api, guildId, 'bob')
    const requestId = await requestOf(api, 'bob')
    api.advance(72 * 60)

    const res = await api.post(`/api/guild/requests/${requestId}/accept`, {})
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: { code: 'REQUEST_EXPIRED' } })
    expect((await mine(api)).guild?.requests).toEqual([])
    // La demande expirée ne bloque plus le joueur : il peut en envoyer une nouvelle.
    expect((await ask(api, guildId, 'bob')).status).toBe(201)
  })

  it('refuse une demande : elle est supprimée (200), puis introuvable (404)', async () => {
    const api = await createTestApi()
    const guildId = await found(api)
    await ask(api, guildId, 'bob')
    const requestId = await requestOf(api, 'bob')

    expect((await api.post(`/api/guild/requests/${requestId}/refuse`, {})).status).toBe(200)
    expect((await mine(api, 'bob')).request).toBeNull()
    expect((await api.post(`/api/guild/requests/${requestId}/accept`, {})).status).toBe(404)
  })

  it('exclut un membre (200), mais pas le chef lui-même (409)', async () => {
    const api = await createTestApi()
    const guildId = await found(api)
    await join(api, guildId, 'bob')

    expect((await api.post('/api/guild/members/alice/kick', {})).status).toBe(409)
    expect((await api.post('/api/guild/members/bob/kick', {}, 'bob')).status).toBe(403)
    expect((await api.post('/api/guild/members/carol/kick', {})).status).toBe(404)
    expect((await api.post('/api/guild/members/bob/kick', {})).status).toBe(200)
    expect((await mine(api, 'bob')).guild).toBeNull()
  })
})

describe('API du module Guildes - départ', () => {
  it('confie la guilde au plus ancien membre lorsque le chef la quitte', async () => {
    const api = await createTestApi()
    const guildId = await found(api)
    await join(api, guildId, 'bob')
    api.advance(1)
    await join(api, guildId, 'carol')

    expect((await api.post('/api/guild/leave', {})).status).toBe(200)
    expect((await mine(api, 'bob')).guild).toMatchObject({ isLeader: true })
    expect((await mine(api, 'carol')).guild).toMatchObject({ isLeader: false })
  })

  it('dissout la guilde lorsque son dernier membre la quitte', async () => {
    const api = await createTestApi()
    const guildId = await found(api)
    await ask(api, guildId, 'bob')

    expect((await api.post('/api/guild/leave', {})).status).toBe(200)
    expect(await ranking(api)).toEqual([])
    // La demande adressée à la guilde dissoute a disparu avec elle.
    expect((await mine(api, 'bob')).request).toBeNull()
    // Le nom est de nouveau disponible.
    await found(api, 'Les Loups', 'carol')
  })

  it("refuse le départ d'un joueur sans guilde (404)", async () => {
    const api = await createTestApi()
    expect((await api.post('/api/guild/leave', {})).status).toBe(404)
  })
})

describe('API du module Guildes - classement', () => {
  it('compte les améliorations du Village des membres, à 10 points chacune', async () => {
    const api = await createTestApi()
    const loups = await found(api, 'Les Loups')
    await found(api, 'Les Ours', 'bob')
    await join(api, loups, 'carol')
    // Carol, membre des Loups, améliore sa scierie une heure après la fondation de son village.
    await api.post('/api/realm/village', { name: 'Valombre' }, 'carol')
    api.advance(60)
    await api.post('/api/realm/village/upgrade', { building: 'sawmill' }, 'carol')

    expect(await ranking(api)).toMatchObject([
      { rank: 1, name: 'Les Loups', memberCount: 2, score: 10, full: false },
      { rank: 2, name: 'Les Ours', memberCount: 1, score: 0 },
    ])
    expect((await mine(api, 'carol')).guild?.members).toMatchObject([
      { playerId: 'alice', points: 0 },
      { playerId: 'carol', points: 10 },
    ])
  })
})

describe('API du module Guildes - tâche quotidienne', () => {
  it('supprime les demandes expirées, et seulement elles', async () => {
    const api = await createTestApi()
    const guildId = await found(api)
    await ask(api, guildId, 'bob')
    api.advance(72 * 60 + 1)
    await ask(api, guildId, 'carol')

    const res = await api.api.request('/api/cron/daily', {
      headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
    })
    const reports = await res.json()
    expect(reports.guild).toEqual({ ok: true, result: { requests: 1, activity: 0 } })
    const rows = await api.db.execute(sql`SELECT player_id FROM guild.requests`)
    expect((rows as unknown as { rows: { player_id: string }[] }).rows).toEqual([
      { player_id: 'carol' },
    ])
  })
})

describe('API du module Guildes - canal temps réel', () => {
  it('annonce les changements de la guilde à ses membres, sans données', async () => {
    const api = await createTestApi()
    const guildId = await found(api)
    await join(api, guildId, 'bob')

    const res = await api.get(`/api/stream/guild-${guildId}/events?after=0`, 'bob')
    expect(res.status).toBe(200)
    const { events } = (await res.json()) as { events: { type: string; data: object }[] }
    expect(events.map((event) => event.type)).toEqual([
      'GuildFounded',
      'RequestReceived',
      'MemberJoined',
    ])
    expect(events.every((event) => Object.keys(event.data).length === 0)).toBe(true)
  })

  it("refuse le canal d'une guilde à un joueur qui n'en est pas membre (403)", async () => {
    const api = await createTestApi()
    const guildId = await found(api)
    await ask(api, guildId, 'bob')
    expect((await api.get(`/api/stream/guild-${guildId}/events`, 'bob')).status).toBe(403)
  })

  it("ne transmet pas les changements d'une autre guilde", async () => {
    const api = await createTestApi()
    const loups = await found(api, 'Les Loups')
    await found(api, 'Les Ours', 'bob')
    const res = await api.get(`/api/stream/guild-${loups}/events?after=0`)
    const { events } = (await res.json()) as { events: unknown[] }
    expect(events).toHaveLength(1)
  })
})

describe('API du module Guildes - données personnelles', () => {
  it("exporte l'appartenance, la demande et la contribution du joueur", async () => {
    const api = await createTestApi()
    await found(api, 'Les Ours', 'bob')
    const loups = await found(api)
    await ask(api, loups, 'carol')

    const alice = await (await api.get('/api/account/export')).json()
    expect(alice.sections.guild).toMatchObject({
      membership: { guild: 'Les Loups', role: 'leader' },
      request: null,
    })
    const carol = await (await api.get('/api/account/export', 'carol')).json()
    expect(carol.sections.guild.request).toMatchObject({ guild: 'Les Loups' })
    // L'export ne contient rien des autres joueurs.
    expect(JSON.stringify(alice.sections.guild)).not.toContain('bob')
  })

  it('efface le joueur : la guilde passe à un autre membre, et son nom disparaît', async () => {
    const api = await createTestApi()
    const guildId = await found(api)
    await join(api, guildId, 'bob')

    expect((await remove(api, '/api/account')).status).toBe(200)
    expect((await mine(api, 'bob')).guild).toMatchObject({
      isLeader: true,
      members: [{ playerId: 'bob' }],
    })
    const rows = await api.db.execute(
      sql`SELECT name FROM guild.members UNION ALL SELECT player_name FROM guild.requests`,
    )
    expect(JSON.stringify(rows)).not.toContain('alice')
  })
})
