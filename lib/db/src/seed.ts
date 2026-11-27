import { db, pool } from "./index";
import { categories, organizations, locations, services, openingHours } from "./schema";

if (process.env.NODE_ENV !== "development") {
  throw new Error("Synthetic seed is development-only. Set NODE_ENV=development.");
}
const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
try {
  await db.transaction(async (tx) => {
    const categoryIds = new Map((await tx.select().from(categories)).map(({ slug, id: categoryId }) => [slug, categoryId]));
    function category(slug: string) {
      const categoryId = categoryIds.get(slug);
      if (!categoryId) throw new Error("Apply the marketplace category migration before seeding.");
      return categoryId;
    }
    const businesses = [
      {
        slug: "atelier-haar", name: "Atelier Haar", categoryId: category("friseur"), district: "Prenzlauer Berg",
        address: "Beispielstraße 12", postalCode: "10405", imageKey: "hair",
        description: "Ein fiktives Berliner Haaratelier für präzise Schnitte, natürliche Farben und einen Moment nur für dich. Synthetische Entwicklungsdaten – kein echtes buchbares Studio.",
      },
      {
        slug: "studio-ruhe", name: "Studio Ruhe", categoryId: category("wellness"), district: "Mitte",
        address: "Musterallee 8", postalCode: "10115", imageKey: "wellness",
        description: "Ein fiktiver Rückzugsort für wohltuende Massagen und bewusste Auszeiten. Synthetische Entwicklungsdaten – kein echtes buchbares Studio.",
      },
      {
        slug: "nail-atelier", name: "Nail Atelier", categoryId: category("nagelstudio"), district: "Charlottenburg",
        address: "Demoweg 24", postalCode: "10623", imageKey: "nails",
        description: "Ein fiktives Nagelstudio für gepflegte Hände, kreative Details und individuelle Looks. Synthetische Entwicklungsdaten – kein echtes buchbares Studio.",
      },
    ];
    for (const [i, business] of businesses.entries()) {
      await tx.insert(organizations).values({ id: id(101 + i), name: business.name, isDemo: true }).onConflictDoNothing();
      await tx.insert(locations).values({
        id: id(201 + i), organizationId: id(101 + i), ...business, city: "Berlin", published: true,
      }).onConflictDoNothing();
      await tx.insert(openingHours).values([1, 2, 3, 4, 5, 6].map((weekday) => ({
        id: id(600 + i * 10 + weekday), locationId: id(201 + i), weekday,
        opens: "09:00", closes: weekday === 6 ? "16:00" : "19:00",
      }))).onConflictDoNothing();
    }
    const serviceData = [
      { locationId: id(201), name: "Waschen, Schneiden & Föhnen", description: "Individueller Schnitt mit Beratung und Styling.", durationMinutes: 60, priceCents: 6500 },
      { locationId: id(201), name: "Balayage & Pflege", description: "Natürliche Farbverläufe inklusive Pflege.", durationMinutes: 150, priceCents: 14900 },
      { locationId: id(201), name: "Styling", description: "Ein frischer Look für deinen Tag.", durationMinutes: 30, priceCents: 3500 },
      { locationId: id(202), name: "Entspannungsmassage", description: "Eine ruhige Auszeit für den ganzen Körper.", durationMinutes: 60, priceCents: 7900 },
      { locationId: id(202), name: "Rückenmassage", description: "Wohltuende Entspannung für Rücken und Schultern.", durationMinutes: 30, priceCents: 4500 },
      { locationId: id(202), name: "Aroma-Ritual", description: "Sanfte Massage mit duftenden Ölen.", durationMinutes: 90, priceCents: 10900 },
      { locationId: id(203), name: "Klassische Maniküre", description: "Nagelpflege, Form und ein gepflegtes Finish.", durationMinutes: 30, priceCents: 2900 },
      { locationId: id(203), name: "Gel-Maniküre", description: "Langanhaltende Farbe mit individuellem Finish.", durationMinutes: 60, priceCents: 4900 },
      { locationId: id(203), name: "Pediküre", description: "Pflege und Entspannung für deine Füße.", durationMinutes: 45, priceCents: 3900 },
    ];
    await tx.insert(services).values(serviceData.map((service, i) => ({
      ...service, id: id(301 + i), published: true, onlineBooking: false,
    }))).onConflictDoUpdate({ target: services.id, set: { onlineBooking: false } });
  });
  process.stdout.write("Development catalog seeded: 3 synthetic studios, 9 services. No real accounts created.\n");
} finally {
  await pool.end();
}
