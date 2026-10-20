import { describe, expect, it } from 'vitest'
import { mix, randomInt, seeded } from './random'

/** Les n premiers nombres d'un générateur. */
const draws = (seed: number, n: number) => Array.from({ length: n }, seeded(seed))

describe('Générateur à graine', () => {
  it('produit toujours la même suite pour la même graine', () => {
    expect(draws(42, 5)).toEqual(draws(42, 5))
  })

  it('produit des suites différentes pour des graines différentes', () => {
    expect(draws(42, 5)).not.toEqual(draws(43, 5))
  })

  it('dérive des graines stables et distinctes', () => {
    expect(mix(42, 1, 3)).toBe(mix(42, 1, 3))
    expect(mix(42, 1, 3)).not.toBe(mix(42, 1, 4))
    expect(mix(42, 0)).not.toBe(mix(43, 0))
  })

  it('tire des entiers compris entre les deux bornes, chacune pouvant être atteinte', () => {
    const random = seeded(7)
    const values = Array.from({ length: 1000 }, () => randomInt(random, 4, 8))
    expect(Math.min(...values)).toBe(4)
    expect(Math.max(...values)).toBe(8)
    expect(values.every(Number.isInteger)).toBe(true)
  })
})
