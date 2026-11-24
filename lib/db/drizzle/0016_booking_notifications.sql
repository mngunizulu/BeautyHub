CREATE TABLE "booking_notifications" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "booking_notifications" ADD CONSTRAINT "booking_notifications_event_id_booking_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."booking_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_notifications_ready_idx" ON "booking_notifications" USING btree ("status","available_at");