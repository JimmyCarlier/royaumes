import type { AuthPort } from '@/platform/auth/port'
import { createTestDatabase } from '@/platform/db/client'
import { createEventStore } from '@/platform/event-store/event-store'
import { createApi } from './create-api'

/**
 * Adaptateur d'authentification réservé aux tests : le joueur est identifié par
 * l'en-tête x-test-user, sans compte ni cookie. Il n'est jamais utilisé par server.ts.
 */
export const testAuth: AuthPort = {
  handler: async () => new Response(null, { status: 404 }),
  getUser: async (headers) => {
    const id = headers.get('x-test-user')
    return id ? { id, name: id } : null
  },
}

/** Secret de la tâche planifiée, dans les tests. */
export const TEST_CRON_SECRET = 'secret-de-test'

/** Joueur au nom duquel une requête de test est envoyée ; null pour une requête anonyme. */
type TestUser = string | null

/**
 * Application complète, assemblée sur une base de test vidée, avec une horloge contrôlée
 * et l'adaptateur d'authentification de test.
 */
export async function createTestApi() {
  const start = Date.UTC(2026, 0, 1)
  let now = start
  const db = await createTestDatabase()
  const store = createEventStore(db)
  // Flux temps réel très courts, afin que les tests ne restent pas bloqués sur un flux ouvert.
  const api = createApi({
    auth: testAuth,
    db,
    store,
    clock: () => now,
    realtime: { pollMs: 20, maxStreamMs: 150 },
    cronSecret: TEST_CRON_SECRET,
    // Le distributeur compare la date de disponibilité des messages, fixée par la base en
    // heure réelle, à sa propre horloge : celle-ci part de l'heure réelle, et avance avec
    // l'horloge de l'application.
    outbox: { now: () => Date.now() + (now - start) },
  })

  /** En-têtes identifiant le joueur, ou aucun en-tête pour une requête anonyme. */
  const as = (user: TestUser): Record<string, string> => (user ? { 'x-test-user': user } : {})

  /** Envoie une requête GET, au nom d'alice par défaut. */
  const get = (path: string, user: TestUser = 'alice') => api.request(path, { headers: as(user) })

  /** Envoie une requête POST avec un corps JSON, au nom d'alice par défaut. */
  const post = (path: string, body: unknown, user: TestUser = 'alice') =>
    api.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...as(user) },
      body: JSON.stringify(body),
    })

  /** Fait avancer l'horloge de l'application. */
  const advance = (minutes: number) => {
    now += minutes * 60_000
  }

  return { api, get, post, advance }
}
