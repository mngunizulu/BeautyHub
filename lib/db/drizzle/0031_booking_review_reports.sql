CREATE TABLE "booking_review_reports" (
	"review_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_review_reports_review_id_reporter_id_pk" PRIMARY KEY("review_id","reporter_id"),
	CONSTRAINT "booking_review_report_reason" CHECK ("booking_review_reports"."reason" in ('spam', 'abuse', 'personal_information', 'other'))
);
--> statement-breakpoint
ALTER TABLE "booking_review_reports" ADD CONSTRAINT "booking_review_reports_review_id_booking_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."booking_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_review_reports" ADD CONSTRAINT "booking_review_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;