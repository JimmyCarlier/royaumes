/**
 * Score collectif et classement des guildes (règle 10).
 * La contribution d'un joueur est tenue par la projection du module, à partir des événements
 * publiés par le Village et le Donjon ; le score d'une guilde est calculé ici, à la lecture,
 * à partir des contributions de ses membres actuels.
 */

/** Points rapportés par une amélioration de bâtiment. */
export const UPGRADE_POINTS = 10

/** Ce qu'un joueur a accompli dans les autres modules. */
export interface Contribution {
  /** Or rapporté par les expéditions gagnées. */
  gold: number
  /** Nombre d'améliorations de bâtiments de son village. */
  upgrades: number
}

/** Contribution d'un joueur qui n'a encore rien accompli. */
export const NO_CONTRIBUTION: Contribution = { gold: 0, upgrades: 0 }

/** Points d'une contribution : l'or, plus 10 points par amélioration. */
export const pointsOf = (contribution: Contribution) =>
  contribution.gold + contribution.upgrades * UPGRADE_POINTS

/** Score d'une guilde : la somme des points de ses membres. */
export const scoreOf = (contributions: Contribution[]) =>
  contributions.reduce((total, contribution) => total + pointsOf(contribution), 0)

/** Guilde à classer : son score est déjà calculé. */
export interface ScoredGuild {
  id: string
  name: string
  memberCount: number
  score: number
}

/** Ligne du classement des guildes. */
export interface GuildRankingEntry extends ScoredGuild {
  rank: number
}

/** Classe les guildes par score décroissant, puis par nom, dans l'ordre alphabétique français. */
export function rankGuilds(guilds: ScoredGuild[]): GuildRankingEntry[] {
  return [...guilds]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'fr'))
    .map((guild, index) => ({ ...guild, rank: index + 1 }))
}
