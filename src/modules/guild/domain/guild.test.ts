import { describe, expect, it } from 'vitest'
import {
  checkAccept,
  checkFound,
  checkKick,
  checkLeader,
  checkName,
  checkRequest,
  isExpired,
  type JoinRequest,
  MAX_MEMBERS,
  type Member,
  NAME_MAX,
  NAME_MIN,
  nameKey,
  type PlayerSituation,
  planDeparture,
  REQUEST_TTL_MS,
} from './guild'

const T0 = Date.UTC(2026, 0, 1)

// Membres fabriqués pour les tests : Alice est chef, Bob est arrivé après elle.
const member = (playerId: string, joinedAt: number, role: Member['role'] = 'member'): Member => ({
  playerId,
  name: playerId.toUpperCase(),
  role,
  joinedAt,
})
const alice = member('alice', T0, 'leader')
const bob = member('bob', T0 + 1000)
const carol = member('carol', T0 + 2000)

/** Joueur sans guilde ni demande, et joueur déjà membre d'une guilde. */
const free: PlayerSituation = { guildId: null, request: null }
const inGuild: PlayerSituation = { guildId: 'g1', request: null }

/** Guilde complète : Alice et sept autres membres. */
const full = [alice, ...Array.from({ length: MAX_MEMBERS - 1 }, (_, i) => member(`p${i}`, T0 + i))]

/** Demande envoyée par un joueur, à l'instant T0 par défaut. */
const requestFrom = (playerId: string, sentAt = T0): JoinRequest => ({
  id: `r-${playerId}`,
  guildId: 'g1',
  playerId,
  playerName: playerId.toUpperCase(),
  sentAt,
})

describe('Règle 1 - longueur du nom', () => {
  it('retire les espaces de début et de fin, et réduit les espaces intérieurs', () => {
    expect(checkName('  Les   Loups  ')).toMatchObject({ ok: true, name: 'Les Loups' })
  })

  it(`accepte de ${NAME_MIN} à ${NAME_MAX} caractères, comptés en caractères`, () => {
    expect(checkName('a'.repeat(NAME_MIN)).ok).toBe(true)
    expect(checkName('⚔'.repeat(NAME_MAX)).ok).toBe(true)
  })

  it('refuse un nom trop court ou trop long', () => {
    const error = { code: 'INVALID_NAME', min: NAME_MIN, max: NAME_MAX }
    expect(checkName('  ab  ')).toEqual({ ok: false, error })
    expect(checkName('a'.repeat(NAME_MAX + 1))).toEqual({ ok: false, error })
  })
})

describe('Règle 2 - unicité du nom', () => {
  it('donne la même clé à deux noms qui ne diffèrent que par les majuscules', () => {
    const first = checkName('Les Loups')
    const second = checkName('  les LOUPS ')
    expect(first.ok && second.ok && first.key === second.key).toBe(true)
    expect(nameKey('Écu d’Or')).toBe(nameKey('écu d’or'))
  })

  it('donne des clés différentes à deux noms différents', () => {
    expect(nameKey('Les Loups')).not.toBe(nameKey('Les Ours'))
  })
})

describe('Règle 3 - une seule guilde par joueur', () => {
  it('refuse la fondation à un joueur déjà membre', () => {
    expect(checkFound(inGuild)).toEqual({ code: 'ALREADY_MEMBER' })
    expect(checkFound(free)).toBeNull()
  })

  it('refuse la demande d’un joueur déjà membre', () => {
    expect(checkRequest(inGuild, [alice], T0)).toEqual({ code: 'ALREADY_MEMBER' })
  })

  it('refuse d’accepter un demandeur qui a rejoint une autre guilde entre-temps', () => {
    expect(checkAccept([alice], 'alice', requestFrom('dave'), inGuild, T0)).toEqual({
      code: 'ALREADY_MEMBER',
    })
  })
})

describe('Règle 4 - le fondateur est chef', () => {
  it('reconnaît le chef, et lui seul, comme chef', () => {
    expect(checkLeader([alice, bob], 'alice')).toBeNull()
    expect(checkLeader([alice, bob], 'bob')).toEqual({ code: 'NOT_LEADER' })
    expect(checkLeader([alice, bob], 'carol')).toEqual({ code: 'NOT_LEADER' })
  })
})

describe('Règle 5 - au plus huit membres', () => {
  it('refuse la demande adressée à une guilde complète', () => {
    expect(full).toHaveLength(8)
    expect(checkRequest(free, full, T0)).toEqual({ code: 'GUILD_FULL', max: 8 })
    expect(checkRequest(free, full.slice(1), T0)).toBeNull()
  })
  it("refuse d'accepter une demande lorsque la guilde est complète", () => {
    expect(checkAccept(full, 'alice', requestFrom('dave'), free, T0)).toEqual({
      code: 'GUILD_FULL',
      max: 8,
    })
  })
})

describe('Règle 6 - une seule demande en attente', () => {
  it("refuse une seconde demande tant que la première n'a pas expiré", () => {
    const pending: PlayerSituation = { guildId: null, request: requestFrom('dave', T0) }
    expect(checkRequest(pending, [alice], T0 + 1000)).toEqual({ code: 'REQUEST_PENDING' })
  })

  it('accepte une nouvelle demande lorsque la précédente a expiré', () => {
    const expired: PlayerSituation = { guildId: null, request: requestFrom('dave', T0) }
    expect(checkRequest(expired, [alice], T0 + REQUEST_TTL_MS)).toBeNull()
  })
})

describe('Règle 7 - les décisions du chef', () => {
  it("refuse qu'un simple membre accepte une demande", () => {
    expect(checkAccept([alice, bob], 'bob', requestFrom('dave'), free, T0)).toEqual({
      code: 'NOT_LEADER',
    })
  })

  it("refuse qu'un joueur extérieur à la guilde accepte une demande", () => {
    expect(checkAccept([alice], 'mallory', requestFrom('dave'), free, T0)).toEqual({
      code: 'NOT_LEADER',
    })
  })

  it("réserve l'exclusion au chef, qui ne peut pas s'exclure lui-même", () => {
    expect(checkKick([alice, bob], 'alice', 'bob')).toBeNull()
    expect(checkKick([alice, bob, carol], 'bob', 'carol')).toEqual({ code: 'NOT_LEADER' })
    expect(checkKick([alice, bob], 'alice', 'alice')).toEqual({ code: 'CANNOT_KICK_SELF' })
    expect(checkKick([alice, bob], 'alice', 'dave')).toEqual({ code: 'MEMBER_NOT_FOUND' })
  })
})

describe('Règle 8 - expiration des demandes', () => {
  it('fait expirer une demande 72 heures après son envoi', () => {
    const request = requestFrom('dave', T0)
    expect(REQUEST_TTL_MS).toBe(72 * 60 * 60 * 1000)
    expect(isExpired(request, T0 + REQUEST_TTL_MS - 1)).toBe(false)
    expect(isExpired(request, T0 + REQUEST_TTL_MS)).toBe(true)
  })
  it("refuse d'accepter une demande expirée", () => {
    const request = requestFrom('dave', T0)
    expect(checkAccept([alice], 'alice', request, free, T0 + REQUEST_TTL_MS)).toEqual({
      code: 'REQUEST_EXPIRED',
    })
    expect(checkAccept([alice], 'alice', request, free, T0 + REQUEST_TTL_MS - 1)).toBeNull()
  })
})

describe('Règle 9 - départ du chef et dissolution', () => {
  it('confie la guilde au membre le plus ancien lorsque le chef la quitte', () => {
    // L'ordre de la liste ne compte pas : seule la date d'arrivée désigne le plus ancien.
    expect(planDeparture([carol, alice, bob], 'alice')).toEqual({
      kind: 'leave',
      newLeaderId: 'bob',
    })
  })

  it("ne change pas de chef lorsqu'un simple membre part", () => {
    expect(planDeparture([alice, bob], 'bob')).toEqual({ kind: 'leave', newLeaderId: null })
  })

  it('départage deux arrivées simultanées par l’identifiant du joueur', () => {
    const zoe = member('zoe', T0 + 1000)
    expect(planDeparture([alice, zoe, bob], 'alice')).toMatchObject({ newLeaderId: 'bob' })
  })

  it('dissout la guilde lorsque son dernier membre la quitte', () => {
    expect(planDeparture([alice], 'alice')).toEqual({ kind: 'dissolve' })
  })
})
