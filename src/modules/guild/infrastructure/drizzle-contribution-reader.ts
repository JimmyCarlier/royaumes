import { inArray } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { ContributionReader } from '../application/contribution-reader'
import type { Contribution } from '../domain/score'
import { contributionsProjection } from './contributions-projection'
import { contributions } from './schema'

/** Adaptateur du port ContributionReader, fondé sur la table guild.contributions. */
export function createDrizzleContributionReader(
  db: Db,
  projections: ProjectionRunner,
): ContributionReader {
  return {
    async of(playerIds) {
      // Rattrapage à la lecture, comme le Classement : la table est mise à jour avant d'être lue.
      await projections.catchUp(contributionsProjection)
      if (playerIds.length === 0) return {}
      const rows = await db
        .select()
        .from(contributions)
        .where(inArray(contributions.playerId, playerIds))
      const result: Record<string, Contribution> = {}
      for (const row of rows) result[row.playerId] = { gold: row.gold, upgrades: row.upgrades }
      return result
    },
  }
}
