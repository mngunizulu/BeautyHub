CREATE TABLE "erased_test_identities" (
	"provider_digest" text PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"erased_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "erased_test_identities" ADD CONSTRAINT "erased_test_identities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;