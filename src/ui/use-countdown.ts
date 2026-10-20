'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * Compte à rebours jusqu'à une échéance, exprimée en millisecondes.
 * Renvoie le nombre de secondes restantes, ou null en l'absence d'échéance.
 * Une fois l'échéance atteinte, onExpired est appelée chaque seconde, jusqu'à ce que
 * l'échéance change : l'appel est ainsi renouvelé si le serveur ne l'a pas encore constatée.
 */
export function useCountdown(deadline: number | null, onExpired: () => void): number | null {
  const [now, setNow] = useState(() => Date.now())

  // Comme dans useChannel, la fonction est conservée dans une référence : la modifier
  // à chaque rendu ne doit pas relancer le minuteur.
  const handler = useRef(onExpired)
  handler.current = onExpired

  useEffect(() => {
    if (deadline === null) return
    const timer = setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= deadline) handler.current()
    }, 1000)
    return () => clearInterval(timer)
  }, [deadline])

  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000))
}
