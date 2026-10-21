CREATE SCHEMA "market";
--> statement-breakpoint
CREATE TABLE "market"."offers" (
	"offer_id" text PRIMARY KEY NOT NULL,
	"seller_id" text NOT NULL,
	"seller_name" text NOT NULL,
	"give" jsonb NOT NULL,
	"want" jsonb NOT NULL,
	"status" text NOT NULL,
	"published_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "offers_seller_idx" ON "market"."offers" USING btree ("seller_id");