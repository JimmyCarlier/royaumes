import { describe, expect, it } from 'vitest'
import { createTestApi } from './testing'

describe("Assemblage de l'API", () => {
  it('monte le module System sous /api/system', async () => {
    const { api } = await createTestApi()
    const res = await api.request('/api/system/health')
    expect(res.status).toBe(200)
  })

  it('renvoie une erreur JSON uniforme pour une route inconnue', async () => {
    const { api } = await createTestApi()
    const res = await api.request('/api/inconnue')

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route inconnue' },
    })
  })
})
