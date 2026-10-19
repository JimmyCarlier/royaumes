import { HealthStatus } from '@/modules/system/ui'

/**
 * Page d'accueil provisoire.
 * Elle sera remplacée lorsque l'authentification et le module Village
 * seront en place.
 */
export default function Home() {
  return (
    <>
      <h1>Royaumes</h1>
      <p className="muted">Le socle du projet est en place.</p>
      <HealthStatus />
    </>
  )
}
