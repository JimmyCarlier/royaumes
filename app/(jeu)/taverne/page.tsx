import { redirect } from 'next/navigation'

/** Conserve l'ancienne adresse française de la page. */
export default function TavernePage() {
  redirect('/tavern')
}
