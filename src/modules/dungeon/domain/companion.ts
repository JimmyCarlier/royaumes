/**
 * Intelligence artificielle du compagnon : elle choisit son action comme le ferait un joueur,
 * au moment de la résolution de la manche. C'est une fonction pure, sans aucun tirage.
 */
import { COMPANION_HEAL_RATIO } from './content'
import type { Action, Hero, Monster } from './game'

/** Situation présentée au compagnon au début de la résolution de la manche. */
export interface CompanionContext {
  /** Héros encore debout, le compagnon compris. */
  heroes: Hero[]
  /** Monstres encore debout (jamais vide pendant un combat). */
  monsters: Monster[]
}

/** Part des points de vie restants d'un combattant. */
const healthRatio = (fighter: { hp: number; maxHp: number }) => fighter.hp / fighter.maxHp

/**
 * 1. Si un héros debout est en danger, le compagnon soigne le plus atteint d'entre eux.
 * 2. Sinon, il attaque le monstre qui a le moins de points de vie, pour l'abattre au plus vite.
 */
export function chooseCompanionAction({ heroes, monsters }: CompanionContext): Action {
  const endangered = heroes.filter((hero) => healthRatio(hero) < COMPANION_HEAL_RATIO)
  if (endangered.length > 0) {
    const mostWounded = endangered.reduce((a, b) => (healthRatio(b) < healthRatio(a) ? b : a))
    return { type: 'heal', target: mostWounded.id }
  }
  const weakest = monsters.reduce((a, b) => (b.hp < a.hp ? b : a))
  return { type: 'attack', target: weakest.id }
}
