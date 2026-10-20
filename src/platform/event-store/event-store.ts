import { and, asc, eq, gt, inArray, like } from 'drizzle-orm'
import type { Db } from '../db/client'
import { events } from './schema'

/** Événement à enregistrer : un type et des données, que la plateforme n'interprète pas. */
export interface NewEvent {
  type: string
  data: Record<string, unknown>
}

/** Événement enregistré, complété par les informations attribuées par le journal. */
export interface StoredEvent extends NewEvent {
  /** Ordre global, tous flux confondus. */
  position: number
  stream: string
  /** Rang dans le flux, à partir de 1. */
  version: number
  occurredAt: Date
}

/** Levée lorsqu'un autre enregistrement a eu lieu sur le flux depuis sa lecture. */
export class ConcurrencyError extends Error {
  constructor(stream: string, expectedVersion: number) {
    super(`Conflit d'écriture sur ${stream} (version attendue : ${expectedVersion})`)
    this.name = 'ConcurrencyError'
  }
}

/** Port du journal d'événements, utilisé par les adaptateurs des modules. */
export interface EventStore {
  /**
   * Ajoute des événements à la fin d'un flux.
   * expectedVersion est la version du flux lue avant la décision ;
   * une ConcurrencyError est levée si elle n'est plus la version courante.
   */
  append(stream: string, expectedVersion: number, newEvents: NewEvent[]): Promise<StoredEvent[]>

  /** Relit les événements d'un flux postérieurs à une version (tous par défaut), dans l'ordre. */
  read(stream: string, afterVersion?: number): Promise<StoredEvent[]>

  /**
   * Relit, dans l'ordre global des positions, les événements de tous les flux dont le nom
   * commence par streamPrefix, éventuellement limités à certains types.
   * Le préfixe ne doit contenir ni « % » ni « _ », caractères spéciaux de l'opérateur LIKE.
   */
  readAll(options: { streamPrefix: string; types?: string[] }): Promise<StoredEvent[]>
}

/**
 * Indique si une erreur provient d'une violation de contrainte d'unicité
 * (code SQLSTATE 23505). Drizzle encapsule l'erreur du pilote dans sa propre erreur :
 * la chaîne des causes est donc parcourue jusqu'à trouver le code.
 */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  while (current && typeof current === 'object') {
    if ((current as { code?: string }).code === '23505') return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

/** Convertit une ligne de la table en événement enregistré. */
function toStored(row: typeof events.$inferSelect): StoredEvent {
  return {
    position: row.position,
    stream: row.stream,
    version: row.version,
    type: row.type,
    data: row.data as Record<string, unknown>,
    occurredAt: row.occurredAt,
  }
}

/** Journal d'événements fondé sur la table platform.events. */
export function createEventStore(db: Db): EventStore {
  return {
    async append(stream, expectedVersion, newEvents) {
      if (newEvents.length === 0) return []

      // Les versions des nouveaux événements suivent la version attendue.
      const rows = newEvents.map((event, i) => ({
        stream,
        version: expectedVersion + i + 1,
        type: event.type,
        data: event.data,
      }))

      try {
        // Une seule instruction INSERT : les événements sont tous enregistrés, ou aucun.
        const inserted = await db.insert(events).values(rows).returning()
        return inserted.map(toStored)
      } catch (error) {
        // La contrainte (stream, version) a refusé l'écriture : un autre enregistrement
        // a eu lieu entre-temps. L'erreur technique est traduite en erreur du journal.
        if (isUniqueViolation(error)) throw new ConcurrencyError(stream, expectedVersion)
        throw error
      }
    },

    async read(stream, afterVersion = 0) {
      const rows = await db
        .select()
        .from(events)
        .where(and(eq(events.stream, stream), gt(events.version, afterVersion)))
        .orderBy(asc(events.version))
      return rows.map(toStored)
    },

    async readAll({ streamPrefix, types }) {
      const conditions = [like(events.stream, `${streamPrefix}%`)]
      if (types) conditions.push(inArray(events.type, types))
      const rows = await db
        .select()
        .from(events)
        .where(and(...conditions))
        .orderBy(asc(events.position))
      return rows.map(toStored)
    },
  }
}
