/**
 * Générateur pseudo-aléatoire à graine : la même graine produit toujours la même suite.
 * Contrairement à Math.random, un tirage peut ainsi être recalculé à l'identique.
 * Ce générateur n'est pas cryptographique : connaître la graine permet de prévoir les tirages.
 */

/** Générateur : chaque appel renvoie un nombre de l'intervalle [0, 1[. */
export type Random = () => number

/**
 * Crée un générateur à partir d'une graine, selon l'algorithme mulberry32.
 * Les opérations « >>> 0 » ramènent chaque résultat à un entier positif sur 32 bits.
 */
export function seeded(seed: number): Random {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Combine plusieurs entiers en une graine dérivée (hachage FNV-1a simplifié).
 * mix(graine, 3) donne toujours la même graine, et une graine différente de mix(graine, 4).
 */
export function mix(...parts: number[]): number {
  let hash = 0x811c9dc5
  for (const part of parts) hash = Math.imul(hash ^ (part >>> 0), 0x01000193) >>> 0
  return hash
}

/** Entier tiré au sort entre min et max, bornes comprises. */
export const randomInt = (random: Random, min: number, max: number) =>
  min + Math.floor(random() * (max - min + 1))

/** Élément tiré au sort dans une liste non vide. */
export const pick = <T>(random: Random, items: readonly T[]): T =>
  items[Math.floor(random() * items.length)]
