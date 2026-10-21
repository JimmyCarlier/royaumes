import { describe, expect, it } from 'vitest'
import { checkBody, checkRate, MESSAGE_MAX_LENGTH, RATE_LIMIT } from './message'

const T0 = Date.UTC(2026, 0, 1)

describe('Taverne - validation des messages', () => {
  it('retire les espaces de début et de fin, et refuse un message vide', () => {
    expect(checkBody('  Bonsoir !  ')).toEqual({ ok: true, body: 'Bonsoir !' })
    expect(checkBody('   ')).toEqual({ ok: false, error: { code: 'EMPTY_MESSAGE' } })
  })

  it('compte la longueur en caractères, et refuse un message trop long', () => {
    // 280 symboles de deux unités UTF-16 chacun : le message est accepté.
    expect(checkBody('🍺'.repeat(MESSAGE_MAX_LENGTH)).ok).toBe(true)
    expect(checkBody('a'.repeat(MESSAGE_MAX_LENGTH + 1))).toEqual({
      ok: false,
      error: { code: 'MESSAGE_TOO_LONG', max: MESSAGE_MAX_LENGTH },
    })
  })
})

describe('Taverne - limitation', () => {
  it("accepte les messages tant que la limite de la fenêtre n'est pas atteinte", () => {
    const four = [T0, T0 + 1000, T0 + 2000, T0 + 3000]
    expect(checkRate(four, T0 + 4000)).toBeNull()
  })

  it('refuse le message de trop, et indique le délai à attendre', () => {
    const five = [T0, T0 + 1000, T0 + 2000, T0 + 3000, T0 + 4000]
    expect(checkRate(five, T0 + 5000)).toEqual({
      code: 'TOO_MANY_MESSAGES',
      retryAfterMs: RATE_LIMIT.windowMs - 5000,
    })
  })
})
