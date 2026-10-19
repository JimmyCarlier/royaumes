import { ConcurrencyError } from './event-store'

/**
 * Exécute une opération et la rejoue si elle échoue sur un conflit d'écriture.
 * L'opération doit relire l'état à chaque tentative : elle décide ainsi sur l'état à jour.
 * Toute autre erreur, ou un conflit persistant au-delà de maxAttempts, est transmise.
 */
export async function withOptimisticRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation()
    } catch (error) {
      if (!(error instanceof ConcurrencyError) || attempt >= maxAttempts) throw error
    }
  }
}
