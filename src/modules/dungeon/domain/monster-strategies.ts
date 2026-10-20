/**
 * Stratégies des monstres : chaque niveau de difficulté fournit sa manière de choisir
 * le héros attaqué. Les règles du combat (rules.ts) appellent la stratégie du niveau
 * de l'expédition sans connaître son fonctionnement.
 */
import { DAMAGE_SPREAD, type Difficulty } from './content'
import type { Action, Hero, Monster } from './game'
import { pick, type Random } from './random'

/** Situation présentée à une stratégie, au moment où un monstre attaque. */
export interface TargetingContext {
  /** Monstre qui attaque. */
  monster: Monster
  /** Héros encore debout, avec leurs points de vie à cet instant de la résolution. */
  heroes: Hero[]
  /** Actions de la manche : les monstres jouent après les héros, et les connaissent. */
  actions: Record<string, Action>
  /** Générateur de la manche : une stratégie ne tire jamais au sort par un autre moyen. */
  random: Random
}

/** Port de stratégie : choisit le héros attaqué, parmi les héros debout (jamais vide). */
export type MonsterStrategy = (context: TargetingContext) => Hero

/** Héros qui a le moins de points de vie ; le premier dans l'ordre en cas d'égalité. */
const weakest = (heroes: Hero[]) =>
  heroes.reduce((chosen, hero) => (hero.hp < chosen.hp ? hero : chosen))

/** Niveau facile : chaque monstre attaque un héros tiré au hasard. */
export const easyStrategy: MonsterStrategy = ({ heroes, random }) => pick(random, heroes)

/**
 * Niveau difficile : les monstres concentrent leurs attaques.
 * 1. Un héros que le monstre fera tomber à coup sûr, même avec ses dégâts minimaux.
 * 2. Sinon, le plus faible des héros qui ne se défendent pas.
 * 3. Sinon, si tous se défendent, le plus faible de tous.
 */
export const hardStrategy: MonsterStrategy = ({ monster, heroes, actions }) => {
  const defends = (hero: Hero) => actions[hero.id]?.type === 'defend'
  const minimalDamage = (hero: Hero) => {
    const damage = Math.max(1, monster.attack - DAMAGE_SPREAD.monster)
    return defends(hero) ? Math.ceil(damage / 2) : damage
  }

  const doomed = heroes.filter((hero) => hero.hp <= minimalDamage(hero))
  if (doomed.length > 0) return weakest(doomed)

  const exposed = heroes.filter((hero) => !defends(hero))
  return weakest(exposed.length > 0 ? exposed : heroes)
}

/** Stratégie de chaque niveau de difficulté. */
export const MONSTER_STRATEGIES: Record<Difficulty, MonsterStrategy> = {
  easy: easyStrategy,
  hard: hardStrategy,
}
