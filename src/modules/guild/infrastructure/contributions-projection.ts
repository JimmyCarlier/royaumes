import { sql } from 'drizzle-orm'
import { GAME_CHANNEL_PREFIX } from '@/modules/dungeon/contracts'
import { VILLAGE_CHANNEL_PREFIX } from '@/modules/realm/contracts'
import type { StoredEvent } from '@/platform/event-store/event-store'
import type { Projection } from '@/platform/projection/projection'
import { contributions } from './schema'

/*
 * Données des événements lus par les Guildes. Elles appartiennent au « langage publié » du
 * Village et du Donjon : comme le Classement, le module en dépend sans importer leur code.
 * Seuls les champs utiles sont décrits.
 */
interface GameEndedData {
  result: 'won' | 'lost'
  loot: number
  /** Héros de l'expédition, compagnons compris. */
  heroIds: string[]
}

/** Identifiant du joueur tiré du nom du flux de son village : « village-alice » donne « alice ». */
const playerOf = (event: StoredEvent) => event.stream.slice(VILLAGE_CHANNEL_PREFIX.length)

/**
 * Projection des contributions des joueurs : elle lit dans le journal les améliorations du
 * Village et les expéditions gagnées du Donjon, et tient à jour, pour chaque joueur, l'or
 * rapporté et le nombre d'améliorations. Le score d'une guilde est calculé à la lecture.
 */
export const contributionsProjection: Projection = {
  name: 'guild-contributions',
  version: 1,
  eventTypes: ['BuildingUpgraded', 'GameEnded'],

  async apply(event, tx) {
    switch (event.type) {
      case 'BuildingUpgraded': {
        // Seuls les événements des flux du Village sont pris en compte.
        if (!event.stream.startsWith(VILLAGE_CHANNEL_PREFIX)) return
        await tx
          .insert(contributions)
          .values({ playerId: playerOf(event), upgrades: 1 })
          .onConflictDoUpdate({
            target: contributions.playerId,
            set: { upgrades: sql`${contributions.upgrades} + 1` },
          })
        return
      }

      case 'GameEnded': {
        // Une défaite ne rapporte rien. Les compagnons figurent parmi les héros : ils
        // reçoivent une contribution, qui ne compte jamais, puisqu'ils ne sont membres
        // d'aucune guilde.
        if (!event.stream.startsWith(GAME_CHANNEL_PREFIX)) return
        const data = event.data as unknown as GameEndedData
        if (data.result !== 'won' || data.loot <= 0 || data.heroIds.length === 0) return
        await tx
          .insert(contributions)
          .values(data.heroIds.map((playerId) => ({ playerId, gold: data.loot })))
          .onConflictDoUpdate({
            target: contributions.playerId,
            set: { gold: sql`${contributions.gold} + ${data.loot}` },
          })
        return
      }
    }
  },

  async reset(tx) {
    await tx.delete(contributions)
  },
}
