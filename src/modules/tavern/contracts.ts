/**
 * Entrée publique « partagée » du module Taverne : utilisable par le serveur
 * comme par l'interface.
 */
import { z } from 'zod'
import { MESSAGE_MAX_LENGTH } from './domain/message'

export type { MessageError } from './domain/message'
export { MESSAGE_MAX_LENGTH } from './domain/message'

/** Message de la Taverne, tel que le reçoivent les joueurs. */
export interface TavernMessage {
  /** Identifiant croissant : il ordonne les messages, et sert de position au canal temps réel. */
  id: number
  authorId: string
  authorName: string
  body: string
  postedAt: number
}

/** Corps attendu pour publier un message. La longueur exacte est vérifiée par le domaine. */
export const PostMessageInput = z.object({
  body: z.string().max(MESSAGE_MAX_LENGTH * 4),
})

/** Nom du canal temps réel de la Taverne. */
export const TAVERN_CHANNEL = 'tavern'

/** Type sous lequel un nouveau message est annoncé sur le canal. */
export const MESSAGE_POSTED = 'MessagePosted'
