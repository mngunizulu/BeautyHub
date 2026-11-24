ALTER TABLE "booking_events" ADD COLUMN "estimated_fee_cents" integer;--> statement-breakpoint
ALTER TABLE "booking_waitlist" ADD COLUMN "opened_at" timestamp with time zone;