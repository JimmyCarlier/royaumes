/**
 * Entrée publique « partagée » du module Village : utilisable par le serveur
 * comme par l'interface. Elle ne contient que des types, des schémas de
 * validation et des fonctions pures, sans aucun code propre au serveur.
 */
import { z } from 'zod'
import { BUILDINGS, type Stock } from './domain/catalog'

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

/** Préfixe commun aux noms des flux, et des canaux, de tous les villages. */
export const VILLAGE_CHANNEL_PREFIX = 'village-'

/**
 * Nom du canal temps réel du village d'un joueur.
 * Il est identique au nom du flux qui contient ses événements dans le journal :
 * écouter ce canal, c'est recevoir les événements de ce flux.
 */
export const villageChannel = (userId: string) => `${VILLAGE_CHANNEL_PREFIX}${userId}`

// ---------------------------------------------------------------------------
// Messages traités par le Village (TD9) : son langage publié pour les mouvements de ressources
// ---------------------------------------------------------------------------

/** Sujets des messages que le Village sait traiter. */
export const REALM_TOPICS = {
  /** Prélever des ressources dans un village ; le refus est possible. */
  withdraw: 'realm.withdraw',
  /** Verser des ressources à un village ; le versement ne peut pas être refusé. */
  deposit: 'realm.deposit',
} as const

/** Quantité d'une ressource dans un mouvement : un entier strictement positif. */
const Amount = z.number().int().positive()

/** Quantités de ressources d'un mouvement : au moins une ressource, aucune autre clé. */
export const ResourceAmounts = z
  .object({ wood: Amount.optional(), stone: Amount.optional(), gold: Amount.optional() })
  .strict()
  .refine((amounts) => Object.keys(amounts).length > 0, 'Au moins une ressource est attendue')

/** Contenu d'un message de prélèvement ou de versement. */
export const TransferRequest = z.object({
  /** Identifiant du mouvement, choisi par le demandeur : un doublon porte le même identifiant. */
  transferId: z.string().min(1),
  /** Joueur dont le village est concerné. */
  playerId: z.string().min(1),
  resources: ResourceAmounts,
  /** Sujet du message de réponse ; absent si le demandeur n'attend aucune réponse. */
  replyTo: z.string().min(1).optional(),
})
export type TransferRequest = z.infer<typeof TransferRequest>

/** Contenu du message de réponse envoyé par le Village au sujet indiqué par replyTo. */
export interface TransferResult {
  transferId: string
  outcome: 'withdrawn' | 'refused' | 'deposited'
  /** Quantités manquantes, en cas de refus. */
  missing?: Partial<Stock>
}
