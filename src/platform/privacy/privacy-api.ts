import { Hono } from 'hono'
import type { AppEnv } from '../http/types'
import type { PrivacyService } from './privacy'

/**
 * Sous-application des droits du joueur connecté, montée sur /api/account.
 * Comme ailleurs, le joueur est celui que l'authentification a identifié : personne
 * ne peut exporter ni effacer les données d'un autre joueur.
 */
export function createPrivacyApi(service: PrivacyService) {
  return (
    new Hono<AppEnv>()
      // Droit d'accès et à la portabilité : un fichier JSON, téléchargé par le navigateur.
      .get('/export', async (c) => {
        const data = await service.exportData(c.var.userId)
        c.header('Content-Disposition', 'attachment; filename="royaumes-mes-donnees.json"')
        return c.json(data)
      })

      // Droit à l'effacement : suppression du compte et de toutes les données personnelles.
      .delete('/', async (c) => {
        const result = await service.erase(c.var.userId)
        return c.json(result)
      })
  )
}
