CREATE TABLE "inventory_order_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"items" jsonb NOT NULL,
	CONSTRAINT "inventory_order_receipt_request_unique" UNIQUE("order_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "inventory_order_receipts" ADD CONSTRAINT "inventory_order_receipts_order_id_inventory_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."inventory_orders"("id") ON DELETE no action ON UPDATE no action;