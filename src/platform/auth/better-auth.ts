import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { Db } from '../db/client'
import type { AuthPort } from './port'
import { account, session, user, verification } from './schema'

/** Adresse publique de l'application : celle de BETTER_AUTH_URL, ou l'adresse locale. */
function resolveBaseUrl(): string {
  return process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
}

/**
 * Secret qui signe les cookies de session.
 * En production, il est obligatoire : son absence empêche le démarrage.
 * En développement, une valeur fixe est utilisée, qui ne protège rien.
 */
function resolveSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL) {
    throw new Error('BETTER_AUTH_SECRET est obligatoire en production.')
  }
  return 'dev-only-secret-not-for-production-use-0123456789'
}

/** Adaptateur du port d'authentification fondé sur Better Auth. */
export function createBetterAuth(db: Db): AuthPort {
  const auth = betterAuth({
    // Les comptes et les sessions sont conservés dans la base du projet, par Drizzle.
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification },
    }),
    // Connexion par adresse électronique et mot de passe, d'au moins 8 caractères.
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    secret: resolveSecret(),
    baseURL: resolveBaseUrl(),
    // Limitation du nombre de tentatives : voir la sous-partie 2.3.
    // DETTE TECHNIQUE DT-004 (docs/qualite/dette-technique.md) : les compteurs sont conservés
    // dans la mémoire de chaque instance, et ne sont donc pas partagés entre instances.
    rateLimit: {
      enabled: process.env.AUTH_RATE_LIMIT !== 'off' || Boolean(process.env.VERCEL),
      customRules: {
        '/sign-up/email': { window: 60, max: 40 },
        '/sign-in/email': { window: 60, max: 60 },
      },
    },
  })

  return {
    handler: (request) => auth.handler(request),

    async getUser(headers) {
      // Better Auth lit le cookie de session dans les en-têtes, et retrouve la session en base.
      const result = await auth.api.getSession({ headers })
      return result ? { id: result.user.id, name: result.user.name } : null
    },
  }
}
