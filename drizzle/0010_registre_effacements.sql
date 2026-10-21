CREATE TABLE "platform"."erasures" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"erased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"events_rewritten" integer NOT NULL
);
