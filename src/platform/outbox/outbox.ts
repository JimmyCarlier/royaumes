import { and, asc, eq, gte, isNull, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { outbox } from './schema'

/** Message à enregistrer dans la boîte d'envoi, avec les événements qui le produisent. */
export interface NewMessage {
  /** Sujet du message, par exemple « realm.withdraw » : il désigne son gestionnaire. */
  topic: string
  /** Contenu du message, que la plateforme n'interprète pas. */
  payload: Record<string, unknown>
  /**
   * Délai avant la première remise, en millisecondes. Un message différé sert de minuterie :
   * il est remis à la première distribution qui suit l'écoulement du délai.
   */
  delayMs?: number
}

/** Message remis à un gestionnaire. */
export interface Message extends Omit<NewMessage, 'delayMs'> {
  id: string
  /** Numéro de la tentative en cours, à partir de 1. */
  attempt: number
}

/**
 * Gestionnaire d'un sujet. Il échoue en levant une erreur : le message sera alors retenté.
 * Un refus métier (stock insuffisant, par exemple) n'est pas un échec : le gestionnaire
 * le traite normalement, en enregistrant le refus et en y répondant par un message.
 */
export type MessageHandler = (message: Message) => Promise<void>

/**
 * Convertit un message à enregistrer en ligne de la table, avec un identifiant unique.
 * La date de disponibilité d'un message différé est calculée par la base, comme celle
 * d'un message ordinaire : maintenant, augmenté du délai.
 */
export const toOutboxRow = (message: NewMessage) => ({
  id: crypto.randomUUID(),
  topic: message.topic,
  payload: message.payload,
  ...(message.delayMs
    ? { availableAt: sql`now() + make_interval(secs => ${message.delayMs / 1000})` }
    : {}),
})

export interface DispatcherOptions {
  /** Nombre maximal de tentatives ; au-delà, le message est abandonné et reste à examiner. */
  maxAttempts?: number
  /** Durée du bail d'un message en cours de traitement, en millisecondes. */
  leaseMs?: number
  /** Nombre de messages réservés à la fois. */
  batchSize?: number
  /** Nombre maximal de messages remis par un appel à dispatch. */
  maxMessages?: number
  /** Horloge, remplacée dans les tests pour simuler l'écoulement du temps. */
  now?: () => number
}

/** Délai avant un nouvel essai : 2, 4, 8 secondes..., plafonné à une heure. */
const retryDelayMs = (attempt: number) => Math.min(2 ** attempt * 1000, 3_600_000)

/**
 * Distributeur de la boîte d'envoi : remet les messages en attente à leur gestionnaire,
 * au moins une fois. Il ne connaît aucun module : les gestionnaires lui sont fournis,
 * sujet par sujet, par la racine de composition.
 */
export function createDispatcher(
  db: Db,
  {
    maxAttempts = 10,
    leaseMs = 30_000,
    batchSize = 20,
    maxMessages = 100,
    now = () => Date.now(),
  }: DispatcherOptions = {},
) {
  const handlers = new Map<string, MessageHandler>()
  /** Gestionnaire des sujets qu'aucun module ne traite ; aucun par défaut. */
  let fallback: MessageHandler | null = null

  /** Enregistre les gestionnaires d'un module, par sujet. */
  function register(moduleHandlers: Record<string, MessageHandler>) {
    for (const [topic, handler] of Object.entries(moduleHandlers)) handlers.set(topic, handler)
  }

  /**
   * Enregistre le gestionnaire des sujets qu'aucun module ne traite. Un service extrait
   * l'utilise pour transmettre à l'application les messages destinés aux autres modules (TD11).
   */
  function registerFallback(handler: MessageHandler) {
    fallback = handler
  }

  /**
   * Traite immédiatement un message reçu d'un autre processus, par le gestionnaire de son sujet.
   * Le message n'est pas enregistré : l'expéditeur le conserve dans sa propre boîte d'envoi
   * jusqu'à ce que ce traitement réussisse, et le retentera sinon.
   */
  async function handle(message: Message) {
    const handler = handlers.get(message.topic) ?? fallback
    if (!handler) throw new Error(`Aucun gestionnaire pour le sujet ${message.topic}`)
    await handler(message)
  }

  /**
   * Réserve des messages en attente, en une seule instruction : leur date de disponibilité
   * est repoussée de la durée du bail, et leur nombre de tentatives augmenté.
   * FOR UPDATE SKIP LOCKED ignore les messages qu'une distribution simultanée est en train
   * de réserver : deux distributions ne réservent jamais le même message.
   */
  async function claim() {
    const at = now()
    const result = await db.execute(sql`
      UPDATE ${outbox}
      SET available_at = ${new Date(at + leaseMs)}, attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM ${outbox}
        WHERE processed_at IS NULL AND available_at <= ${new Date(at)} AND attempts < ${maxAttempts}
        ORDER BY created_at
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, topic, payload, attempts`)
    const rows = (result as unknown as { rows: Record<string, unknown>[] }).rows
    return rows.map(
      (row): Message => ({
        id: row.id as string,
        topic: row.topic as string,
        payload: row.payload as Record<string, unknown>,
        attempt: row.attempts as number,
      }),
    )
  }

  /** Remet un message à son gestionnaire, puis enregistre le succès ou l'échec. */
  async function deliver(message: Message): Promise<boolean> {
    try {
      await handle(message)
      // Si le distributeur est interrompu avant cette instruction, le message sera remis
      // une seconde fois à l'expiration du bail : le gestionnaire doit être idempotent.
      await db
        .update(outbox)
        .set({ processedAt: new Date(now()) })
        .where(eq(outbox.id, message.id))
      return true
    } catch (error) {
      await db
        .update(outbox)
        .set({
          availableAt: new Date(now() + retryDelayMs(message.attempt)),
          lastError: error instanceof Error ? error.message : String(error),
        })
        .where(eq(outbox.id, message.id))
      return false
    }
  }

  /**
   * Remet les messages en attente, y compris ceux que les gestionnaires produisent pendant
   * la distribution : une saga peut ainsi se dérouler entièrement en un seul appel.
   * Renvoie le nombre de messages remis avec succès, et le nombre d'échecs.
   */
  async function dispatch() {
    let delivered = 0
    let failed = 0
    while (delivered + failed < maxMessages) {
      const messages = await claim()
      if (messages.length === 0) break
      for (const message of messages) {
        if (await deliver(message)) delivered++
        else failed++
      }
    }
    return { delivered, failed }
  }

  /** Nombre de messages en attente, et de messages abandonnés après trop de tentatives. */
  async function status() {
    const [row] = await db
      .select({
        pending: sql<number>`count(*) filter (where ${outbox.attempts} < ${maxAttempts})`,
        abandoned: sql<number>`count(*) filter (where ${outbox.attempts} >= ${maxAttempts})`,
      })
      .from(outbox)
      .where(isNull(outbox.processedAt))
    return { pending: Number(row.pending), abandoned: Number(row.abandoned) }
  }

  /**
   * Messages abandonnés après le nombre maximal de tentatives (lettres mortes), avec la cause
   * de leur dernier échec. Destinés à l'exploitation : ils permettent de diagnostiquer
   * une saga interrompue.
   */
  function abandoned() {
    return db
      .select({
        id: outbox.id,
        topic: outbox.topic,
        payload: outbox.payload,
        attempts: outbox.attempts,
        lastError: outbox.lastError,
        createdAt: outbox.createdAt,
      })
      .from(outbox)
      .where(and(isNull(outbox.processedAt), gte(outbox.attempts, maxAttempts)))
      .orderBy(asc(outbox.createdAt))
  }

  /**
   * Relance un message abandonné, une fois la cause de ses échecs corrigée : son nombre de
   * tentatives est remis à zéro, et il sera remis à la prochaine distribution.
   * Renvoie faux si le message n'existe pas, ou n'est pas abandonné.
   */
  async function retry(id: string) {
    const updated = await db
      .update(outbox)
      .set({ attempts: 0, availableAt: new Date(now()), lastError: null })
      .where(and(eq(outbox.id, id), isNull(outbox.processedAt), gte(outbox.attempts, maxAttempts)))
      .returning({ id: outbox.id })
    return updated.length === 1
  }

  return { register, registerFallback, handle, dispatch, status, abandoned, retry }
}

/** Type du distributeur, déduit de sa fabrique. */
export type Dispatcher = ReturnType<typeof createDispatcher>
