/**
 * Entrée publique « partagée » du module Village : utilisable par le serveur
 * comme par l'interface. Elle ne contient que des types, des schémas de
 * validation et des fonctions pures, sans aucun code propre au serveur.
 */
import { z } from 'zod'
import { BUILDINGS } from './domain/catalog'

export type { Building, Resource, Stock } from './domain/catalog'
export { BUILDINGS, MAX_LEVEL, RESOURCES } from './domain/catalog'
export type { DomainError, VillageView } from './domain/village'
export { stockAt } from './domain/village'

/** Corps attendu pour fonder un village. */
export const FoundVillageInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Le nom doit comporter au moins 2 caractères')
    .max(30, 'Le nom doit comporter au plus 30 caractères'),
})

/** Corps attendu pour améliorer un bâtiment : un bâtiment du catalogue. */
export const UpgradeBuildingInput = z.object({
  building: z.enum(BUILDINGS),
})
