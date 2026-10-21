CREATE SCHEMA "tavern";
--> statement-breakpoint
CREATE TABLE "tavern"."messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"posted_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "messages_author_idx" ON "tavern"."messages" USING btree ("author_id","posted_at");--> statement-breakpoint
CREATE INDEX "messages_posted_at_idx" ON "tavern"."messages" USING btree ("posted_at");