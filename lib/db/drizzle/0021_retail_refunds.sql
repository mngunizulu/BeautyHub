CREATE TABLE "retail_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retail_refund_request_unique" UNIQUE("sale_id","idempotency_key"),
	CONSTRAINT "retail_refund_positive" CHECK ("retail_refunds"."amount_cents" > 0),
	CONSTRAINT "retail_refund_reason_length" CHECK (length("retail_refunds"."reason") between 1 and 240)
);
--> statement-breakpoint
ALTER TABLE "retail_refunds" ADD CONSTRAINT "retail_refunds_sale_id_retail_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."retail_sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_refunds" ADD CONSTRAINT "retail_refunds_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;