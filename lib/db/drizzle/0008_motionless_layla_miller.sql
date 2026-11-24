ALTER TABLE "bookings" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "guest_name" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "source" text DEFAULT 'online' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_guest_idempotency_unique" ON "bookings" USING btree ("location_id","idempotency_key") WHERE "bookings"."user_id" is null;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "booking_customer_or_guest" CHECK (("bookings"."source" = 'online' and "bookings"."user_id" is not null and "bookings"."guest_name" is null)
    or ("bookings"."source" in ('manual', 'walk_in') and "bookings"."user_id" is null and "bookings"."guest_name" is not null and "bookings"."payment_method_id" is null));