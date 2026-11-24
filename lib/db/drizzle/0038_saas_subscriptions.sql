CREATE TABLE "saas_changes" (
	"organization_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"plan_code" text NOT NULL,
	"action" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"period_ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saas_changes_organization_id_request_id_pk" PRIMARY KEY("organization_id","request_id"),
	CONSTRAINT "saas_change_values" CHECK ("saas_changes"."action" in ('trial', 'activate', 'cancel') and "saas_changes"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "saas_plans" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"monthly_cents" integer NOT NULL,
	"location_limit" integer NOT NULL,
	"trial_days" integer NOT NULL,
	CONSTRAINT "saas_plan_values" CHECK ("saas_plans"."monthly_cents" between 0 and 10000000 and "saas_plans"."location_limit" between 1 and 1000 and "saas_plans"."trial_days" between 0 and 90)
);
--> statement-breakpoint
CREATE TABLE "saas_subscriptions" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"plan_code" text NOT NULL,
	"state" text NOT NULL,
	"period_ends_at" timestamp with time zone NOT NULL,
	CONSTRAINT "saas_subscription_state" CHECK ("saas_subscriptions"."state" in ('trial', 'active', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "saas_changes" ADD CONSTRAINT "saas_changes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_changes" ADD CONSTRAINT "saas_changes_plan_code_saas_plans_code_fk" FOREIGN KEY ("plan_code") REFERENCES "public"."saas_plans"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_subscriptions" ADD CONSTRAINT "saas_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_subscriptions" ADD CONSTRAINT "saas_subscriptions_plan_code_saas_plans_code_fk" FOREIGN KEY ("plan_code") REFERENCES "public"."saas_plans"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "saas_plans" ("code", "name", "monthly_cents", "location_limit", "trial_days")
VALUES ('starter', 'Starter', 2900, 1, 0), ('professional', 'Professional', 7900, 5, 14), ('enterprise', 'Enterprise', 19900, 100, 0);
