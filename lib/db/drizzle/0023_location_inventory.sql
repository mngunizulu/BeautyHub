CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"kind" text NOT NULL,
	"quantity" integer NOT NULL,
	"balance" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movement_request_unique" UNIQUE("product_id","idempotency_key"),
	CONSTRAINT "inventory_movement_values" CHECK ("inventory_movements"."balance" >= 0 and
    (("inventory_movements"."kind" = 'receipt' and "inventory_movements"."quantity" > 0) or ("inventory_movements"."kind" = 'adjustment' and "inventory_movements"."quantity" <> 0)))
);
--> statement-breakpoint
CREATE TABLE "inventory_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"supplier" text DEFAULT '' NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"unit_cents" integer NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"reorder_at" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "inventory_location_sku_unique" UNIQUE("location_id","sku"),
	CONSTRAINT "inventory_product_values" CHECK ("inventory_products"."unit_cents" > 0 and "inventory_products"."stock" >= 0 and "inventory_products"."reorder_at" >= 0)
);
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_inventory_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."inventory_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_products" ADD CONSTRAINT "inventory_products_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;