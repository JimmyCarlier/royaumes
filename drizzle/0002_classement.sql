CREATE SCHEMA "ranking";
--> statement-breakpoint
CREATE TABLE "platform"."projections" (
	"name" text PRIMARY KEY NOT NULL,
	"position" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ranking"."game_players" (
	"game_id" text NOT NULL,
	"player_id" text NOT NULL,
	CONSTRAINT "game_players_game_id_player_id_pk" PRIMARY KEY("game_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "ranking"."players" (
	"player_id" text PRIMARY KEY NOT NULL,
	"name" text,
	"village" text,
	"games_played" integer DEFAULT 0 NOT NULL,
	"games_won" integer DEFAULT 0 NOT NULL,
	"gold" integer DEFAULT 0 NOT NULL,
	"upgrades" integer DEFAULT 0 NOT NULL
);
