ALTER TABLE "locations" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
-- Preserve legacy display addresses while populating their structured equivalents.
UPDATE "locations"
SET "street" = CASE WHEN "address" ~ '^(.*)[[:space:]]+([0-9][^[:space:]]*)$'
                    THEN regexp_replace("address", '^(.*)[[:space:]]+([0-9][^[:space:]]*)$', '\1')
                    ELSE "address" END,
    "house_number" = coalesce((regexp_match("address", '^(.*)[[:space:]]+([0-9][^[:space:]]*)$'))[2], '')
WHERE "street" = '' AND "house_number" = '' AND "address" <> '';