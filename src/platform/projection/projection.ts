import { asc, eq, gt } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { StoredEvent } from '../event-store/event-store'
import { events } from '../event-store/schema'
import { projections } from './schema'

/** Transaction de base de données, dans laquelle une projection met à jour ses tables. */
export type DbTransaction = Parameters<Parameters<Db['transaction']>[0]>[0]

/** Projection : construit un modèle de lecture à partir des événements du journal. */
export interface Projection {
  /** Nom unique, qui identifie le point de reprise de la projection. */
  name: string
  /** Types d'événements traités ; les autres sont ignorés, mais le point de reprise avance. */
  eventTypes: string[]
  /**
   * Applique un événement aux tables du modèle de lecture.
   * Toutes les écritures passent par tx : elles sont validées ou annulées
   * en même temps que le nouveau point de reprise.
   */
  apply(event: StoredEvent, tx: DbTransaction): Promise<void>
}

export interface ProjectionRunnerOptions {
  /**
   * Délai, en millisecondes, pendant lequel une position manquante est considérée comme
   * une insertion encore en cours : la projection s'arrête devant elle et l'attend.
   */
  gapGraceMs?: number
  /** Nombre d'événements lus à la fois. */
  batchSize?: number
  /** Horloge, remplacée dans les tests pour simuler l'écoulement du temps. */
  now?: () => number
}

/** Convertit une ligne du journal en événement enregistré. */
const toStored = (row: typeof events.$inferSelect): StoredEvent => ({
  position: row.position,
  stream: row.stream,
  version: row.version,
  type: row.type,
  data: row.data as Record<string, unknown>,
  occurredAt: row.occurredAt,
})

/**
 * Moteur des projections : rattrape le journal pour une projection donnée,
 * en appliquant chaque événement exactement une fois.
 */
export function createProjectionRunner(
  db: Db,
  { gapGraceMs = 5_000, batchSize = 200, now = () => Date.now() }: ProjectionRunnerOptions = {},
) {
  /**
   * Applique à la projection les événements enregistrés depuis son point de reprise,
   * et renvoie le nombre d'événements appliqués. Tout a lieu dans une seule transaction :
   * les tables et le point de reprise sont mis à jour ensemble, ou pas du tout.
   */
  async function catchUp(projection: Projection): Promise<number> {
    return db.transaction(async (tx) => {
      // 1. Le point de reprise est créé au premier rattrapage, puis verrouillé jusqu'à la fin
      //    de la transaction : un second rattrapage simultané attend celui-ci.
      await tx.insert(projections).values({ name: projection.name }).onConflictDoNothing()
      const [checkpoint] = await tx
        .select()
        .from(projections)
        .where(eq(projections.name, projection.name))
        .for('update')

      let position = checkpoint.position
      let applied = 0

      // 2. Les événements postérieurs sont lus par lots, dans l'ordre global du journal.
      //    Tous les types sont lus : un écart de positions ne peut être détecté que sur la suite
      //    complète des positions.
      for (;;) {
        const rows = await tx
          .select()
          .from(events)
          .where(gt(events.position, position))
          .orderBy(asc(events.position))
          .limit(batchSize)

        let blocked = false
        for (const row of rows) {
          // 3. Une position manque avant cet événement. Si l'événement est récent, l'insertion
          //    manquante est peut-être encore en cours : la projection s'arrête et l'attendra.
          //    S'il est ancien, la position manquante correspond à une insertion annulée.
          const gap = row.position !== position + 1
          if (gap && now() - row.occurredAt.getTime() < gapGraceMs) {
            blocked = true
            break
          }
          if (projection.eventTypes.includes(row.type)) {
            await projection.apply(toStored(row), tx)
            applied++
          }
          position = row.position
        }
        if (blocked || rows.length < batchSize) break
      }

      // 4. Le nouveau point de reprise est enregistré dans la même transaction que les tables.
      await tx
        .update(projections)
        .set({ position, updatedAt: new Date() })
        .where(eq(projections.name, projection.name))
      return applied
    })
  }

  /** Position du point de reprise d'une projection ; 0 si elle n'a jamais été rattrapée. */
  async function positionOf(name: string): Promise<number> {
    const [row] = await db.select().from(projections).where(eq(projections.name, name))
    return row?.position ?? 0
  }

  return { catchUp, positionOf }
}

/** Type du moteur des projections, déduit de sa fabrique. */
export type ProjectionRunner = ReturnType<typeof createProjectionRunner>
