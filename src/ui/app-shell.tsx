'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { authClient } from '@/platform/auth/client'
import { Entity } from './entity'

/** Liens de navigation : chaque module ajouté au jeu y reçoit une entrée. */
export const NAV = [
  { href: '/village', kind: 'village', label: 'Village' },
  { href: '/dungeon', kind: 'dungeon', label: 'Donjon' },
  { href: '/ranking', kind: 'ranking', label: 'Classement' },
]

/** Cadre de l'espace de jeu : navigation, nom du joueur et déconnexion. */
export function AppShell({ userName, children }: { userName: string; children: ReactNode }) {
  const pathname = usePathname()

  async function signOut() {
    // La session est supprimée côté serveur, puis la page est entièrement rechargée,
    // afin qu'aucun état de la session précédente ne subsiste dans le navigateur.
    await authClient.signOut()
    window.location.href = '/login'
  }

  return (
    <>
      <nav className="nav" aria-label="Navigation principale">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
          >
            <Entity kind={item.kind} /> {item.label}
          </Link>
        ))}
        <span className="muted" style={{ marginLeft: 'auto' }}>
          {userName}
        </span>
        <button className="link" type="button" onClick={signOut}>
          Déconnexion
        </button>
      </nav>
      {children}
    </>
  )
}
