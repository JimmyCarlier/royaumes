/**
 * Domaine du Village, selon le modèle decider :
 *   decide(état, commande, maintenant) -> événements ou erreur métier
 *   evolve(état, événement)            -> nouvel état
 * Ce fichier est écrit en TypeScript pur : il n'importe que le catalogue du domaine.
 */
import {
  BUILDINGS,
  type Building,
  CATALOG,
  COST_EXPONENT,
  type Levels,
  MAX_LEVEL,
  RESOURCES,
  type Resource,
  STARTING_LEVELS,
  STARTING_STOCK,
  type Stock,
} from './catalog'

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

export interface VillageState {
  /** Faux tant que le village n'a pas été fondé. */
  founded: boolean
  name: string
  /** Stock calculé à l'instant asOf (valeurs décimales conservées). */
  stock: Stock
  levels: Levels
  /** Instant, en millisecondes, auquel le stock a été calculé pour la dernière fois. */
  asOf: number
  /**
   * Mouvements de ressources déjà traités, par identifiant, avec leur issue.
   * Ils rendent les commandes de mouvement idempotentes : un identifiant connu est ignoré.
   */
  transfers: Record<string, TransferOutcome>
}

/** Issue d'un mouvement de ressources. */
export type TransferOutcome = 'withdrawn' | 'refused' | 'deposited'

/** État d'un village qui n'a encore connu aucun événement. */
export const initialState: VillageState = {
  founded: false,
  name: '',
  stock: { wood: 0, stone: 0, gold: 0 },
  levels: { sawmill: 0, quarry: 0, mine: 0 },
  asOf: 0,
  transfers: {},
}

// ---------------------------------------------------------------------------
// Événements : des faits accomplis, nommés au participe passé
// ---------------------------------------------------------------------------

export type VillageEvent =
  | { type: 'VillageFounded'; data: { name: string; at: number } }
  | {
      type: 'BuildingUpgraded'
      data: { building: Building; toLevel: number; cost: Partial<Stock>; at: number }
    }
  // Mouvements de ressources demandés par un autre module (TD9). Chacun porte l'identifiant
  // du mouvement, choisi par le demandeur, qui permet d'en reconnaître un doublon.
  | {
      type: 'ResourcesWithdrawn'
      data: { transferId: string; resources: Partial<Stock>; at: number }
    }
  | {
      type: 'WithdrawalRefused'
      data: { transferId: string; missing: Partial<Stock>; at: number }
    }
  | {
      type: 'ResourcesDeposited'
      data: { transferId: string; resources: Partial<Stock>; at: number }
    }

// ---------------------------------------------------------------------------
// Commandes : des intentions, nommées à l'impératif
// ---------------------------------------------------------------------------

export type VillageCommand =
  | { type: 'FoundVillage'; name: string }
  | { type: 'UpgradeBuilding'; building: Building }
  | TransferCommand

/** Commandes de mouvement de ressources, émises par un autre module et non par le joueur. */
export type TransferCommand =
  | { type: 'WithdrawResources'; transferId: string; resources: Partial<Stock> }
  | { type: 'DepositResources'; transferId: string; resources: Partial<Stock> }

// ---------------------------------------------------------------------------
// Résultat d'une décision : des événements, ou une erreur métier
// ---------------------------------------------------------------------------

export type DomainError =
  | { code: 'ALREADY_FOUNDED' }
  | { code: 'NOT_FOUNDED' }
  | { code: 'MAX_LEVEL_REACHED'; building: Building }
  | { code: 'INSUFFICIENT_RESOURCES'; missing: Partial<Stock> }

export type Decision = { ok: true; events: VillageEvent[] } | { ok: false; error: DomainError }

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------

/** Production par minute de chaque ressource, pour des niveaux donnés. */
export function productionPerMinute(levels: Levels): Stock {
  const rates: Stock = { wood: 0, stone: 0, gold: 0 }
  for (const building of BUILDINGS) {
    const { produces, perMinute } = CATALOG[building]
    rates[produces] += perMinute * levels[building]
  }
  return rates
}

/**
 * Ajoute au stock la production accumulée entre state.asOf et l'instant at,
 * puis fait de at le nouvel instant de référence.
 * Un nouvel objet est renvoyé : l'état reçu n'est jamais modifié.
 */
export function accrue(state: VillageState, at: number): VillageState {
  if (!state.founded || at <= state.asOf) return state
  const minutes = (at - state.asOf) / 60_000
  const rates = productionPerMinute(state.levels)
  const stock = { ...state.stock }
  for (const resource of RESOURCES) stock[resource] += rates[resource] * minutes
  return { ...state, stock, asOf: at }
}

// ---------------------------------------------------------------------------
// evolve : applique un événement, sans aucune vérification
// ---------------------------------------------------------------------------

export function evolve(state: VillageState, event: VillageEvent): VillageState {
  switch (event.type) {
    case 'VillageFounded':
      // La fondation repart de l'état initial, complété par le contenu de départ.
      // Les mouvements déjà traités sont conservés : un prélèvement peut avoir été refusé
      // à un joueur qui n'avait pas encore fondé son village.
      return {
        ...initialState,
        founded: true,
        name: event.data.name,
        stock: { ...STARTING_STOCK },
        levels: { ...STARTING_LEVELS },
        asOf: event.data.at,
        transfers: state.transfers,
      }

    case 'BuildingUpgraded': {
      // 1. Le stock est d'abord calculé à l'instant de l'amélioration,
      //    avec la production des anciens niveaux.
      const current = accrue(state, event.data.at)
      // 2. Le coût enregistré dans l'événement est déduit du stock.
      const stock = { ...current.stock }
      for (const [resource, amount] of Object.entries(event.data.cost)) {
        stock[resource as Resource] -= amount ?? 0
      }
      // 3. Le nouveau niveau s'applique à partir de cet instant.
      return {
        ...current,
        stock,
        levels: { ...current.levels, [event.data.building]: event.data.toLevel },
      }
    }

    // Un mouvement est appliqué au stock calculé à l'instant du mouvement, comme un coût.
    case 'ResourcesWithdrawn': {
      const current = accrue(state, event.data.at)
      return {
        ...current,
        stock: addTo(current.stock, event.data.resources, -1),
        transfers: { ...current.transfers, [event.data.transferId]: 'withdrawn' },
      }
    }

    case 'WithdrawalRefused':
      // Un refus ne modifie pas le stock ; il est retenu, pour être répété à l'identique.
      return { ...state, transfers: { ...state.transfers, [event.data.transferId]: 'refused' } }

    case 'ResourcesDeposited': {
      const current = accrue(state, event.data.at)
      return {
        ...current,
        stock: addTo(current.stock, event.data.resources, 1),
        transfers: { ...current.transfers, [event.data.transferId]: 'deposited' },
      }
    }
  }
}

/** Ajoute (sign = 1) ou retire (sign = -1) des quantités à un stock ; renvoie un nouveau stock. */
function addTo(stock: Stock, amounts: Partial<Stock>, sign: 1 | -1): Stock {
  const result = { ...stock }
  for (const [resource, amount] of Object.entries(amounts)) {
    result[resource as Resource] += sign * (amount ?? 0)
  }
  return result
}

/** Reconstruit l'état d'un village à partir de la suite de ses événements. */
export function replay(events: VillageEvent[]): VillageState {
  return events.reduce(evolve, initialState)
}

// ---------------------------------------------------------------------------
// Coût d'amélioration
// ---------------------------------------------------------------------------

/** Coût pour faire passer un bâtiment du niveau level au niveau level + 1. */
export function upgradeCost(building: Building, level: number): Partial<Stock> {
  const factor = (level + 1) ** COST_EXPONENT
  const cost: Partial<Stock> = {}
  for (const [resource, amount] of Object.entries(CATALOG[building].baseCost)) {
    cost[resource as Resource] = Math.round((amount ?? 0) * factor)
  }
  return cost
}

/** Quantités manquantes pour payer un coût ; objet vide si le stock suffit. */
function missingFor(stock: Stock, cost: Partial<Stock>): Partial<Stock> {
  const missing: Partial<Stock> = {}
  for (const [resource, amount] of Object.entries(cost)) {
    const lack = (amount ?? 0) - stock[resource as Resource]
    if (lack > 0) missing[resource as Resource] = Math.ceil(lack)
  }
  return missing
}

// ---------------------------------------------------------------------------
// decide : vérifie une commande et en déduit les événements
// ---------------------------------------------------------------------------

export function decide(state: VillageState, command: VillageCommand, now: number): Decision {
  switch (command.type) {
    case 'FoundVillage':
      if (state.founded) return { ok: false, error: { code: 'ALREADY_FOUNDED' } }
      return {
        ok: true,
        events: [{ type: 'VillageFounded', data: { name: command.name, at: now } }],
      }

    case 'UpgradeBuilding': {
      if (!state.founded) return { ok: false, error: { code: 'NOT_FOUNDED' } }
      const level = state.levels[command.building]
      if (level >= MAX_LEVEL) {
        return { ok: false, error: { code: 'MAX_LEVEL_REACHED', building: command.building } }
      }
      // Le stock est évalué à l'instant de la commande, production comprise.
      const current = accrue(state, now)
      const cost = upgradeCost(command.building, level)
      const missing = missingFor(current.stock, cost)
      if (Object.keys(missing).length > 0) {
        return { ok: false, error: { code: 'INSUFFICIENT_RESOURCES', missing } }
      }
      // Le coût est enregistré dans l'événement : si la règle de coût change
      // plus tard, les améliorations passées resteront rejouées à l'identique.
      return {
        ok: true,
        events: [
          {
            type: 'BuildingUpgraded',
            data: { building: command.building, toLevel: level + 1, cost, at: now },
          },
        ],
      }
    }

    case 'WithdrawResources': {
      // Idempotence : un mouvement déjà traité ne produit aucun nouvel événement.
      if (command.transferId in state.transfers) return { ok: true, events: [] }
      // Le stock est évalué à l'instant du prélèvement, production comprise. Un village
      // qui n'est pas fondé a un stock nul : le prélèvement y est simplement refusé.
      const missing = missingFor(accrue(state, now).stock, command.resources)
      const { transferId, resources } = command
      // Un stock insuffisant n'est pas une erreur, mais un refus enregistré comme un fait :
      // il pourra ainsi être répété à l'identique si la commande est reçue une seconde fois.
      return {
        ok: true,
        events:
          Object.keys(missing).length > 0
            ? [{ type: 'WithdrawalRefused', data: { transferId, missing, at: now } }]
            : [{ type: 'ResourcesWithdrawn', data: { transferId, resources, at: now } }],
      }
    }

    case 'DepositResources': {
      if (command.transferId in state.transfers) return { ok: true, events: [] }
      // Un versement ne peut être refusé que si le village n'existe pas : le demandeur ne verse
      // qu'à des villages dont il a déjà prélevé des ressources, ce cas révèle donc une anomalie.
      if (!state.founded) return { ok: false, error: { code: 'NOT_FOUNDED' } }
      return {
        ok: true,
        events: [
          {
            type: 'ResourcesDeposited',
            data: { transferId: command.transferId, resources: command.resources, at: now },
          },
        ],
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Vue : l'état présenté au joueur à un instant donné
// ---------------------------------------------------------------------------

export interface VillageView {
  name: string
  stock: Stock
  levels: Levels
  ratesPerMinute: Stock
  /** Coût de la prochaine amélioration de chaque bâtiment ; null au niveau maximal. */
  nextCosts: Record<Building, Partial<Stock> | null>
  /** Instant auquel la vue a été calculée. */
  asOf: number
}

export function toView(state: VillageState, now: number): VillageView {
  const current = accrue(state, now)
  const nextCosts = {} as Record<Building, Partial<Stock> | null>
  for (const building of BUILDINGS) {
    const level = current.levels[building]
    nextCosts[building] = level >= MAX_LEVEL ? null : upgradeCost(building, level)
  }
  return {
    name: current.name,
    stock: current.stock,
    levels: current.levels,
    ratesPerMinute: productionPerMinute(current.levels),
    nextCosts,
    asOf: now,
  }
}

/**
 * Stock extrapolé à partir d'une vue, à un instant ultérieur.
 * Utilisé par l'interface pour faire évoluer l'affichage sans interroger le serveur.
 */
export function stockAt(view: VillageView, at: number): Stock {
  const minutes = Math.max(0, at - view.asOf) / 60_000
  const stock = { ...view.stock }
  for (const resource of RESOURCES) stock[resource] += view.ratesPerMinute[resource] * minutes
  return stock
}
