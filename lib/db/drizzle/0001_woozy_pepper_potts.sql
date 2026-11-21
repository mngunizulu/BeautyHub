CREATE TABLE "business_service_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cancellation_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"notice_hours" integer DEFAULT 24 NOT NULL,
	"late_fee_type" text DEFAULT 'percentage' NOT NULL,
	"late_fee_value" integer DEFAULT 100 NOT NULL,
	"no_show_fee_type" text DEFAULT 'percentage' NOT NULL,
	"no_show_fee_value" integer DEFAULT 100 NOT NULL,
	"waiver_allowed" boolean DEFAULT true NOT NULL,
	"exceptions" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_valid_values" CHECK ("cancellation_policies"."notice_hours" >= 0 and "cancellation_policies"."late_fee_value" >= 0 and "cancellation_policies"."no_show_fee_value" >= 0 and "cancellation_policies"."late_fee_type" in ('percentage','fixed') and "cancellation_policies"."no_show_fee_type" in ('percentage','fixed') and ("cancellation_policies"."late_fee_type" <> 'percentage' or "cancellation_policies"."late_fee_value" <= 100) and ("cancellation_policies"."no_show_fee_type" <> 'percentage' or "cancellation_policies"."no_show_fee_value" <= 100))
);
--> statement-breakpoint
CREATE TABLE "employee_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"service_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"user_id" uuid,
	"display_name" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"working_hours" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_provider_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_customer_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "variant_valid_money_duration" CHECK ("service_variants"."price_cents" >= 0 and "service_variants"."duration_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "staff_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	CONSTRAINT "staff_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitation_role_allowed" CHECK ("staff_invitations"."role" in ('manager','employee'))
);
--> statement-breakpoint
ALTER TABLE "business_memberships" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "contact_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "website" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "onboarding_step" text DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_notifications" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "marketing_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "country" text DEFAULT 'DE' NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "street" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "house_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "address_extra" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "lead_time_hours" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "advance_booking_days" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "contact_preference" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "preparation_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "cleanup_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "online_booking" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "business_service_categories" ADD CONSTRAINT "business_service_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellation_policies" ADD CONSTRAINT "cancellation_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_services" ADD CONSTRAINT "employee_services_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_services" ADD CONSTRAINT "employee_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_provider_references" ADD CONSTRAINT "payment_provider_references_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_acceptances" ADD CONSTRAINT "policy_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_acceptances" ADD CONSTRAINT "policy_acceptances_policy_id_cancellation_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."cancellation_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_variants" ADD CONSTRAINT "service_variants_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_group_name_unique" ON "business_service_categories" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_tenant_version_unique" ON "cancellation_policies" USING btree ("organization_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_service_unique" ON "employee_services" USING btree ("employee_id","service_id");--> statement-breakpoint
CREATE INDEX "employees_tenant_idx" ON "employees" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_user_provider_unique" ON "payment_provider_references" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "invitations_tenant_idx" ON "staff_invitations" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_business_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."business_service_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_memberships" ADD CONSTRAINT "membership_status_allowed" CHECK ("business_memberships"."status" in ('active', 'inactive', 'removed'));--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "service_nonnegative_buffers" CHECK ("services"."preparation_minutes" >= 0 and "services"."cleanup_minutes" >= 0);