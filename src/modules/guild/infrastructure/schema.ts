import { bigint, bigserial, index, integer, pgSchema, text } from 'drizzle-orm/pg-core'

/**
 * Schéma PostgreSQL du module Guildes. Comme la Taverne, le module n'enregistre aucun
 * événement : ses tables sont sa source de vérité. Les contraintes d'unicité portent les
 * règles qui concernent toutes les guildes à la fois, y compris sous concurrence.
 */
export const guild = pgSchema('guild')

/** Guildes. Une guilde dissoute est supprimée. */
export const guilds = guild.table('guilds', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** Clé d'unicité du nom, sans majuscules : deux guildes ne portent pas le même nom (règle 2). */
  nameKey: text('name_key').notNull().unique('guilds_name_key_unique'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
})

/**
 * Membres. La clé primaire est l'identifiant du joueur : un joueur appartient à au plus une
 * guilde (règle 3), même lorsque deux de ses demandes sont acceptées au même instant.
 */
export const members = guild.table(
  'members',
  {
    playerId: text('player_id').primaryKey(),
    guildId: text('guild_id').notNull(),
    /** Nom du joueur à son arrivée ; supprimé avec le membre. */
    name: text('name').notNull(),
    role: text('role', { enum: ['leader', 'member'] }).notNull(),
    joinedAt: bigint('joined_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('members_guild_idx').on(t.guildId)],
)

/**
 * Demandes d'adhésion. Un joueur n'a qu'une demande à la fois (règle 6) : une demande expirée
 * est remplacée par la suivante, et supprimée par la tâche quotidienne.
 */
export const requests = guild.table(
  'requests',
  {
    id: text('id').primaryKey(),
    playerId: text('player_id').notNull().unique('requests_player_unique'),
    guildId: text('guild_id').notNull(),
    /** Nom du demandeur, présenté au chef ; supprimé avec la demande. */
    playerName: text('player_name').notNull(),
    sentAt: bigint('sent_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('requests_guild_idx').on(t.guildId), index('requests_sent_at_idx').on(t.sentAt)],
)

/**
 * Contribution de chaque joueur, tenue par la projection du module à partir des événements
 * du Village et du Donjon (TD8). C'est un modèle de lecture : la table peut être vidée puis
 * reconstruite à partir du journal.
 */
export const contributions = guild.table('contributions', {
  playerId: text('player_id').primaryKey(),
  gold: integer('gold').notNull().default(0),
  upgrades: integer('upgrades').notNull().default(0),
})

/**
 * Activité des guildes, annoncée sur le canal temps réel de chaque guilde : une ligne par
 * changement (arrivée, départ, demande...). Elle ne contient aucune donnée personnelle :
 * les abonnés relisent leur vue auprès de l'API. Supprimée après sept jours.
 */
export const activity = guild.table(
  'activity',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    guildId: text('guild_id').notNull(),
    type: text('type').notNull(),
    at: bigint('at', { mode: 'number' }).notNull(),
  },
  (t) => [index('activity_guild_idx').on(t.guildId, t.id)],
)
