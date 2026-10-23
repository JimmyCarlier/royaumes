import { eq } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { PersonalDataContributor } from '@/platform/privacy/privacy'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { GuildService } from './application/guild-service'
import { contributionsProjection } from './infrastructure/contributions-projection'
import { contributions, guilds, members, requests } from './infrastructure/schema'

/**
 * Données personnelles des Guildes : l'appartenance du joueur à une guilde, sa demande
 * d'adhésion et sa contribution. Le module n'enregistre aucun événement : il n'a rien à
 * réécrire dans le journal.
 */
export function createGuildPersonalData(
  db: Db,
  projections: ProjectionRunner,
  service: GuildService,
): PersonalDataContributor {
  return {
    name: 'guild',

    async export(playerId) {
      // Comme toute lecture des contributions, l'export rattrape d'abord la projection.
      await projections.catchUp(contributionsProjection)
      const [membership] = await db
        .select({
          guild: guilds.name,
          name: members.name,
          role: members.role,
          joinedAt: members.joinedAt,
        })
        .from(members)
        .innerJoin(guilds, eq(guilds.id, members.guildId))
        .where(eq(members.playerId, playerId))
      const [request] = await db
        .select({ guild: guilds.name, name: requests.playerName, sentAt: requests.sentAt })
        .from(requests)
        .innerJoin(guilds, eq(guilds.id, requests.guildId))
        .where(eq(requests.playerId, playerId))
      const [contribution] = await db
        .select({ gold: contributions.gold, upgrades: contributions.upgrades })
        .from(contributions)
        .where(eq(contributions.playerId, playerId))
      return {
        membership: membership ?? null,
        request: request ?? null,
        contribution: contribution ?? null,
      }
    },

    // Le joueur quitte sa guilde selon la règle 9 (transmission du rôle de chef, ou
    // dissolution), et sa demande est supprimée : son nom disparaît des tables du module.
    // Sa contribution ne contient que des totaux, sans nom ; elle est conservée, comme dans le
    // Classement, car une reconstruction de la projection la recalculerait à partir du journal.
    async erase(playerId) {
      await service.removePlayer(playerId)
    },
  }
}
