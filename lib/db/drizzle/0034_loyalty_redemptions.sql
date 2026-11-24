CREATE TABLE "loyalty_redemptions" (
	"voucher_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"points" integer NOT NULL,
	CONSTRAINT "loyalty_redemption_request" UNIQUE("user_id","organization_id","request_id"),
	CONSTRAINT "loyalty_redemption_points" CHECK ("loyalty_redemptions"."points" > 0)
);
--> statement-breakpoint
ALTER TABLE "pos_vouchers" ADD COLUMN "loyalty_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_voucher_id_pos_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."pos_vouchers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;