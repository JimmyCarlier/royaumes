import { type Api, createApi } from './create-api'

/** Ce que l'application expose à Next.js : pour l'instant, la seule API. */
interface Server {
  api: Api
}

/**
 * L'instance est conservée dans l'objet global du processus.
 * En développement, Next.js recharge les modules à chaque modification :
 * une simple variable de module serait alors réinitialisée, et l'application
 * reconstruite à chaque fois.
 */
const globalForServer = globalThis as unknown as { royaumes?: Server }

/**
 * Renvoie l'application, en la construisant à la première demande.
 * Cette construction paresseuse garantit qu'aucun code de l'application
 * ne s'exécute lorsque Next.js analyse les fichiers pendant la construction.
 */
export function getServer(): Server {
  if (!globalForServer.royaumes) {
    globalForServer.royaumes = { api: createApi() }
  }
  return globalForServer.royaumes
}
