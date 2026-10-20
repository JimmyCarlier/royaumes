import { headers } from 'next/headers'
import { currentUser } from '@/bootstrap/server'
import { RankingScreen } from '@/modules/ranking/ui'

/** Page du Classement. Le joueur connecté y est mis en évidence. */
export default async function RankingPage() {
  const user = await currentUser(await headers())
  return <RankingScreen userId={user?.id ?? ''} />
}
