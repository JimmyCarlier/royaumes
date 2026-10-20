import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import type { RankingReader } from './application/ranking-reader'
import { RANKING_SIZE } from './contracts'

/**
 * Sous-application Hono du module Classement, montée sur /api/ranking.
 * Elle ne comporte qu'une route de lecture : le module n'accepte aucune commande.
 */
export function createRankingApi(reader: RankingReader) {
  return new Hono<AppEnv>().get('/players', async (c) => c.json(await reader.top(RANKING_SIZE)))
}

/** Type de la sous-application, utilisé par le client typé de l'interface. */
export type RankingApi = ReturnType<typeof createRankingApi>
