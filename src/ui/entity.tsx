import { look } from './theme'

/**
 * Affiche une entité du jeu (ressource, bâtiment...) à partir du thème.
 * Le symbole est masqué aux lecteurs d'écran, qui lisent le libellé à la place.
 */
export function Entity({ kind, showLabel = false }: { kind: string; showLabel?: boolean }) {
  const { glyph, label } = look(kind)
  return (
    <span className="entity" title={label}>
      <span aria-hidden="true">{glyph}</span>
      {showLabel ? <span>{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  )
}
