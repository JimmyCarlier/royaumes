import { and, desc, gt, lt } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { OpenGamesReader } from '../application/open-games-reader'
import { MAX_HEROES, OPEN_GAME_MS } from '../domain/content'
import { openGamesProjection } from './open-games-projection'
import { openGames } from './schema'

/** Adaptateur du port OpenGamesReader, fondé sur la table des expéditions ouvertes. */
export function createDrizzleOpenGamesReader(
  db: Db,
  projections: ProjectionRunner,
): OpenGamesReader {
  return {
    async list(now) {
      // Rattrapage à la lecture, comme pour le Classement.
      await projections.catchUp(openGamesProjection)

      // Les règles de la liste s'appliquent à la lecture : une expédition complète, ou ouverte
      // depuis plus d'une heure, reste dans la table mais n'est pas proposée.
      return db
        .select({
          gameId: openGames.gameId,
          hostName: openGames.hostName,
          heroCount: openGames.heroCount,
          createdAt: openGames.createdAt,
        })
        .from(openGames)
        .where(
          and(lt(openGames.heroCount, MAX_HEROES), gt(openGames.createdAt, now - OPEN_GAME_MS)),
        )
        .orderBy(desc(openGames.createdAt))
    },
  }
}
