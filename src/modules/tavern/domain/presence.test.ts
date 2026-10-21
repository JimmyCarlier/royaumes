import { describe, expect, it } from 'vitest'
import { HEARTBEAT_MS, PRESENCE_TTL_MS, staleBefore } from './presence'

describe('Taverne - présence', () => {
  it('considère comme parti un joueur sans signal depuis le délai de présence', () => {
    const now = Date.UTC(2026, 0, 1, 12)
    expect(staleBefore(now)).toBe(now - PRESENCE_TTL_MS)
  })

  it('tolère plusieurs signaux manqués avant de déclarer un joueur parti', () => {
    // Un onglet en arrière-plan peut ne déclencher sa minuterie qu'une fois par minute.
    expect(PRESENCE_TTL_MS).toBeGreaterThanOrEqual(2 * 60_000)
    expect(PRESENCE_TTL_MS / HEARTBEAT_MS).toBeGreaterThanOrEqual(3)
  })
})
