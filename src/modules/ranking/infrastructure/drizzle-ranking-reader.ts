import { asc, desc } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { RankingReader } from '../application/ranking-reader'
import { rankingProjection } from './ranking-projection'
import { players } from './schema'

/** Nom affiché d'un joueur : son nom s'il est connu, sinon celui de son village. */
const labelOf = (row: typeof players.$inferSelect) =>
  row.name ?? (row.village ? `Seigneur de ${row.village}` : 'Joueur inconnu')

/** Adaptateur du port RankingReader, fondé sur la table du classement. */
export function createDrizzleRankingReader(db: Db, projections: ProjectionRunner): RankingReader {
  return {
    async top(limit) {
      // Rattrapage à la lecture : la table est mise à jour avant d'être lue.
      await projections.catchUp(rankingProjection)

      const rows = await db
        .select()
        .from(players)
        .orderBy(
          desc(players.gamesWon),
          desc(players.gold),
          desc(players.upgrades),
          asc(players.playerId),
        )
        .limit(limit)

      return rows.map((row, index) => ({
        rank: index + 1,
        playerId: row.playerId,
        label: labelOf(row),
        gamesPlayed: row.gamesPlayed,
        gamesWon: row.gamesWon,
        gold: row.gold,
        upgrades: row.upgrades,
      }))
    },
  }
}
