import { createDatabase } from '@/platform/db/client'
import { createEventStore } from '@/platform/event-store/event-store'
import { type Api, createApi } from './create-api'

/** Ce que l'application expose à Next.js. */
interface Server {
  api: Api
  /** Résolue lorsque la base de données est prête. */
  ready: Promise<void>
}

/**
 * L'instance est conservée dans l'objet global du processus.
 * En développement, Next.js recharge les modules à chaque modification :
 * une simple variable de module serait alors réinitialisée, et l'application
 * reconstruite à chaque fois, avec une nouvelle connexion à la base.
 */
const globalForServer = globalThis as unknown as { royaumes?: Server }

/**
 * Renvoie l'application, en la construisant à la première demande.
 * Cette construction paresseuse garantit qu'aucun code de l'application,
 * et en particulier aucune connexion à la base, ne s'exécute lorsque Next.js
 * analyse les fichiers pendant la construction.
 */
export function getServer(): Server {
  if (!globalForServer.royaumes) {
    // La plateforme : la base de données, puis le journal d'événements qui l'utilise.
    const { db, ready } = createDatabase()
    const store = createEventStore(db)
    globalForServer.royaumes = { api: createApi({ store, ready }), ready }
  }
  return globalForServer.royaumes
}
