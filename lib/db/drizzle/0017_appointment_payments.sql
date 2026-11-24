CREATE TABLE "appointment_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"kind" text NOT NULL,
	"method" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"provider_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_payment_request_unique" UNIQUE("booking_id","idempotency_key"),
	CONSTRAINT "appointment_payment_positive" CHECK ("appointment_payments"."amount_cents" > 0),
	CONSTRAINT "appointment_payment_kind" CHECK ("appointment_payments"."kind" in ('deposit', 'settlement')),
	CONSTRAINT "appointment_payment_method" CHECK (("appointment_payments"."method" = 'cash' and "appointment_payments"."provider_reference" is null)
    or ("appointment_payments"."method" = 'simulated_card' and "appointment_payments"."provider_reference" is not null))
);
--> statement-breakpoint
ALTER TABLE "appointment_payments" ADD CONSTRAINT "appointment_payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_payments" ADD CONSTRAINT "appointment_payments_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;