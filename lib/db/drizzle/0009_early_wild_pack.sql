CREATE TABLE "staff_breaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"begins" text NOT NULL,
	"ends" text NOT NULL,
	CONSTRAINT "staff_break_valid" CHECK ("staff_breaks"."weekday" between 1 and 7
    and "staff_breaks"."begins" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and "staff_breaks"."ends" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and "staff_breaks"."begins" < "staff_breaks"."ends")
);
--> statement-breakpoint
CREATE TABLE "crm_appointment_links" (
	"booking_id" uuid PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"contact_preference" text DEFAULT 'none' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"tags" text[] NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_breaks" ADD CONSTRAINT "staff_breaks_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_appointment_links" ADD CONSTRAINT "crm_appointment_links_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_appointment_links" ADD CONSTRAINT "crm_appointment_links_customer_id_crm_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."crm_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_customers" ADD CONSTRAINT "crm_customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_break_employee_day_idx" ON "staff_breaks" USING btree ("employee_id","weekday");--> statement-breakpoint
CREATE INDEX "crm_appointment_customer_idx" ON "crm_appointment_links" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "crm_customers_tenant_name_idx" ON "crm_customers" USING btree ("organization_id","name");