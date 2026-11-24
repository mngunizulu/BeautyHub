CREATE TABLE "loyalty_awards" (
	"booking_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"points" integer NOT NULL,
	CONSTRAINT "loyalty_award_points" CHECK ("loyalty_awards"."points" between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "loyalty_programs" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"points_per_visit" integer NOT NULL,
	CONSTRAINT "loyalty_program_points" CHECK ("loyalty_programs"."points_per_visit" between 0 and 1000)
);
--> statement-breakpoint
ALTER TABLE "loyalty_awards" ADD CONSTRAINT "loyalty_awards_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_awards" ADD CONSTRAINT "loyalty_awards_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_awards" ADD CONSTRAINT "loyalty_awards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loyalty_awards_user_organization" ON "loyalty_awards" USING btree ("user_id","organization_id");