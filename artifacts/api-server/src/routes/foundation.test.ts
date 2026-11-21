import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, pool, categories, organizations, locations, services, memberships, users } from "@workspace/db";
import app from "../app";
import { literalPattern } from "../repositories/catalog";

// Real development DB integration; fixtures are isolated and cleaned by their IDs.
const organizationId = randomUUID();
const categoryId = randomUUID();
const locationId = randomUUID();
const hiddenId = randomUUID();
const identityId = randomUUID();
const token = `qa-${randomUUID()}`;
beforeAll(async () => {
  if (process.env.NODE_ENV !== "test") throw new Error("Integration suite requires NODE_ENV=test.");
  await db.insert(categories).values({ id: categoryId, slug: token, name: "Synthetische Testkategorie" });
  await db.insert(organizations).values({ id: organizationId, name: token, isDemo: true });
  await db.insert(locations).values([{
    id: locationId, organizationId, categoryId, slug: token, name: token,
    description: "Integration fixture", city: "Teststadt", district: "Testbezirk",
    address: "Testweg 1", postalCode: "00000", imageKey: "hair", published: true,
  }, {
    id: hiddenId, organizationId, categoryId, slug: `${token}-private`, name: `${token}-private`,
    description: "Private unpublished fixture", city: "Teststadt", district: "Testbezirk",
    address: "Testweg 2", postalCode: "00000", imageKey: "hair", published: false,
  }]);
  await db.insert(services).values([
    { locationId, name: "Fixture service", description: "Public fixture", durationMinutes: 30, priceCents: 3200, published: true },
    { locationId, name: "Private secret service", description: "Hidden fixture", durationMinutes: 60, priceCents: 100, published: false },
  ]);
  await db.insert(users).values({ id: identityId, externalIdentityId: token });
});
afterAll(async () => {
  await db.delete(memberships).where(eq(memberships.userId, identityId));
  await db.delete(users).where(eq(users.id, identityId));
  await db.delete(locations).where(eq(locations.organizationId, organizationId));
  await db.delete(organizations).where(eq(organizations.id, organizationId));
  await db.delete(categories).where(eq(categories.id, categoryId));
  await pool.end();
});

describe("foundation API and real database persistence", () => {
  it("reports live database readiness", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", database: "connected" });
    expect(Number.isNaN(Date.parse(res.body.timestamp))).toBe(false);
  });
  it("reports an unavailable database honestly with 503", async () => {
    const spy = vi.spyOn(pool, "query").mockRejectedValueOnce(new Error("test only") as never);
    try {
      const res = await request(app).get("/api/healthz");
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({ status: "degraded", database: "unavailable" });
      expect(JSON.stringify(res.body)).not.toContain("test only");
    } finally { spy.mockRestore(); }
  });
  it("exposes actual database records with combined filters", async () => {
    const res = await request(app).get("/api/businesses").query({ q: token, category: token, city: "Teststadt" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: locationId, isDemo: true, serviceCount: 1, minPriceCents: 3200 });
    expect(res.body[0]).not.toHaveProperty("organizationId");
  });
  it("persists records outside the inserting query/connection", async () => {
    const result = await pool.query("select slug from locations where id=$1", [locationId]);
    expect(result.rows[0].slug).toBe(token);
  });
  it("returns only published services on a public profile", async () => {
    const res = await request(app).get(`/api/businesses/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.services).toHaveLength(1);
    expect(res.body.services[0].priceCents).toBe(3200);
    expect(res.body.openingHours).toEqual([]);
  });
  it("does not expose unpublished businesses", async () => {
    const res = await request(app).get(`/api/businesses/${token}-private`);
    expect(res.status).toBe(404);
  });
  it("filters by published service name", async () => {
    const res = await request(app).get("/api/businesses").query({ q: "Fixture service", category: token });
    expect(res.body).toHaveLength(1);
  });
  it("does not match private service names", async () => {
    const res = await request(app).get("/api/businesses").query({ q: "Private secret service" });
    expect(res.body).toEqual([]);
  });
  it("returns a genuine empty state for unmatched filters", async () => {
    const res = await request(app).get("/api/businesses").query({ city: "No-such-city" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
  it("rejects overlong and nested search inputs", async () => {
    expect((await request(app).get("/api/businesses").query({ q: "x".repeat(101) })).status).toBe(400);
    expect((await request(app).get("/api/businesses?q[a]=b")).status).toBe(400);
  });
  it("treats SQL and wildcard input literally", async () => {
    const res = await request(app).get("/api/businesses").query({ q: "' OR 1=1 --" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(literalPattern("a%b_c\\d")).toBe("%a\\%b\\_c\\\\d%");
    expect((await request(app).get("/api/businesses").query({ q: "%" })).body).toEqual([]);
  });
  it("rejects malformed business identifiers and handles missing profiles", async () => {
    expect((await request(app).get("/api/businesses/bad_slug")).status).toBe(400);
    expect((await request(app).get("/api/businesses/nonexistent-test-profile")).status).toBe(404);
  });
  it("counts only published businesses in categories", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(200);
    expect(res.body.find((item: { id: string }) => item.id === categoryId).businessCount).toBe(1);
  });
  it("computes catalog totals from persisted data", async () => {
    const res = await request(app).get("/api/marketplace/summary");
    const count = await pool.query("select count(*)::int as total from locations where published=true");
    expect(res.status).toBe(200);
    expect(res.body.businessCount).toBe(count.rows[0].total);
    const serviceCount = await pool.query(
      "select count(*)::int as total from services s join locations l on l.id=s.location_id where s.published=true and l.published=true",
    );
    expect(res.body.serviceCount).toBe(serviceCount.rows[0].total);
    expect(res.body.cities).toContain("Teststadt");
  });
  it("reports guest-only authentication without trusting forged headers", async () => {
    const res = await request(app).get("/api/auth/session")
      .set("Authorization", "Bearer forged").set("X-User-Id", identityId).set("X-Role", "admin");
    expect(res.body).toMatchObject({ authenticated: false, configured: true, role: "guest" });
    expect(res.headers["cache-control"]).toBe("no-store");
  });
  it("denies anonymous business and admin access regardless of tenant manipulation", async () => {
    for (const path of ["/api/business/workspace", "/api/admin/workspace", `/api/business/${organizationId}/customers`]) {
      const res = await request(app).get(path).query({ organizationId })
        .set("X-Role", "admin").set("X-User-Id", identityId);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("AUTHENTICATION_REQUIRED");
    }
  });
  it("returns all ten planned stages and disabled future features", async () => {
    const res = await request(app).get("/api/system");
    expect(res.body).toMatchObject({ stage: 2, bookingEnabled: false, authenticationEnabled: true, locale: "de-DE" });
    expect(res.body.stages).toHaveLength(10);
  });
  it("does not advertise cross-origin access and sends security headers", async () => {
    const res = await request(app).get("/api/system").set("Origin", "https://untrusted.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["ratelimit"]).toBeDefined();
  });
  it("enforces database price, duration, membership and foreign-key constraints", async () => {
    await expect(db.insert(services).values({
      locationId, name: "Invalid", description: "Test", durationMinutes: 0, priceCents: -1,
    })).rejects.toThrow();
    await expect(db.insert(memberships).values({
      userId: identityId, organizationId: randomUUID(), role: "owner",
    })).rejects.toThrow();
    await db.insert(memberships).values({ userId: identityId, organizationId, role: "owner" });
    await expect(db.insert(memberships).values({ userId: identityId, organizationId, role: "manager" })).rejects.toThrow();
  });
  it("returns structured 404 and malformed JSON errors without internals", async () => {
    expect((await request(app).get("/api/nonexistent")).body.code).toBe("NOT_FOUND");
    const res = await request(app).post("/api/nonexistent").set("Content-Type", "application/json").send("{");
    expect(res.status).toBe(400);
    expect(res.body).not.toHaveProperty("stack");
  });
});
