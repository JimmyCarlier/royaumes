CREATE SCHEMA "platform";
--> statement-breakpoint
CREATE TABLE "platform"."events" (
	"position" bigserial PRIMARY KEY NOT NULL,
	"stream" text NOT NULL,
	"version" integer NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_stream_version" UNIQUE("stream","version")
);
