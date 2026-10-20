import { describe, expect, it } from 'vitest'
import { winRate } from './simulation'

// Tests statistiques : chaque mesure porte sur les mêmes 200 graines, et donne donc
// toujours le même résultat. Les seuils laissent une marge autour des valeurs mesurées.
const SEEDS = 200

describe('Équilibre du Donjon (simulation de 200 expéditions)', () => {
  it("fait perdre nettement plus d'expéditions au niveau difficile qu'au niveau facile", () => {
    const setup = { players: 2, companions: 0, behaviour: 'active' } as const
    expect(winRate({ ...setup, difficulty: 'easy' }, SEEDS)).toBeGreaterThanOrEqual(85)
    expect(winRate({ ...setup, difficulty: 'hard' }, SEEDS)).toBeLessThanOrEqual(60)
  })

  it("laisse à un joueur accompagné d'un compagnon une chance réelle au niveau difficile", () => {
    const setup = { players: 1, companions: 1, behaviour: 'active', difficulty: 'hard' } as const
    expect(winRate(setup, SEEDS)).toBeGreaterThanOrEqual(50)
  })

  it('ne laisse jamais gagner une expédition dont les joueurs sont absents', () => {
    const setup = { players: 1, companions: 3, behaviour: 'absent', difficulty: 'easy' } as const
    expect(winRate(setup, SEEDS)).toBe(0)
  })
})
