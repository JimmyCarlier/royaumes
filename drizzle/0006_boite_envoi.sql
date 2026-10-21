CREATE TABLE "platform"."outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "platform"."outbox" USING btree ("available_at") WHERE processed_at is null;