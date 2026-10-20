CREATE SCHEMA "dungeon";
--> statement-breakpoint
CREATE TABLE "dungeon"."open_games" (
	"game_id" text PRIMARY KEY NOT NULL,
	"host_name" text NOT NULL,
	"hero_count" integer NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "open_games_created_at_idx" ON "dungeon"."open_games" USING btree ("created_at");