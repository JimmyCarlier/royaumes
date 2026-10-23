import { GUILD_ACTIVITY, type GuildRanking, type MyGuild } from '../contracts'
import {
  checkAccept,
  checkFound,
  checkKick,
  checkLeader,
  checkName,
  checkRequest,
  type GuildError,
  MAX_MEMBERS,
  pendingRequest,
  planDeparture,
  REQUEST_TTL_MS,
} from '../domain/guild'
import { NO_CONTRIBUTION, rankGuilds, scoreOf } from '../domain/score'
import { toGuildView, toMyRequestView } from '../domain/view'
import type { ContributionReader } from './contribution-reader'
import { GuildConflict, type GuildRepository, type GuildUnitOfWork } from './guild-repository'

/** Résultat d'une commande : la situation à jour du joueur, ou l'erreur métier. */
export type CommandResult = { ok: true; mine: MyGuild } | { ok: false; error: GuildError }

/** Joueur à l'origine d'une commande, tel que l'authentification l'a identifié. */
export interface Player {
  id: string
  name: string
}

export interface GuildServiceOptions {
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
  /** Identifiant d'une nouvelle guilde ou d'une demande ; un UUID aléatoire par défaut. */
  newId?: () => string
}

/** Durée de conservation des changements annoncés sur les canaux : sept jours. */
export const ACTIVITY_RETENTION_MS = 7 * 24 * 60 * 60_000

/** Erreur métier correspondant à une contrainte d'unicité refusée par la base. */
const CONFLICT_ERRORS: Record<GuildConflict['constraint'], GuildError> = {
  name: { code: 'NAME_TAKEN' },
  member: { code: 'ALREADY_MEMBER' },
  request: { code: 'REQUEST_PENDING' },
}

/** Refus d'une commande, levé dans la transaction afin de l'annuler. */
class Refusal extends Error {
  constructor(readonly error: GuildError) {
    super(error.code)
  }
}

/** Interrompt la transaction en cours si une vérification du domaine échoue. */
function ensure(check: GuildError | null) {
  if (check) throw new Refusal(check)
}

/**
 * Service applicatif des Guildes. Chaque commande se déroule dans une transaction :
 * lire la situation, la soumettre au domaine, puis écrire les changements et l'activité
 * annoncée sur le canal de la guilde. Une contrainte d'unicité refusée par la base, en cas
 * d'actions simultanées, est traduite en erreur métier.
 */
export function createGuildService(
  repo: GuildRepository,
  contributions: ContributionReader,
  { clock = () => Date.now(), newId = () => crypto.randomUUID() }: GuildServiceOptions = {},
) {
  /** Exécute une commande dans une transaction, puis renvoie la situation à jour du joueur. */
  async function command(
    playerId: string,
    work: (unit: GuildUnitOfWork, now: number) => Promise<void>,
  ): Promise<CommandResult> {
    try {
      await repo.atomically((unit) => work(unit, clock()))
    } catch (error) {
      if (error instanceof Refusal) return { ok: false, error: error.error }
      if (error instanceof GuildConflict) {
        return { ok: false, error: CONFLICT_ERRORS[error.constraint] }
      }
      throw error
    }
    return { ok: true, mine: await mine(playerId) }
  }

  /** Guilde verrouillée pour la durée de la transaction ; refus si elle n'existe pas. */
  async function lockedGuild(unit: GuildUnitOfWork, guildId: string) {
    const guild = await unit.findGuild(guildId, { lock: true })
    if (!guild) throw new Refusal({ code: 'GUILD_NOT_FOUND' })
    return guild
  }

  /** Guilde du joueur, verrouillée ; refus s'il n'appartient à aucune guilde. */
  async function lockedGuildOf(unit: GuildUnitOfWork, playerId: string) {
    const { guildId } = await unit.situation(playerId)
    if (!guildId) throw new Refusal({ code: 'NOT_A_MEMBER' })
    return lockedGuild(unit, guildId)
  }

  /** Demande désignée, et la guilde qu'elle vise, verrouillée. */
  async function lockedRequest(unit: GuildUnitOfWork, requestId: string) {
    const request = await unit.findRequest(requestId)
    if (!request) throw new Refusal({ code: 'REQUEST_NOT_FOUND' })
    await lockedGuild(unit, request.guildId)
    // La demande est relue une fois la guilde verrouillée : une décision simultanée du chef
    // a pu la traiter entre-temps.
    const current = await unit.findRequest(requestId)
    if (!current) throw new Refusal({ code: 'REQUEST_NOT_FOUND' })
    return current
  }

  /**
   * Départ d'un membre (règle 9) : le plus ancien membre devient chef si le chef part,
   * et la guilde est dissoute si le dernier membre part.
   */
  async function depart(
    unit: GuildUnitOfWork,
    guildId: string,
    playerId: string,
    type: string,
    now: number,
  ) {
    const plan = planDeparture(await unit.members(guildId), playerId)
    await unit.removeMember(playerId)
    if (plan.kind === 'dissolve') {
      await unit.deleteGuild(guildId)
      return
    }
    await unit.recordActivity(guildId, type, now)
    if (plan.newLeaderId) {
      await unit.setRole(plan.newLeaderId, 'leader')
      await unit.recordActivity(guildId, GUILD_ACTIVITY.leaderChanged, now)
    }
  }

  // -------------------------------------------------------------------------
  // Lectures
  // -------------------------------------------------------------------------

  /** Situation du joueur : la vue de sa guilde, ou celle de sa demande en attente. */
  async function mine(playerId: string): Promise<MyGuild> {
    const now = clock()
    const situation = await repo.situation(playerId)
    if (situation.guildId) {
      const guild = await repo.findGuild(situation.guildId)
      if (guild) {
        const members = await repo.members(guild.id)
        const scores = await contributions.of(members.map((m) => m.playerId))
        const requests = await repo.requestsOf(guild.id)
        return {
          guild: toGuildView(guild, members, scores, requests, playerId, now),
          request: null,
        }
      }
    }
    const request = pendingRequest(situation, now)
    const target = request ? await repo.findGuild(request.guildId) : null
    return {
      guild: null,
      request: request && target ? toMyRequestView(request, target.name, now) : null,
    }
  }

  /** Classement de toutes les guildes, calculé à partir des contributions de leurs membres. */
  async function ranking(): Promise<GuildRanking> {
    const all = await repo.allWithMembers()
    const scores = await contributions.of(
      all.flatMap(({ members }) => members.map((m) => m.playerId)),
    )
    const entries = rankGuilds(
      all.map(({ guild, members }) => ({
        id: guild.id,
        name: guild.name,
        memberCount: members.length,
        score: scoreOf(members.map((m) => scores[m.playerId] ?? NO_CONTRIBUTION)),
      })),
    )
    return {
      entries: entries.map((entry) => ({ ...entry, full: entry.memberCount >= MAX_MEMBERS })),
    }
  }

  /** Vrai si le joueur est membre de la guilde : règle d'accès au canal temps réel. */
  async function isMember(guildId: string, playerId: string) {
    return (await repo.situation(playerId)).guildId === guildId
  }

  // -------------------------------------------------------------------------
  // Commandes
  // -------------------------------------------------------------------------

  /** Fonde une guilde, dont le joueur devient le chef (règles 1 à 4). */
  async function found(player: Player, rawName: string): Promise<CommandResult> {
    const checked = checkName(rawName)
    if (!checked.ok) return checked
    return command(player.id, async (unit, now) => {
      const situation = await unit.situation(player.id)
      ensure(checkFound(situation))
      const guildId = newId()
      await unit.createGuild({
        id: guildId,
        name: checked.name,
        nameKey: checked.key,
        createdAt: now,
      })
      await unit.addMember(guildId, {
        playerId: player.id,
        name: player.name,
        role: 'leader',
        joinedAt: now,
      })
      // Le fondateur renonce à la demande qu'il avait éventuellement envoyée ailleurs.
      if (situation.request) await unit.deleteRequest(situation.request.id)
      await unit.recordActivity(guildId, GUILD_ACTIVITY.founded, now)
    })
  }

  /** Demande à rejoindre une guilde (règles 3, 5 et 6). */
  function requestToJoin(player: Player, guildId: string): Promise<CommandResult> {
    return command(player.id, async (unit, now) => {
      await lockedGuild(unit, guildId)
      const situation = await unit.situation(player.id)
      ensure(checkRequest(situation, await unit.members(guildId), now))
      // Une demande expirée est remplacée par la nouvelle.
      if (situation.request) await unit.deleteRequest(situation.request.id)
      await unit.addRequest({
        id: newId(),
        guildId,
        playerId: player.id,
        playerName: player.name,
        sentAt: now,
      })
      await unit.recordActivity(guildId, GUILD_ACTIVITY.requestReceived, now)
    })
  }

  /** Retire la demande en attente du joueur. */
  function cancelRequest(playerId: string): Promise<CommandResult> {
    return command(playerId, async (unit, now) => {
      const request = pendingRequest(await unit.situation(playerId), now)
      if (!request) throw new Refusal({ code: 'NO_PENDING_REQUEST' })
      await unit.deleteRequest(request.id)
      await unit.recordActivity(request.guildId, GUILD_ACTIVITY.requestCancelled, now)
    })
  }

  /** Accepte une demande, au nom du chef de la guilde visée (règles 3, 5, 7 et 8). */
  function accept(leaderId: string, requestId: string): Promise<CommandResult> {
    return command(leaderId, async (unit, now) => {
      const request = await lockedRequest(unit, requestId)
      const members = await unit.members(request.guildId)
      ensure(checkAccept(members, leaderId, request, await unit.situation(request.playerId), now))
      await unit.deleteRequest(request.id)
      await unit.addMember(request.guildId, {
        playerId: request.playerId,
        name: request.playerName,
        role: 'member',
        joinedAt: now,
      })
      await unit.recordActivity(request.guildId, GUILD_ACTIVITY.memberJoined, now)
    })
  }

  /** Refuse une demande, au nom du chef de la guilde visée (règle 7). */
  function refuse(leaderId: string, requestId: string): Promise<CommandResult> {
    return command(leaderId, async (unit, now) => {
      const request = await lockedRequest(unit, requestId)
      ensure(checkLeader(await unit.members(request.guildId), leaderId))
      await unit.deleteRequest(request.id)
      await unit.recordActivity(request.guildId, GUILD_ACTIVITY.requestRefused, now)
    })
  }

  /** Exclut un membre, au nom du chef (règle 7). */
  function kick(leaderId: string, targetId: string): Promise<CommandResult> {
    return command(leaderId, async (unit, now) => {
      const guild = await lockedGuildOf(unit, leaderId)
      ensure(checkKick(await unit.members(guild.id), leaderId, targetId))
      await unit.removeMember(targetId)
      await unit.recordActivity(guild.id, GUILD_ACTIVITY.memberKicked, now)
    })
  }

  /** Quitte la guilde du joueur (règle 9). */
  function leave(playerId: string): Promise<CommandResult> {
    return command(playerId, async (unit, now) => {
      const guild = await lockedGuildOf(unit, playerId)
      await depart(unit, guild.id, playerId, GUILD_ACTIVITY.memberLeft, now)
    })
  }

  /**
   * Retire un joueur des Guildes, à l'effacement de son compte : il quitte sa guilde selon
   * la règle 9, et sa demande est supprimée. Sans guilde ni demande, rien ne change.
   */
  async function removePlayer(playerId: string) {
    await repo.atomically(async (unit) => {
      const now = clock()
      const situation = await unit.situation(playerId)
      if (situation.request) await unit.deleteRequest(situation.request.id)
      if (situation.guildId && (await unit.findGuild(situation.guildId, { lock: true }))) {
        await depart(unit, situation.guildId, playerId, GUILD_ACTIVITY.memberLeft, now)
      }
    })
  }

  /**
   * Tâche quotidienne : supprime les demandes expirées et l'activité ancienne. Une demande
   * expirée n'est déjà plus présentée ni acceptable (règle 8) : la tâche ne fait que le ménage.
   */
  async function purge() {
    const now = clock()
    return {
      requests: await repo.removeRequestsSentBefore(now - REQUEST_TTL_MS),
      activity: await repo.removeActivityBefore(now - ACTIVITY_RETENTION_MS),
    }
  }

  return {
    mine,
    ranking,
    isMember,
    found,
    requestToJoin,
    cancelRequest,
    accept,
    refuse,
    kick,
    leave,
    removePlayer,
    purge,
  }
}

/** Type du service, déduit de sa fabrique : utilisé par l'API du module. */
export type GuildService = ReturnType<typeof createGuildService>
