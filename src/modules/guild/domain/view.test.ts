import { describe, expect, it } from 'vitest'
import type { JoinRequest, Member } from './guild'
import { toGuildView, toMyRequestView } from './view'

const T0 = Date.UTC(2026, 0, 1)
const guild = { id: 'g1', name: 'Les Loups' }

const members: Member[] = [
  { playerId: 'alice', name: 'Alice', role: 'leader', joinedAt: T0 },
  { playerId: 'bob', name: 'Bob', role: 'member', joinedAt: T0 + 1 },
]
const request: JoinRequest = {
  id: 'r1',
  guildId: 'g1',
  playerId: 'dave',
  playerName: 'Dave',
  sentAt: T0,
}

describe('Règle 10 - le score compte les membres actuels', () => {
  it('ne compte que les membres actuels de la guilde', () => {
    // Carol a rapporté beaucoup d'or, mais n'est pas membre : sa contribution ne compte pas.
    const view = toGuildView(
      guild,
      [members[0]],
      { alice: { gold: 10, upgrades: 1 }, carol: { gold: 500, upgrades: 0 } },
      [],
      'alice',
      T0,
    )
    expect(view.score).toBe(20)
    expect(view.members).toMatchObject([{ playerId: 'alice', points: 20 }])
  })
})

describe('Vue de la guilde', () => {
  it('présente les demandes au seul chef', () => {
    expect(toGuildView(guild, members, {}, [request], 'alice', T0).requests).toHaveLength(1)
    expect(toGuildView(guild, members, {}, [request], 'bob', T0).requests).toEqual([])
  })

  it('ne présente plus une demande expirée, au chef comme au demandeur', () => {
    const later = T0 + 72 * 60 * 60_000
    expect(toGuildView(guild, members, {}, [request], 'alice', later).requests).toEqual([])
    expect(toMyRequestView(request, 'Les Loups', later)).toBeNull()
    expect(toMyRequestView(request, 'Les Loups', T0)).toMatchObject({ guildName: 'Les Loups' })
  })
})
