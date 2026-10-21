import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { MarketService } from './application/market-service'
import { type OfferError, PublishOfferInput } from './contracts'

/** Code HTTP associé à chaque erreur métier. */
const STATUS: Record<OfferError['code'], 403 | 404 | 409> = {
  OFFER_NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  NOT_OPEN: 409,
  OWN_OFFER: 409,
  NOT_SELLER: 403,
  EXPIRED: 409,
  NOT_EXPIRED: 409,
}

/**
 * Sous-application Hono du module Marché, montée sur /api/market.
 * Le joueur est toujours celui que l'authentification a identifié : aucune route
 * n'accepte un identifiant de joueur dans la requête.
 */
export function createMarketApi(service: MarketService) {
  return (
    new Hono<AppEnv>()
      // Offres en cours du joueur, et offres ouvertes des autres joueurs.
      .get('/offers', async (c) => c.json(await service.list(c.var.userId)))

      // Publication d'une offre.
      .post('/offers', validateJson(PublishOfferInput), async (c) => {
        const { give, want } = c.req.valid('json')
        const player = { id: c.var.userId, name: c.var.userName }
        const { offerId, result } = await service.publish(player, give, want)
        return result.ok
          ? c.json({ offerId, view: result.view }, 201)
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Vue d'une offre.
      .get('/offers/:id', async (c) => {
        const view = await service.getView(c.req.param('id'), c.var.userId)
        return view
          ? c.json({ view })
          : c.json({ error: { code: 'OFFER_NOT_FOUND' as const } }, 404)
      })

      // Acceptation d'une offre par un autre joueur.
      .post('/offers/:id/accept', async (c) => {
        const player = { id: c.var.userId, name: c.var.userName }
        const result = await service.acceptOffer(c.req.param('id'), player)
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Retrait d'une offre par son vendeur.
      .post('/offers/:id/withdraw', async (c) => {
        const result = await service.withdrawOffer(c.req.param('id'), c.var.userId)
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })
  )
}

/** Type de la sous-application, utilisé par le client typé de l'interface. */
export type MarketApi = ReturnType<typeof createMarketApi>
