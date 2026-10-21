import { asc, eq, gt, max } from 'drizzle-orm'
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
  /**
   * Version de la projection. Elle est augmentée à chaque modification qui change le contenu
   * de ses tables : nouvelle colonne, correction d'une règle. Une version différente de celle
   * qui a construit les tables provoque leur reconstruction.
   */
  version: number
  /** Types d'événements traités ; les autres sont ignorés, mais le point de reprise avance. */
  eventTypes: string[]
  /**
   * Applique un événement aux tables du modèle de lecture.
   * Toutes les écritures passent par tx : elles sont validées ou annulées
   * en même temps que le nouveau point de reprise.
   */
  apply(event: StoredEvent, tx: DbTransaction): Promise<void>
  /** Vide les tables du modèle de lecture, avant leur reconstruction à partir du journal. */
  reset(tx: DbTransaction): Promise<void>
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
   * Crée au besoin le point de reprise de la projection, puis le verrouille jusqu'à la fin
   * de la transaction : un second rattrapage simultané attend celui-ci.
   * Une projection nouvelle reçoit d'emblée sa version : elle n'a rien à reconstruire.
   */
  async function lock(tx: DbTransaction, projection: Projection) {
    await tx
      .insert(projections)
      .values({ name: projection.name, version: projection.version })
      .onConflictDoNothing()
    const [checkpoint] = await tx
      .select()
      .from(projections)
      .where(eq(projections.name, projection.name))
      .for('update')
    return checkpoint
  }

  /**
   * Applique à la projection les événements postérieurs à la position from, puis enregistre
   * le nouveau point de reprise et la version de la projection. Renvoie le nombre
   * d'événements appliqués.
   */
  async function advance(tx: DbTransaction, projection: Projection, from: number) {
    let position = from
    let applied = 0

    // Les événements postérieurs sont lus par lots, dans l'ordre global du journal.
    // Tous les types sont lus : un écart de positions ne peut être détecté que sur la suite
    // complète des positions.
    for (;;) {
      const rows = await tx
        .select()
        .from(events)
        .where(gt(events.position, position))
        .orderBy(asc(events.position))
        .limit(batchSize)

      let blocked = false
      for (const row of rows) {
        // Une position manque avant cet événement. Si l'événement est récent, l'insertion
        // manquante est peut-être encore en cours : la projection s'arrête et l'attendra.
        // S'il est ancien, la position manquante correspond à une insertion annulée.
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

    // Le nouveau point de reprise est enregistré dans la même transaction que les tables.
    await tx
      .update(projections)
      .set({ position, version: projection.version, updatedAt: new Date() })
      .where(eq(projections.name, projection.name))
    return applied
  }

  /**
   * Indique si la projection est à jour : ses tables ont été construites par la version
   * du code, et son point de reprise a atteint la dernière position du journal.
   * Deux lectures simples, sans transaction, sans verrou et sans écriture (TD11).
   */
  async function isUpToDate(projection: Projection): Promise<boolean> {
    const [checkpoint] = await db
      .select({ position: projections.position, version: projections.version })
      .from(projections)
      .where(eq(projections.name, projection.name))
    if (!checkpoint || checkpoint.version !== projection.version) return false
    const [last] = await db.select({ position: max(events.position) }).from(events)
    return checkpoint.position >= Number(last?.position ?? 0)
  }

  /**
   * Applique à la projection les événements enregistrés depuis son point de reprise,
   * et renvoie le nombre d'événements appliqués. Tout a lieu dans une seule transaction :
   * les tables et le point de reprise sont mis à jour ensemble, ou pas du tout.
   * Si la version de la projection a changé, ses tables sont d'abord reconstruites.
   */
  async function catchUp(projection: Projection): Promise<number> {
    // Chemin rapide : une projection à jour n'a rien à appliquer. Le cas est de loin le plus
    // fréquent, puisque le journal change bien moins souvent qu'il n'est consulté ; il évite
    // la transaction, le verrou du point de reprise et l'écriture de sa date de mise à jour.
    if (await isUpToDate(projection)) return 0

    return db.transaction(async (tx) => {
      const checkpoint = await lock(tx, projection)

      // Les tables ont été construites par une version plus récente : ce code est ancien,
      // par exemple pendant un déploiement. Il ne les modifie pas, et les lit telles quelles.
      if (checkpoint.version > projection.version) return 0

      // La projection a évolué depuis la construction de ses tables : elles sont vidées,
      // et le journal est relu depuis le début.
      if (checkpoint.version < projection.version) {
        await projection.reset(tx)
        return advance(tx, projection, 0)
      }
      return advance(tx, projection, checkpoint.position)
    })
  }

  /**
   * Reconstruit entièrement la projection : ses tables sont vidées, puis le journal est relu
   * depuis le début. Tout a lieu dans une seule transaction : aucune lecture ne voit jamais
   * des tables vides ou à moitié reconstruites.
   */
  async function rebuild(projection: Projection): Promise<number> {
    return db.transaction(async (tx) => {
      await lock(tx, projection)
      await projection.reset(tx)
      return advance(tx, projection, 0)
    })
  }

  /** Position du point de reprise d'une projection ; 0 si elle n'a jamais été rattrapée. */
  async function positionOf(name: string): Promise<number> {
    const [row] = await db.select().from(projections).where(eq(projections.name, name))
    return row?.position ?? 0
  }

  return { catchUp, rebuild, positionOf }
}

/** Type du moteur des projections, déduit de sa fabrique. */
export type ProjectionRunner = ReturnType<typeof createProjectionRunner>
