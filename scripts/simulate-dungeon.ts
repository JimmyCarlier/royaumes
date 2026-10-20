/**
 * Mesure de l'équilibre du Donjon : part des expéditions gagnées, en pourcentage,
 * selon le niveau de difficulté, la composition de l'expédition et le comportement des joueurs.
 * Exécution : pnpm exec tsx scripts/simulate-dungeon.ts
 */
import { winRate } from '@/modules/dungeon'

/** Nombre d'expéditions simulées pour chaque mesure. */
const SEEDS = 500

/** Compositions mesurées : nombre de joueurs et nombre de compagnons. */
const PARTIES = [
  [1, 0],
  [1, 1],
  [1, 3],
  [2, 0],
  [2, 2],
  [4, 0],
] as const

const rows = []
for (const behaviour of ['active', 'absent'] as const) {
  for (const [players, companions] of PARTIES) {
    const setup = { players, companions, behaviour }
    rows.push({
      joueurs: behaviour === 'active' ? 'actifs' : 'absents',
      composition: `${players} joueur(s), ${companions} compagnon(s)`,
      facile: `${winRate({ ...setup, difficulty: 'easy' }, SEEDS)} %`,
      difficile: `${winRate({ ...setup, difficulty: 'hard' }, SEEDS)} %`,
    })
  }
}
console.table(rows)
