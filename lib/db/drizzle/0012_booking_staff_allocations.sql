CREATE TABLE "booking_staff_reservations" (
	"booking_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"employee_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	CONSTRAINT "booking_staff_reservations_booking_id_position_pk" PRIMARY KEY("booking_id","position"),
	CONSTRAINT "booking_staff_valid_interval" CHECK ("booking_staff_reservations"."starts_at" < "booking_staff_reservations"."ends_at")
);
--> statement-breakpoint
ALTER TABLE "booking_staff_reservations" ADD CONSTRAINT "booking_staff_reservations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_staff_reservations" ADD CONSTRAINT "booking_staff_reservations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE booking_staff_reservations ADD CONSTRAINT booking_staff_no_overlap
  EXCLUDE USING gist (employee_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&);
--> statement-breakpoint
INSERT INTO booking_staff_reservations (booking_id, position, employee_id, starts_at, ends_at)
SELECT id, 0, employee_id, starts_at, ends_at FROM bookings WHERE status = 'confirmed';
--> statement-breakpoint
CREATE FUNCTION sync_booking_staff_reservations() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  line jsonb;
  position integer := 0;
  segment_start timestamptz := NEW.starts_at;
  segment_end timestamptz;
  professional uuid;
BEGIN
  DELETE FROM booking_staff_reservations WHERE booking_id = NEW.id;
  IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.items) AS item
                 WHERE (item->>'employeeId')::uuid <> NEW.employee_id) THEN
    INSERT INTO booking_staff_reservations VALUES (NEW.id, 0, NEW.employee_id, NEW.starts_at, NEW.ends_at);
    RETURN NEW;
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(NEW.items) LOOP
    professional := (line->>'employeeId')::uuid;
    IF (position = 0 AND professional IS DISTINCT FROM NEW.employee_id)
      OR NOT EXISTS (SELECT 1 FROM employees WHERE id = professional AND location_id = NEW.location_id) THEN
      RAISE EXCEPTION 'Invalid professional on booking line' USING ERRCODE = '23514';
    END IF;
    segment_end := segment_start + make_interval(mins => (line->>'preparationMinutes')::int
      + (line->>'durationMinutes')::int + (line->>'cleanupMinutes')::int);
    INSERT INTO booking_staff_reservations VALUES (NEW.id, position, professional, segment_start, segment_end);
    segment_start := segment_end;
    position := position + 1;
  END LOOP;
  IF segment_start IS DISTINCT FROM NEW.ends_at THEN
    RAISE EXCEPTION 'Staff allocation must cover the booking duration' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER booking_staff_reservations_sync
  AFTER INSERT OR UPDATE OF status, starts_at, ends_at, employee_id, items ON bookings
  FOR EACH ROW EXECUTE FUNCTION sync_booking_staff_reservations();
--> statement-breakpoint
ALTER TABLE bookings DROP CONSTRAINT booking_employee_no_overlap;
