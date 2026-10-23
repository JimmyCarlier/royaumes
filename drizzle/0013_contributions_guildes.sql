CREATE TABLE "guild"."contributions" (
	"player_id" text PRIMARY KEY NOT NULL,
	"gold" integer DEFAULT 0 NOT NULL,
	"upgrades" integer DEFAULT 0 NOT NULL
);
