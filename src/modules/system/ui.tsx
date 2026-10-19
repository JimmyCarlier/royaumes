'use client'
import { hc } from 'hono/client'
import { useEffect, useState } from 'react'
import type { SystemApi } from './api'

/**
 * Client HTTP typé, déduit de la sous-application Hono du module.
 * Seul le type de l'API est importé : aucun code serveur n'est embarqué
 * dans le navigateur.
 */
const client = hc<SystemApi>('/api/system')

/** Résultat de l'appel : en cours, réussi (avec l'heure du serveur) ou en échec. */
type Health = { status: 'loading' } | { status: 'ok'; time: string } | { status: 'error' }

/** Indique si l'API répond, en interrogeant la route de santé au chargement. */
export function HealthStatus() {
  const [health, setHealth] = useState<Health>({ status: 'loading' })

  useEffect(() => {
    client.health
      .$get()
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        // Le type de « data » est déduit de la route : { ok, time, uptime }.
        const data = await res.json()
        setHealth({ status: 'ok', time: data.time })
      })
      .catch(() => setHealth({ status: 'error' }))
  }, [])

  if (health.status === 'loading') return <p className="muted">Interrogation de l'API...</p>
  if (health.status === 'error') return <p className="error">L'API ne répond pas.</p>
  return (
    <p className="muted">
      API disponible - heure du serveur : {new Date(health.time).toLocaleTimeString('fr-FR')}
    </p>
  )
}
