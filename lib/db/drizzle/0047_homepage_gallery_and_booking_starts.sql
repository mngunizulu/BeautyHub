CREATE TABLE "homepage_photo_placements" (
	"target" text PRIMARY KEY NOT NULL,
	"photo_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homepage_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alt" text NOT NULL,
	"mime" text NOT NULL,
	"content" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hidden_booking_starts" (
	"location_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	CONSTRAINT "hidden_booking_starts_location_id_service_id_starts_at_pk" PRIMARY KEY("location_id","service_id","starts_at")
);
--> statement-breakpoint
ALTER TABLE "homepage_photo_placements" ADD CONSTRAINT "homepage_photo_placements_photo_id_homepage_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."homepage_photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hidden_booking_starts" ADD CONSTRAINT "hidden_booking_starts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hidden_booking_starts" ADD CONSTRAINT "hidden_booking_starts_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;