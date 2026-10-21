import { and, desc, eq, gt, or } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { OffersReader } from '../application/offers-reader'
import type { OfferSummary } from '../contracts'
import type { Amounts } from '../domain/offer'
import { offersProjection } from './offers-projection'
import { offers } from './schema'

/** Nombre maximal d'offres présentées. */
const LIST_SIZE = 50

/** Adaptateur du port OffersReader, fondé sur la table des offres en cours. */
export function createDrizzleOffersReader(db: Db, projections: ProjectionRunner): OffersReader {
  return {
    async list(viewerId, now) {
      await projections.catchUp(offersProjection)
      // Comme au TD8 : la position est lue avant la table, qui reflète au moins cette position.
      const position = await projections.positionOf(offersProjection.name)

      // Les offres en cours du joueur, quel que soit leur état, et les offres ouvertes
      // et non échues des autres joueurs.
      const rows = await db
        .select()
        .from(offers)
        .where(
          or(
            eq(offers.sellerId, viewerId),
            and(eq(offers.status, 'open'), gt(offers.expiresAt, now)),
          ),
        )
        .orderBy(desc(offers.publishedAt))
        .limit(LIST_SIZE)

      return {
        position,
        offers: rows.map(
          (row): OfferSummary => ({
            offerId: row.offerId,
            sellerName: row.sellerName,
            give: row.give as Amounts,
            want: row.want as Amounts,
            status: row.status as OfferSummary['status'],
            mine: row.sellerId === viewerId,
            expiresAt: row.expiresAt,
          }),
        ),
      }
    },
  }
}
