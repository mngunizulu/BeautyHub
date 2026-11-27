CREATE TABLE "organization_categories" (
	"organization_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "organization_categories_organization_id_category_id_pk" PRIMARY KEY("organization_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "organization_categories" ADD CONSTRAINT "organization_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_categories" ADD CONSTRAINT "organization_categories_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_categories_category_idx" ON "organization_categories" USING btree ("category_id","organization_id");
--> statement-breakpoint
INSERT INTO service_categories (id, slug, name, sort_order)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'friseur', 'Friseure', 0),
  ('00000000-0000-4000-8000-000000000002', 'barbershop', 'Barbiere & Barbershops', 1),
  ('00000000-0000-4000-8000-000000000003', 'nagelstudio', 'Nagelstudios & Pediküre', 2),
  ('00000000-0000-4000-8000-000000000004', 'kosmetik', 'Gesichtspflege', 3),
  ('00000000-0000-4000-8000-000000000005', 'massage', 'Massage & Spa', 4),
  ('00000000-0000-4000-8000-000000000006', 'wellness', 'Wellness & alternative Anwendungen', 5),
  ('00000000-0000-4000-8000-000000000009', 'augenbrauen-wimpern', 'Augenbrauen, Wimpern & Make-up', 6),
  ('00000000-0000-4000-8000-000000000010', 'koerperbehandlungen', 'Körperbehandlungen', 7),
  ('00000000-0000-4000-8000-000000000011', 'haarentfernung', 'Haarentfernung', 8),
  ('00000000-0000-4000-8000-000000000012', 'tattoo-piercing', 'Tattoo & Piercing', 9)
ON CONFLICT (slug) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order;
--> statement-breakpoint
UPDATE locations AS location
SET category_id = canonical.id
FROM service_categories AS legacy
JOIN service_categories AS canonical ON canonical.slug = CASE legacy.slug WHEN 'spa' THEN 'massage' WHEN 'hautpflege' THEN 'kosmetik' END
WHERE location.category_id = legacy.id;
--> statement-breakpoint
DELETE FROM service_categories WHERE slug IN ('spa', 'hautpflege');
