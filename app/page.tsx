import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { currentUser } from '@/bootstrap/server'

// La redirection dépend de la session : la page est évaluée à chaque requête.
export const dynamic = 'force-dynamic'

/** Page d'accueil : oriente vers le village si un joueur est connecté, vers la connexion sinon. */
export default async function Home() {
  const user = await currentUser(await headers())
  redirect(user ? '/village' : '/login')
}
