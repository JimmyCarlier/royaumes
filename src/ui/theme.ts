/**
 * Couche de thème : l'apparence de chaque entité du jeu est définie ici, et nulle part ailleurs.
 * Les composants n'affichent jamais un symbole en dur : ils demandent l'apparence
 * d'une entité par son identifiant. Changer de direction artistique, par exemple
 * remplacer les symboles par des images, ne demande de modifier que ce fichier.
 */
export interface Look {
  /** Symbole affiché. */
  glyph: string
  /** Libellé en français, lu par les lecteurs d'écran et affiché au survol. */
  label: string
}

export const theme: Record<string, Look> = {
  village: { glyph: '🏰', label: 'Village' },
  wood: { glyph: '🪵', label: 'Bois' },
  stone: { glyph: '🪨', label: 'Pierre' },
  gold: { glyph: '🪙', label: 'Or' },
  sawmill: { glyph: '🪚', label: 'Scierie' },
  quarry: { glyph: '⛏️', label: 'Carrière' },
  mine: { glyph: '⚒️', label: 'Mine' },
  dungeon: { glyph: '⚔️', label: 'Donjon' },
  hero: { glyph: '🛡️', label: 'Héros' },
  goblin: { glyph: '👺', label: 'Gobelin' },
  skeleton: { glyph: '💀', label: 'Squelette' },
  troll: { glyph: '👹', label: 'Troll' },
  door: { glyph: '🚪', label: 'Porte' },
}

/** Apparence d'une entité ; une apparence neutre si l'entité n'est pas décrite. */
export const look = (kind: string): Look => theme[kind] ?? { glyph: '?', label: kind }
