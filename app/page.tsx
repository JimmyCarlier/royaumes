import Link from 'next/link'
import { HealthStatus } from '@/modules/system/ui'

/**
 * Page d'accueil provisoire.
 * Elle sera remplacée lorsque l'authentification sera en place.
 */
export default function Home() {
  return (
    <>
      <h1>Royaumes</h1>
      <p className="muted">Le socle du projet est en place.</p>
      <HealthStatus />
      <p>
        <Link href="/village">Accéder au village</Link>
      </p>
    </>
  )
}
