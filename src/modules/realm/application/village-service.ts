import {
  type DomainError,
  decide,
  toView,
  type VillageCommand,
  type VillageView,
} from '../domain/village'
import type { VillageRepository } from './village-repository'

/** Résultat d'une commande : la vue mise à jour, ou l'erreur métier. */
export type CommandResult = { ok: true; view: VillageView } | { ok: false; error: DomainError }

/**
 * Service applicatif du Village : orchestre le domaine et la persistance.
 * Il reçoit ses dépendances en paramètre : le port de persistance et l'horloge.
 */
export function createVillageService(repo: VillageRepository, clock = () => Date.now()) {
  /** Traite une commande : charger, décider, enregistrer, puis renvoyer la vue. */
  async function execute(userId: string, command: VillageCommand): Promise<CommandResult> {
    // 1. Charger l'état courant et sa version.
    const { state, version } = await repo.load(userId)

    // 2. Lire l'horloge une seule fois : la décision et la vue portent sur le même instant.
    const now = clock()

    // 3. Demander la décision au domaine. Un refus est renvoyé tel quel.
    const decision = decide(state, command, now)
    if (!decision.ok) return decision

    // 4. Enregistrer les événements produits, à la suite de la version lue.
    await repo.save(userId, version, decision.events)

    // 5. Renvoyer la vue de l'état obtenu.
    const updated = await repo.load(userId)
    return { ok: true, view: toView(updated.state, now) }
  }

  /** Renvoie la vue du village d'un joueur, ou null s'il n'en a pas encore fondé. */
  async function getView(userId: string): Promise<VillageView | null> {
    const { state } = await repo.load(userId)
    return state.founded ? toView(state, clock()) : null
  }

  return { execute, getView }
}

/** Type du service, déduit de sa fabrique : utilisé par l'API du module. */
export type VillageService = ReturnType<typeof createVillageService>
