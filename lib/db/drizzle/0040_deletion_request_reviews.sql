CREATE TABLE "deletion_request_reviews" (
	"user_id" uuid NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewer_id" uuid,
	CONSTRAINT "deletion_request_reviews_user_id_requested_at_pk" PRIMARY KEY("user_id","requested_at")
);
--> statement-breakpoint
ALTER TABLE "deletion_request_reviews" ADD CONSTRAINT "deletion_request_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_request_reviews" ADD CONSTRAINT "deletion_request_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;