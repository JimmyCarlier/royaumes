'use client'
import { useEffect, useRef, useState } from 'react'

/** État de la connexion à un canal, affiché par l'interface. */
export type ChannelStatus = 'connecting' | 'open' | 'reconnecting'

/** Événement reçu sur un canal : un événement du journal, sous sa forme générique. */
export interface ChannelEvent {
  /** Position dans le journal, tous flux confondus. */
  position: number
  stream: string
  version: number
  type: string
  data: Record<string, unknown>
}

/**
 * Hook React d'abonnement à un canal temps réel.
 * L'interface EventSource du navigateur se reconnecte d'elle-même après une interruption,
 * et renvoie l'en-tête Last-Event-ID : la reprise ne demande aucun code ici.
 * Le cookie de session est joint automatiquement, puisque le flux est sur le même domaine.
 */
export function useChannel(channel: string | null, onEvent: (event: ChannelEvent) => void) {
  const [status, setStatus] = useState<ChannelStatus>('connecting')

  // La fonction de rappel est conservée dans une référence : la modifier, à chaque rendu
  // du composant, ne doit pas fermer et rouvrir la connexion.
  const handler = useRef(onEvent)
  handler.current = onEvent

  useEffect(() => {
    if (!channel) return
    const source = new EventSource(`/api/stream/${encodeURIComponent(channel)}`)

    // Le message « ready » confirme l'ouverture du flux, y compris après une reconnexion.
    source.addEventListener('ready', () => setStatus('open'))
    source.addEventListener('domain-event', (message) => {
      handler.current(JSON.parse((message as MessageEvent<string>).data))
    })
    // Une erreur signale une interruption : le navigateur va tenter de se reconnecter.
    source.onerror = () => setStatus('reconnecting')

    // Le flux est fermé lorsque le composant disparaît ou que le canal change.
    return () => source.close()
  }, [channel])

  return status
}
