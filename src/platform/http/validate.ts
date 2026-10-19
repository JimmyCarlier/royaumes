import { zValidator } from '@hono/zod-validator'
import type { ZodType } from 'zod'

/**
 * Valide le corps JSON d'une requête à l'aide d'un schéma Zod.
 * En cas d'échec, renvoie une erreur 400 au format commun à toute l'API,
 * avec le message de la première anomalie détectée.
 */
export const validateJson = <T extends ZodType>(schema: T) =>
  zValidator('json', schema, (result, c) => {
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? 'Entrée invalide'
      return c.json({ error: { code: 'INVALID_INPUT' as const, message } }, 400)
    }
  })
