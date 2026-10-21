import { describe, expect, it } from 'vitest'
import { createCronApi } from './cron-api'

/** Requête de la tâche planifiée, avec un secret donné. */
const call = (api: ReturnType<typeof createCronApi>, secret?: string) =>
  api.request('/daily', secret ? { headers: { authorization: `Bearer ${secret}` } } : {})

describe('Tâches planifiées', () => {
  it('refuse une requête sans le secret attendu, et reste fermée sans secret configuré (401)', async () => {
    const api = createCronApi({ ping: async () => 'pong' }, 'secret')
    expect((await call(api)).status).toBe(401)
    expect((await call(api, 'autre')).status).toBe(401)
    expect((await call(createCronApi({}, undefined))).status).toBe(401)
  })

  it('exécute toutes les tâches, et renvoie le compte rendu de chacune', async () => {
    const api = createCronApi({ a: async () => 1, b: async () => ({ removed: 2 }) }, 'secret')
    expect(await (await call(api, 'secret')).json()).toEqual({
      a: { ok: true, result: 1 },
      b: { ok: true, result: { removed: 2 } },
    })
  })

  it("n'interrompt pas les tâches suivantes lorsqu'une tâche échoue", async () => {
    let ran = false
    const api = createCronApi(
      {
        broken: async () => {
          throw new Error('base indisponible')
        },
        next: async () => {
          ran = true
        },
      },
      'secret',
    )
    const reports = await (await call(api, 'secret')).json()
    expect(reports.broken).toEqual({ ok: false, error: 'base indisponible' })
    expect(ran).toBe(true)
  })
})
