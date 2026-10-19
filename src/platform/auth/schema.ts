import { boolean, pgSchema, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Tables attendues par Better Auth, rangées dans le schéma PostgreSQL « identity ».
 * Leur structure est imposée par la bibliothèque : elle ne doit pas être modifiée
 * sans consulter sa documentation.
 */
export const identity = pgSchema('identity')

/** Utilisateurs : un compte par joueur. */
export const user = identity.table('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

/** Sessions ouvertes ; supprimées à la déconnexion ou à l'expiration. */
export const session = identity.table('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

/**
 * Moyens d'authentification d'un utilisateur. Pour une connexion par mot de passe,
 * la colonne password contient l'empreinte du mot de passe, jamais le mot de passe lui-même.
 */
export const account = identity.table('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

/** Jetons temporaires (vérification d'adresse, réinitialisation de mot de passe). */
export const verification = identity.table('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
