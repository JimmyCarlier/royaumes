import type { TavernMessage } from '../contracts'
import { checkBody, checkRate, type MessageError, RATE_LIMIT } from '../domain/message'
import type { MessageRepository } from './message-repository'

/** Nombre de messages présentés à l'ouverture de la Taverne. */
export const HISTORY_SIZE = 50

export type PostResult = { ok: true; message: TavernMessage } | { ok: false; error: MessageError }

/** Service applicatif de la Taverne. */
export function createTavernService(repo: MessageRepository, clock = () => Date.now()) {
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

  return { post, latest }
}

export type TavernService = ReturnType<typeof createTavernService>
