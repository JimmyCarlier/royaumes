/**
 * Contenu du Donjon : monstres, salles et valeurs d'équilibrage.
 * Ce fichier ne contient que des données. Les règles qui les utilisent se trouvent
 * dans rules.ts : rééquilibrer le jeu ne demande de modifier qu'ici.
 */

/** Niveaux de difficulté d'une expédition. « as const » permet d'en déduire un type union. */
export const DIFFICULTIES = ['easy', 'hard'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

/** Niveau attribué aux expéditions enregistrées avant l'introduction des niveaux (TD7). */
export const DEFAULT_DIFFICULTY: Difficulty = 'easy'

/** Nombre maximal de héros dans une expédition. */
export const MAX_HEROES = 4

/** Nombre de salles du donjon ; la dernière abrite toujours le troll. */
export const DUNGEON_LENGTH = 6

/** Durée maximale d'une manche de combat, en millisecondes. */
export const ROUND_MS = 30_000

/** Points de vie rendus par un soin. */
export const HEAL_AMOUNT = 8

/** Caractéristiques de départ de chaque héros. */
export const HERO = { hp: 30, attack: 6 }

/** Écart maximal, en plus ou en moins, entre les dégâts infligés et l'attaque. */
export const DAMAGE_SPREAD = { hero: 2, monster: 1 }

/**
 * Monstres du jeu. « as const » permet d'en déduire un type union.
 * Les points de vie du monstre de la dernière salle (BOSS) s'entendent par héros :
 * le troll a 20 points de vie face à un héros seul, 80 face à quatre héros.
 */
export const MONSTERS = {
  goblin: { name: 'Gobelin', hp: 10, attack: 3 },
  skeleton: { name: 'Squelette', hp: 14, attack: 4 },
  troll: { name: 'Troll', hp: 20, attack: 7 },
} as const

export type MonsterKind = keyof typeof MONSTERS

/** Monstres qui peuvent peupler les salles ordinaires. */
export const COMMON_MONSTERS: MonsterKind[] = ['goblin', 'skeleton']

/** Monstre de la dernière salle. */
export const BOSS: MonsterKind = 'troll'

/**
 * Probabilité de chaque sorte de salle ordinaire (leur somme vaut 1).
 * Le nombre de monstres d'une salle est compris entre 1 et le nombre de héros, sans dépasser 3.
 */
export const ROOM_ODDS = { empty: 0.3, treasure: 0.3, monsters: 0.4 }

/** Or contenu dans un trésor : minimum et maximum. */
export const TREASURE_GOLD = { min: 10, max: 30 }

/** Durée pendant laquelle une expédition qui n'a pas été lancée reste proposée, en millisecondes. */
export const OPEN_GAME_MS = 60 * 60_000
