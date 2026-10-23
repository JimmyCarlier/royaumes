CREATE SCHEMA "guild";
--> statement-breakpoint
CREATE TABLE "guild"."guilds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "guilds_name_key_unique" UNIQUE("name_key")
);
--> statement-breakpoint
CREATE TABLE "guild"."members" (
	"player_id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"joined_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild"."requests" (
	"id" text PRIMARY KEY NOT NULL,
	"player_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"player_name" text NOT NULL,
	"sent_at" bigint NOT NULL,
	CONSTRAINT "requests_player_unique" UNIQUE("player_id")
);
--> statement-breakpoint
CREATE INDEX "members_guild_idx" ON "guild"."members" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "requests_guild_idx" ON "guild"."requests" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "requests_sent_at_idx" ON "guild"."requests" USING btree ("sent_at");