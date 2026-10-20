import { headers } from 'next/headers'
import { currentUser } from '@/bootstrap/server'
import { VillageScreen } from '@/modules/realm/ui'

/**
 * Page du Village. Elle transmet au composant l'identifiant du joueur connecté,
 * qui sert à nommer le canal temps réel de son village.
 * La mise en page du groupe (jeu) garantit qu'un joueur est connecté.
 */
export default async function VillagePage() {
  const user = await currentUser(await headers())
  return <VillageScreen userId={user?.id ?? ''} />
}
