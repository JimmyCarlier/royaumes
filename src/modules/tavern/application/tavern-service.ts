import type { PresentPlayer, TavernMessage } from '../contracts'
import { checkBody, checkRate, type MessageError, RATE_LIMIT } from '../domain/message'
import { staleBefore } from '../domain/presence'
import type { MessageRepository } from './message-repository'
import type { PresenceRepository } from './presence-repository'

/** Nombre de messages présentés à l'ouverture de la Taverne. */
export const HISTORY_SIZE = 50

export type PostResult = { ok: true; message: TavernMessage } | { ok: false; error: MessageError }

/** Service applicatif de la Taverne. */
export function createTavernService(
  repo: MessageRepository,
  presence: PresenceRepository,
  clock = () => Date.now(),
) {
  /** Publie un message au nom d'un joueur, après validation et limitation. */
  async function post(player: { id: string; name: string }, body: string): Promise<PostResult> {
    const checked = checkBody(body)
    if (!checked.ok) return checked
    const now = clock()
    const recent = await repo.postedSince(player.id, now - RATE_LIMIT.windowMs)
    const limited = checkRate(recent, now)
    if (limited) return { ok: false, error: limited }
    const message = await repo.add({
      authorId: player.id,
      authorName: player.name,
      body: checked.body,
      postedAt: now,
    })
    return { ok: true, message }
  }

  /** Derniers messages de la Taverne. */
  const latest = () => repo.latest(HISTORY_SIZE)

  /**
   * Joueurs présents. Les lignes des joueurs partis sont d'abord supprimées : la présence
   * n'est conservée que le temps de la visite, sans tâche de fond pour faire le ménage.
   */
  async function present(): Promise<PresentPlayer[]> {
    await presence.removeStale(staleBefore(clock()))
    return presence.list()
  }

  /** Enregistre le signal de présence d'un joueur, et renvoie les joueurs présents. */
  async function heartbeat(player: PresentPlayer) {
    await presence.touch(player, clock())
    return present()
  }

  /** Retire aussitôt un joueur qui quitte la Taverne. */
  const leave = (playerId: string) => presence.remove(playerId)

  return { post, latest, present, heartbeat, leave }
}

export type TavernService = ReturnType<typeof createTavernService>
