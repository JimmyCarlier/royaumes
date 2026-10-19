import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSystemApi } from './api'

describe('API du module System', () => {
  // Chaque test qui manipule l'horloge la restaure ensuite.
  afterEach(() => {
    vi.useRealTimers()
  })

  it("répond sur /health avec l'état de l'instance", async () => {
    const api = createSystemApi(Date.now())

    // app.request() exécute une requête sans démarrer de serveur HTTP.
    const res = await api.request('/health')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(typeof body.time).toBe('string')
  })

  it('calcule la durée de fonctionnement depuis le démarrage du module', async () => {
    // L'horloge est simulée : le test ne dépend ni de l'heure réelle ni de sa durée.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'))
    const api = createSystemApi(Date.now())

    vi.setSystemTime(new Date('2026-01-01T10:01:30Z'))
    const body = await (await api.request('/health')).json()

    expect(body.uptime).toBe(90)
    expect(body.time).toBe('2026-01-01T10:01:30.000Z')
  })
})
