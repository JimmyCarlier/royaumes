CREATE TABLE "tavern"."presence" (
	"player_id" text PRIMARY KEY NOT NULL,
	"player_name" text NOT NULL,
	"last_seen" bigint NOT NULL
);
