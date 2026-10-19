import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { VillageService } from './application/village-service'
import { type DomainError, FoundVillageInput, UpgradeBuildingInput } from './contracts'

/** Code HTTP associé à chaque erreur métier. */
const STATUS: Record<DomainError['code'], 404 | 409 | 422> = {
  NOT_FOUNDED: 404,
  ALREADY_FOUNDED: 409,
  MAX_LEVEL_REACHED: 409,
  INSUFFICIENT_RESOURCES: 422,
}

/**
 * Sous-application Hono du module Village, montée sur /api/realm.
 * Chaque route traduit une requête HTTP en appel au service, puis le résultat
 * en réponse HTTP. Aucune règle métier n'est écrite ici.
 */
export function createRealmApi(service: VillageService) {
  return new Hono<AppEnv>()
    .get('/village', async (c) => c.json({ view: await service.getView(c.var.userId) }))

    .post('/village', validateJson(FoundVillageInput), async (c) => {
      const result = await service.execute(c.var.userId, {
        type: 'FoundVillage',
        name: c.req.valid('json').name,
      })
      return result.ok
        ? c.json({ view: result.view }, 201)
        : c.json({ error: result.error }, STATUS[result.error.code])
    })

    .post('/village/upgrade', validateJson(UpgradeBuildingInput), async (c) => {
      const result = await service.execute(c.var.userId, {
        type: 'UpgradeBuilding',
        building: c.req.valid('json').building,
      })
      return result.ok
        ? c.json({ view: result.view })
        : c.json({ error: result.error }, STATUS[result.error.code])
    })
}

/** Type de la sous-application, utilisé par le client typé de l'interface. */
export type RealmApi = ReturnType<typeof createRealmApi>
