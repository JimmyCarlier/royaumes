import { withOptimisticRetry } from '@/platform/event-store/retry'
import { MAX_HEROES } from '../domain/content'
import { decide, type GameCommand, type GameError } from '../domain/rules'
import { type GameView, toView } from '../domain/view'
import type { GameRepository } from './game-repository'

/** Résultat d'une commande : la vue mise à jour pour le joueur, ou l'erreur métier. */
export type CommandResult = { ok: true; view: GameView } | { ok: false; error: GameError }

/**
 * Nombre maximal de tentatives d'une commande. Tous les héros peuvent agir au même instant :
 * dans le pire des cas, chaque tentative n'en satisfait qu'un seul. Il faut donc au moins
 * autant de tentatives que de héros, plus une pour la commande d'échéance.
 */
const MAX_ATTEMPTS = MAX_HEROES + 1

export interface DungeonServiceOptions {
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
  /** Identifiant d'une nouvelle expédition ; un UUID aléatoire par défaut. */
  newId?: () => string
  /** Graine d'une nouvelle expédition ; un entier aléatoire sur 32 bits par défaut. */
  newSeed?: () => number
}

/** Service applicatif du Donjon : orchestre le domaine et la persistance. */
export function createDungeonService(
  repo: GameRepository,
  {
    clock = () => Date.now(),
    newId = () => crypto.randomUUID(),
    newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0],
  }: DungeonServiceOptions = {},
) {
  /**
   * Traite une commande sur une expédition : charger, décider, enregistrer,
   * puis renvoyer la vue du joueur viewerId. En cas de conflit d'écriture,
   * l'ensemble du traitement est rejoué sur l'état à jour.
   */
  function execute(gameId: string, viewerId: string, command: GameCommand) {
    return withOptimisticRetry(async (): Promise<CommandResult> => {
      const { state, version } = await repo.load(gameId)
      const now = clock()
      const decision = decide(state, command, now)
      if (!decision.ok) return decision
      await repo.save(gameId, version, decision.events)
      const updated = await repo.load(gameId)
      const view = toView(updated.state, viewerId, now)
      // La décision a été acceptée : l'expédition existe, et sa vue n'est donc jamais null.
      return view ? { ok: true, view } : { ok: false, error: { code: 'GAME_NOT_FOUND' } }
    }, MAX_ATTEMPTS)
  }

  /** Ouvre une nouvelle expédition, dont le joueur devient l'hôte. */
  async function create(player: { id: string; name: string }) {
    const gameId = newId()
    const result = await execute(gameId, player.id, {
      type: 'CreateGame',
      playerId: player.id,
      name: player.name,
      seed: newSeed(),
    })
    return { gameId, result }
  }

  /** Vue d'une expédition pour un joueur ; null si elle n'existe pas. */
  async function getView(gameId: string, viewerId: string): Promise<GameView | null> {
    const { state } = await repo.load(gameId)
    return toView(state, viewerId, clock())
  }

  /** Expéditions qui peuvent encore être rejointes. */
  function listOpenGames() {
    return repo.listOpenGames(clock())
  }

  return { execute, create, getView, listOpenGames }
}

/** Type du service, déduit de sa fabrique : utilisé par l'API du module. */
export type DungeonService = ReturnType<typeof createDungeonService>
