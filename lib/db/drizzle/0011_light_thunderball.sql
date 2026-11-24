CREATE TABLE "professional_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"variant_id" uuid,
	"price_cents" integer,
	"duration_minutes" integer,
	CONSTRAINT "professional_price_bounds" CHECK (("professional_prices"."price_cents" between 0 and 10000000 or "professional_prices"."price_cents" is null)
    and ("professional_prices"."duration_minutes" between 1 and 720 or "professional_prices"."duration_minutes" is null))
);
--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "differential_pricing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "allow_professional_choice" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "allow_any_professional" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "professional_title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "professional_photo_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "professional_prices" ADD CONSTRAINT "professional_prices_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_prices" ADD CONSTRAINT "professional_prices_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_prices" ADD CONSTRAINT "professional_prices_variant_id_service_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."service_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "professional_price_base" ON "professional_prices" USING btree ("employee_id","service_id") WHERE "professional_prices"."variant_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "professional_price_variant" ON "professional_prices" USING btree ("employee_id","service_id","variant_id") WHERE "professional_prices"."variant_id" is not null;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "location_professional_choice" CHECK ("locations"."allow_professional_choice" or "locations"."allow_any_professional");