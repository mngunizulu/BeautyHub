ALTER TABLE "locations" ADD COLUMN "cover_photo_id" uuid;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "photo_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_products" ADD COLUMN "photo_id" uuid;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_cover_photo_id_gallery_photos_id_fk" FOREIGN KEY ("cover_photo_id") REFERENCES "public"."gallery_photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_photo_id_gallery_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."gallery_photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_products" ADD CONSTRAINT "inventory_products_photo_id_gallery_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."gallery_photos"("id") ON DELETE set null ON UPDATE no action;