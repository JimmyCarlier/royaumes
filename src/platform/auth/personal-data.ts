import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { PersonalDataContributor } from '../privacy/privacy'
import { session, user } from './schema'

/**
 * Données personnelles de l'identité : le compte et les sessions du joueur.
 * L'empreinte du mot de passe et les jetons de session ne sont jamais exportés : ce sont
 * des secrets, et non des informations utiles au joueur.
 */
export function createIdentityPersonalData(db: Db): PersonalDataContributor {
  return {
    name: 'identity',

    async export(playerId) {
      const [account] = await db
        .select({ name: user.name, email: user.email, createdAt: user.createdAt })
        .from(user)
        .where(eq(user.id, playerId))
      const sessions = await db
        .select({
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
        })
        .from(session)
        .where(eq(session.userId, playerId))
      return { account: account ?? null, sessions }
    },

    // La suppression du compte supprime aussi ses sessions et ses identifiants de connexion,
    // par les clés étrangères déclarées avec onDelete: 'cascade'. Le joueur est déconnecté.
    async erase(playerId) {
      await db.delete(user).where(eq(user.id, playerId))
    },
  }
}
