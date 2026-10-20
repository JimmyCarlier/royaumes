import { headers } from 'next/headers'
import { currentUser } from '@/bootstrap/server'
import { DungeonGame } from '@/modules/dungeon/ui'

/**
 * Page d'une expédition. Son adresse contient l'identifiant de l'expédition :
 * il suffit de la communiquer à d'autres joueurs pour qu'ils la rejoignent.
 */
export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await currentUser(await headers())
  return <DungeonGame gameId={id} userId={user?.id ?? ''} />
}
