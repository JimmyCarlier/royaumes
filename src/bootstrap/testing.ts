import { createTestDatabase } from '@/platform/db/client'
import { createEventStore } from '@/platform/event-store/event-store'
import { createApi } from './create-api'

/**
 * Application complète, assemblée sur une base de test vidée, avec une horloge contrôlée.
 * Destinée aux tests : elle assemble la plateforme comme le fait server.ts.
 */
export async function createTestApi() {
  let now = Date.UTC(2026, 0, 1)
  const store = createEventStore(await createTestDatabase())
  const api = createApi({ store, clock: () => now })

  /** Envoie une requête POST avec un corps JSON. */
  const post = (path: string, body: unknown) =>
    api.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  /** Fait avancer l'horloge de l'application. */
  const advance = (minutes: number) => {
    now += minutes * 60_000
  }

  return { api, post, advance }
}
