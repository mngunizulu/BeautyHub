CREATE TABLE "appointment_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_refund_request_unique" UNIQUE("payment_id","idempotency_key"),
	CONSTRAINT "appointment_refund_positive" CHECK ("appointment_refunds"."amount_cents" > 0),
	CONSTRAINT "appointment_refund_reason_length" CHECK (length("appointment_refunds"."reason") between 1 and 240)
);
--> statement-breakpoint
ALTER TABLE "appointment_refunds" ADD CONSTRAINT "appointment_refunds_payment_id_appointment_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."appointment_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_refunds" ADD CONSTRAINT "appointment_refunds_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;