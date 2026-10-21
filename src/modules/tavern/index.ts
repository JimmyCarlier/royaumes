/**
 * Entrée publique « serveur » du module Taverne.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import type { Db } from '@/platform/db/client'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createTavernApi } from './api'
import { createTavernService } from './application/tavern-service'
import { MESSAGE_POSTED, TAVERN_CHANNEL } from './contracts'
import { createDrizzleMessageRepository } from './infrastructure/drizzle-message-repository'
import { createDrizzlePresenceRepository } from './infrastructure/drizzle-presence-repository'

export interface TavernModuleDeps {
  /** Base de données, dans laquelle la Taverne tient ses tables. */
  db: Db
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
}

/** Nombre maximal de messages transmis à la fois par le canal. */
const CHANNEL_BATCH = 100

/** Fabrique du module : assemble l'adaptateur, le service, l'API et la règle du canal. */
export function createTavernModule({ db, clock }: TavernModuleDeps) {
  const repo = createDrizzleMessageRepository(db)
  const service = createTavernService(repo, createDrizzlePresenceRepository(db), clock)

  // Canal de la Taverne : tout joueur connecté peut l'écouter. Il ne lit pas le journal,
  // mais la table des messages ; chaque message y est présenté comme un événement, dont la
  // position est l'identifiant du message. Le canal n'est pas discret : les messages sont
  // destinés à tous les joueurs, et l'interface les affiche sans relire l'API.
  const channelPolicy: ChannelPolicy = {
    prefix: TAVERN_CHANNEL,
    canSubscribe: (channel) => channel === TAVERN_CHANNEL,
    source: {
      async read(after) {
        const fresh = await repo.after(after, CHANNEL_BATCH)
        return fresh.map((message) => ({
          position: message.id,
          stream: TAVERN_CHANNEL,
          version: message.id,
          type: MESSAGE_POSTED,
          data: { ...message },
          occurredAt: new Date(message.postedAt),
        }))
      },
      // Un nouvel abonné ne reçoit que les messages à venir ; l'historique est lu par l'API.
      start: () => repo.lastId(),
    },
  }

  return { api: createTavernApi(service), channelPolicy }
}

export type { TavernApi } from './api'
