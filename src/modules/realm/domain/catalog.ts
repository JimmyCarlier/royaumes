/**
 * Contenu du Village : ressources, bâtiments et valeurs d'équilibrage.
 * Ce fichier ne contient que des données. Les règles qui les utilisent
 * se trouvent dans village.ts : rééquilibrer le jeu ne demande de modifier qu'ici.
 */

/** Ressources du jeu. « as const » permet d'en déduire un type union. */
export const RESOURCES = ['wood', 'stone', 'gold'] as const
export type Resource = (typeof RESOURCES)[number]

/** Quantité de chaque ressource. */
export type Stock = Record<Resource, number>

/** Bâtiments du village. */
export const BUILDINGS = ['sawmill', 'quarry', 'mine'] as const
export type Building = (typeof BUILDINGS)[number]

/** Niveau de chaque bâtiment (0 : non construit). */
export type Levels = Record<Building, number>

/** Niveau maximal d'un bâtiment. */
export const MAX_LEVEL = 10

/**
 * Pour chaque bâtiment : la ressource produite, la production par minute
 * et par niveau, et le coût de la première amélioration.
 */
export const CATALOG: Record<
  Building,
  { produces: Resource; perMinute: number; baseCost: Partial<Stock> }
> = {
  sawmill: { produces: 'wood', perMinute: 10, baseCost: { wood: 40, stone: 20 } },
  quarry: { produces: 'stone', perMinute: 6, baseCost: { wood: 60, stone: 10 } },
  mine: { produces: 'gold', perMinute: 2, baseCost: { wood: 80, stone: 60 } },
}

/** Exposant de la règle de coût : coût de base × (niveau + 1) ^ COST_EXPONENT. */
export const COST_EXPONENT = 1.3

/** Stock et niveaux d'un village au moment de sa fondation. */
export const STARTING_STOCK: Stock = { wood: 100, stone: 50, gold: 0 }
export const STARTING_LEVELS: Levels = { sawmill: 1, quarry: 1, mine: 0 }
