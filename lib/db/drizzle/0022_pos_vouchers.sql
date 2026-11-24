CREATE TABLE "pos_vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"discount_cents" integer NOT NULL,
	"expires_at" timestamp with time zone,
	"redeemed_at" timestamp with time zone,
	CONSTRAINT "pos_voucher_org_code_unique" UNIQUE("organization_id","code"),
	CONSTRAINT "pos_voucher_positive" CHECK ("pos_vouchers"."discount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "appointment_payments" ADD COLUMN "voucher_code" text;--> statement-breakpoint
ALTER TABLE "appointment_payments" ADD COLUMN "voucher_id" uuid;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD COLUMN "voucher_code" text;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD COLUMN "voucher_id" uuid;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD COLUMN "discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_vouchers" ADD CONSTRAINT "pos_vouchers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_payments" ADD CONSTRAINT "appointment_payments_voucher_id_pos_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."pos_vouchers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_voucher_id_pos_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."pos_vouchers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_payments" ADD CONSTRAINT "appointment_payments_voucher_id_unique" UNIQUE("voucher_id");--> statement-breakpoint
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_voucher_id_unique" UNIQUE("voucher_id");