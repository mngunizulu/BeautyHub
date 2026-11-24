CREATE TABLE "retail_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"items" jsonb NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retail_sale_request_unique" UNIQUE("location_id","idempotency_key"),
	CONSTRAINT "retail_sale_positive" CHECK ("retail_sales"."amount_cents" > 0),
	CONSTRAINT "retail_sale_method" CHECK ("retail_sales"."method" in ('cash', 'simulated_card'))
);
--> statement-breakpoint
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;