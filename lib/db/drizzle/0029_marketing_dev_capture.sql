CREATE TABLE "marketing_captured_recipients" (
	"capture_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	CONSTRAINT "marketing_captured_recipients_capture_id_user_id_pk" PRIMARY KEY("capture_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "marketing_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_capture_request_unique" UNIQUE("campaign_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "marketing_captured_recipients" ADD CONSTRAINT "marketing_captured_recipients_capture_id_marketing_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."marketing_captures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_captured_recipients" ADD CONSTRAINT "marketing_captured_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_captures" ADD CONSTRAINT "marketing_captures_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE cascade ON UPDATE no action;