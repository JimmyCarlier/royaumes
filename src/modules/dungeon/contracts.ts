/**
 * Entrée publique « partagée » du module Donjon : utilisable par le serveur
 * comme par l'interface. Elle ne contient que des types, des constantes,
 * des schémas de validation et des fonctions pures.
 */
import { z } from 'zod'

export type { MonsterKind } from './domain/content'
export { MAX_HEROES, MONSTERS, ROUND_MS } from './domain/content'
export type { Action, Effect, Monster, Phase, Room } from './domain/game'
export type { OpenGame } from './domain/lobby'
export type { GameError } from './domain/rules'
export type { GameView, HeroView } from './domain/view'

/** Corps attendu pour choisir une action : la manche visée et l'action elle-même. */
export const SubmitActionInput = z.object({
  round: z.number().int().positive(),
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('attack'), target: z.string().min(1) }),
    z.object({ type: z.literal('defend') }),
    z.object({ type: z.literal('heal'), target: z.string().min(1) }),
  ]),
})

/** Préfixe commun aux noms des flux, et des canaux, de toutes les expéditions. */
export const GAME_CHANNEL_PREFIX = 'dungeon-'

/**
 * Nom du canal temps réel d'une expédition, identique au nom du flux
 * qui contient ses événements dans le journal.
 */
export const gameChannel = (gameId: string) => `${GAME_CHANNEL_PREFIX}${gameId}`
