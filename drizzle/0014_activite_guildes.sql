CREATE TABLE "guild"."activity" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"type" text NOT NULL,
	"at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "activity_guild_idx" ON "guild"."activity" USING btree ("guild_id","id");