ALTER TABLE "appointment_payments" ADD COLUMN "discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "appointment_payments" ADD COLUMN "discount_reason" text;--> statement-breakpoint
ALTER TABLE "appointment_payments" ADD CONSTRAINT "appointment_payment_discount" CHECK (("appointment_payments"."discount_cents" = 0 and "appointment_payments"."discount_reason" is null)
    or ("appointment_payments"."kind" = 'settlement' and "appointment_payments"."discount_cents" > 0
      and "appointment_payments"."discount_reason" is not null and length(trim("appointment_payments"."discount_reason")) between 1 and 240));