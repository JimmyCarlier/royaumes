import { describe, expect, it } from 'vitest'
import { pointsOf, rankGuilds, scoreOf, UPGRADE_POINTS } from './score'

describe('Règle 10 - score et classement des guildes', () => {
  it('compte l’or des expéditions, plus 10 points par amélioration', () => {
    expect(UPGRADE_POINTS).toBe(10)
    expect(pointsOf({ gold: 40, upgrades: 3 })).toBe(70)
  })

  it('additionne les points des membres', () => {
    expect(
      scoreOf([
        { gold: 40, upgrades: 0 },
        { gold: 0, upgrades: 2 },
      ]),
    ).toBe(60)
    expect(scoreOf([])).toBe(0)
  })

  it('classe par score décroissant, puis par nom dans l’ordre alphabétique', () => {
    const ranking = rankGuilds([
      { id: 'b', name: 'Écu d’Or', memberCount: 2, score: 50 },
      { id: 'c', name: 'Les Ours', memberCount: 1, score: 90 },
      { id: 'a', name: 'Dragons', memberCount: 3, score: 50 },
    ])
    expect(ranking.map((entry) => [entry.rank, entry.name])).toEqual([
      [1, 'Les Ours'],
      [2, 'Dragons'],
      [3, 'Écu d’Or'],
    ])
  })
})
