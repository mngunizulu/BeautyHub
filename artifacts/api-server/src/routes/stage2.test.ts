import { readFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import {
  db, pool, users, organizations, memberships, locations, services, categories,
  employees, employeeServices, serviceVariants, cancellationPolicies, staffInvitations,
  auditEvents, platformSettings, platformSettingChanges, saasChanges, supportCases, deletionRequestReviews, erasedTestIdentities, galleryPhotos, saasPlans, saasSubscriptions, customerPackages, packageUses, servicePackages, paymentReferences, serviceGroups, reservations, bookingResourceReservations, bookingStaffReservations, bookingReviewReports, bookingReviews, bookingNotifications, bookingEvents, appointmentPayments, appointmentRefunds, retailSales, retailRefunds, posVouchers, inventoryProducts, inventoryMovements, inventoryOrderReceipts, inventoryOrders, businessMarketingPreferences, marketingCampaigns, marketingCaptures, marketingCapturedRecipients, inventorySuppliers,
} from "@workspace/db";
import app from "../app";
import { recordBookingEvent } from "../services/booking-notifications";
import { deliverNextBookingEmail } from "../services/booking-email-delivery";

// Only the external identity boundary is mocked; real app authz/routes/DB are used.
// No test impersonation header or bypass is implemented in application code.
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { headers: Record<string, string> }) => ({ userId: req.headers["x-test-provider-id"] ?? null }),
  clerkClient: { users: { getUser: async (id: string) => ({
    id, firstName: "API", lastName: "Test", primaryEmailAddressId: "primary",
    emailAddresses: [{ id: "primary", emailAddress: `${id}@example.com`, verification: { status: "verified" } }],
  }) } },
}));
const suffix = randomUUID();
const owner = `qa-owner-${suffix}`;
const outsider = `qa-other-${suffix}`;
const worker = `qa-worker-${suffix}`;
const consumer = `qa-consumer-${suffix}`;
const orgIds: string[] = [];
let categoryId: string;
let orgId: string;
let otherOrg: string;
let locationId: string;
let employeeId: string;
let serviceId: string;
let ownerId: string;
let workerId: string;
let invitationToken: string;
const authed = (method: "get" | "post" | "put" | "patch" | "delete", path: string, user = owner) => request(app)[method](path).set("x-test-provider-id", user);
const orgPath = (tail = "") => `/api/organizations/${orgId}${tail}`;

beforeAll(async () => {
  const [category] = await db.select().from(categories).limit(1);
  categoryId = category!.id;
});
afterAll(async () => {
  const identities = await db.select().from(users).where(inArray(users.externalIdentityId, [owner, outsider, worker, consumer]));
  for (const id of orgIds) {
    const locs = await db.select().from(locations).where(eq(locations.organizationId, id));
    const locIds = locs.map((loc) => loc.id);
    const serviceRows = locIds.length ? await db.select().from(services).where(inArray(services.locationId, locIds)) : [];
    const serviceIds = serviceRows.map((s) => s.id);
    if (serviceIds.length) {
      await db.delete(employeeServices).where(inArray(employeeServices.serviceId, serviceIds));
      await db.delete(serviceVariants).where(inArray(serviceVariants.serviceId, serviceIds));
    }
    await db.delete(auditEvents).where(eq(auditEvents.organizationId, id));
    await db.delete(staffInvitations).where(eq(staffInvitations.organizationId, id));
    await db.delete(cancellationPolicies).where(eq(cancellationPolicies.organizationId, id));
    await db.delete(employees).where(eq(employees.organizationId, id));
    if (locIds.length) await db.delete(services).where(inArray(services.locationId, locIds));
    await db.delete(serviceGroups).where(eq(serviceGroups.organizationId, id));
    await db.delete(locations).where(eq(locations.organizationId, id));
    await db.delete(memberships).where(eq(memberships.organizationId, id));
    await db.delete(organizations).where(eq(organizations.id, id));
  }
  if (identities.length) {
    const ids = identities.map((user) => user.id);
    await db.delete(paymentReferences).where(inArray(paymentReferences.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }
  await pool.end();
});

describe("Stage 2 persisted identities, onboarding and tenant boundaries", () => {
  it("requires a verified identity on account and organization APIs", async () => {
    expect((await request(app).get("/api/me")).status).toBe(401);
    expect((await request(app).post("/api/organizations").send({ name: "Fake owner", categoryId })).status).toBe(401);
  });
  it("provisions a stable database identity once across returning sessions", async () => {
    const first = await authed("get", "/api/me");
    const second = await authed("get", "/api/me");
    expect(first.status).toBe(200);
    ownerId = first.body.id;
    expect(second.body.id).toBe(ownerId);
    expect((await db.select().from(users).where(eq(users.externalIdentityId, owner)))).toHaveLength(1);
    expect(first.body.isPlatformAdmin).toBe(false);
  });
  it("persists profile edits and preferences without permitting admin or email claims", async () => {
    const profile = { displayName: "API Test Owner", phone: "+49 201 123456", emailNotifications: false, marketingConsent: false };
    expect((await authed("patch", "/api/me").send(profile)).status).toBe(200);
    expect((await authed("get", "/api/me")).body).toMatchObject(profile);
    expect((await authed("patch", "/api/me").send({ ...profile, isPlatformAdmin: true })).status).toBe(400);
  });
  it("atomically creates a draft organization, owner, location, employee and configurable default policy", async () => {
    const [secondary] = await db.select().from(categories).where(eq(categories.slug, "haarentfernung"));
    const categoryIds = [categoryId, secondary!.id];
    expect((await authed("post", "/api/organizations").set("X-Forwarded-For", "192.0.2.83").send({ name: "Invalid categories", categoryId,
      categoryIds: [categoryId, randomUUID()] })).status).toBe(400);
    expect((await authed("post", "/api/organizations").set("X-Forwarded-For", "192.0.2.83").send({ name: "Repeated categories", categoryId,
      categoryIds: [categoryId, categoryId] })).status).toBe(400);
    const res = await authed("post", "/api/organizations").set("X-Forwarded-For", "192.0.2.83").send({ name: `Test Studio ${suffix}`, categoryId, categoryIds });
    expect(res.body.profile.categoryIds).toEqual(categoryIds);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    orgId = res.body.id; orgIds.push(orgId);
    locationId = res.body.locations[0].id;
    employeeId = res.body.employees[0].id;
    expect(res.body.role).toBe("owner");
    expect(res.body.locations[0].published).toBe(false);
    expect(res.body.policies[0]).toMatchObject({ version: 1, noticeHours: 24, lateFeeType: "percentage", lateFeeValue: 100, noShowFeeValue: 100 });
    expect(res.body.memberships[0]).toMatchObject({ userId: ownerId, role: "owner", status: "active" });
  });
  it("supports multiple organizations and protects unrelated businesses", async () => {
    const second = await authed("post", "/api/organizations").send({ name: `Second Studio ${suffix}`, categoryId });
    expect(second.status).toBe(201); orgIds.push(second.body.id);
    expect((await authed("get", "/api/organizations")).body).toHaveLength(2);
    const other = await authed("post", "/api/organizations", outsider).send({ name: `Other Studio ${suffix}`, categoryId });
    expect(other.status).toBe(201); otherOrg = other.body.id; orgIds.push(otherOrg);
    expect((await authed("get", `/api/organizations/${otherOrg}/workspace`)).status).toBe(403);
    expect((await authed("get", orgPath("/workspace"), outsider)).status).toBe(403);
  });
  it("rejects incomplete publication and does not leak draft profiles", async () => {
    expect((await authed("put", orgPath("/publication")).send({ locationId, published: true })).status).toBe(400);
    const workspace = await authed("get", orgPath("/workspace"));
    expect((await request(app).get(`/api/businesses/${workspace.body.locations[0].slug}`)).status).toBe(404);
  });
  it("saves resumable business identity and rejects invalid category or contact data", async () => {
    const profile = {
      name: `Test Studio ${suffix}`, description: "A real persisted test studio profile",
      contactEmail: "studio@example.com", phone: "+49 201 123456", website: "https://example.com", categoryId, onboardingStep: 2,
      socialUrl: "https://example.com/social", logoUrl: "https://example.com/logo.png",
    };
    expect((await authed("put", orgPath("/profile")).send({ ...profile, contactEmail: "invalid" })).status).toBe(400);
    expect((await authed("put", orgPath("/profile")).send({ ...profile, logoUrl: "javascript:alert(1)" })).status).toBe(400);
    expect((await authed("put", orgPath("/profile"), outsider).send(profile)).status).toBe(403);
    expect((await authed("put", orgPath("/profile")).send(profile)).status).toBe(200);
    expect((await authed("get", orgPath("/workspace"))).body.profile.onboardingStep).toBe(2);
  });
  it("validates structured arbitrary German locations, times and persisted settings", async () => {
    const location = {
      name: "Essen Standort", country: "DE", postalCode: "45127", city: "Essen", street: "Teststraße", houseNumber: "12a",
      addressExtra: "1. OG", district: "Mitte", timezone: "Europe/Berlin", latitude: null, longitude: null,
      leadTimeHours: 4, advanceBookingDays: 60, contactPreference: "email",
      openingHours: [{ weekday: 1, opens: "09:00", closes: "18:00" }],
    };
    expect((await authed("put", orgPath(`/locations/${locationId}`)).send({ ...location, postalCode: "123" })).status).toBe(400);
    expect((await authed("put", orgPath(`/locations/${locationId}`)).send({ ...location, openingHours: [{ weekday: 1, opens: "18:00", closes: "09:00" }] })).status).toBe(400);
    const saved = await authed("put", orgPath(`/locations/${locationId}`)).send(location);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.locations[0]).toMatchObject({ city: "Essen", street: "Teststraße", houseNumber: "12a", leadTimeHours: 4 });
  });
  it("creates dynamic service groups, variants and eligible employee assignments", async () => {
    const group = await authed("post", orgPath("/service-categories")).send({ name: "Special treatments" });
    expect(group.status).toBe(201);
    const service = {
      name: "Facial Test", description: "Persisted facial", locationId, categoryId: group.body.serviceCategories[0].id,
      priceCents: 5500, durationMinutes: 45, preparationMinutes: 5, cleanupMinutes: 10,
      published: true, onlineBooking: false, employeeIds: [employeeId],
      variants: [{ name: "Extended", priceCents: 7500, durationMinutes: 60 }],
    };
    const res = await authed("post", orgPath("/services")).send(service);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    serviceId = res.body.services[0].id;
    expect(res.body.services[0]).toMatchObject({ priceCents: 5500, onlineBooking: false, employeeIds: [employeeId] });
    expect(res.body.services[0].variants[0].id).toBeTruthy();
    expect((await authed("put", `/api/organizations/${otherOrg}/services/${serviceId}`, outsider).send(service)).status).toBe(400);
    const otherView = await authed("get", `/api/organizations/${otherOrg}/workspace`, outsider);
    const validOtherTenantInput = { ...service, locationId: otherView.body.locations[0].id, categoryId: null, employeeIds: [], variants: [] };
    expect((await authed("put", `/api/organizations/${otherOrg}/services/${serviceId}`, outsider).send(validOtherTenantInput)).status).toBe(404);
    expect((await authed("delete", `/api/organizations/${otherOrg}/services/${serviceId}`, outsider)).status).toBe(404);
  });
  it("edits prices/durations while preserving stable service and variant identifiers", async () => {
    const initial = (await authed("get", orgPath("/workspace"))).body.services[0];
    const { id: _id, archived: _archived, ...input } = initial;
    const res = await authed("put", orgPath(`/services/${serviceId}`)).send({ ...input, priceCents: 6500, durationMinutes: 50 });
    expect(res.status).toBe(200);
    expect(res.body.services[0]).toMatchObject({ id: serviceId, priceCents: 6500, durationMinutes: 50 });
    expect(res.body.services[0].variants[0].id).toBe(initial.variants[0].id);
  });
  it("creates immutable policy versions and rejects invalid percentages", async () => {
    const policy = { noticeHours: 48, rescheduleNoticeHours: 2, lateFeeType: "percentage", lateFeeValue: 50, noShowFeeType: "fixed", noShowFeeValue: 10000, waiverAllowed: true, exceptions: "Individual waiver after review" };
    expect((await authed("put", orgPath("/policy")).send({ ...policy, lateFeeValue: 101 })).status).toBe(400);
    expect((await authed("put", orgPath("/policy")).send({ ...policy, rescheduleNoticeHours: 721 })).status).toBe(400);
    const res = await authed("put", orgPath("/policy")).send(policy);
    expect(res.status).toBe(200);
    expect(res.body.policies).toHaveLength(2);
    expect(res.body.policies[0]).toMatchObject({ version: 2, noticeHours: 48, rescheduleNoticeHours: 2 });
    expect(res.body.policies[1].noticeHours).toBe(24);
  });
  it("publishes only explicitly and public cities/services reflect actual saved data", async () => {
    const res = await authed("put", orgPath("/publication")).send({ locationId, published: true });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const publicProfile = await request(app).get(`/api/businesses/${res.body.locations[0].slug}`);
    expect(publicProfile.status).toBe(200);
    expect(publicProfile.body).toMatchObject({ city: "Essen", isDemo: false, country: "DE",
      phone: "+49 201 123456", website: "https://example.com", socialUrl: "https://example.com/social", logoUrl: "https://example.com/logo.png" });
    expect(publicProfile.body).not.toHaveProperty("contactEmail");
    const reviews = await request(app).get(`/api/businesses/${res.body.locations[0].slug}/reviews`);
    expect(reviews.body).toEqual({ count: 0, average: null, reviews: [] });
    expect(publicProfile.body.services[0]).toMatchObject({ name: "Facial Test", priceCents: 6500 });
    expect((await request(app).get("/api/marketplace/summary")).body.cities).toContain("Essen");
  });
  it("discovers a published business under both selected categories and updates membership", async () => {
    const [primary] = await db.select().from(categories).where(eq(categories.id, categoryId));
    const [secondary] = await db.select().from(categories).where(eq(categories.slug, "haarentfernung"));
    const headers = { "X-Forwarded-For": "192.0.2.84" };
    const match = (category: string) => request(app).get("/api/businesses").set(headers).query({ category, city: "Essen" });
    for (const category of [primary!.slug, secondary!.slug]) {
      const response = await match(category);
      expect(response.status).toBe(200);
      expect(response.body.filter(({ id }: { id: string }) => id === locationId)).toHaveLength(1);
    }
    const catalog = await request(app).get("/api/categories").set(headers);
    expect(catalog.body).toHaveLength(10);
    expect(catalog.body).toContainEqual(expect.objectContaining({ slug: secondary!.slug, businessCount: 1 }));
    const workspace = await authed("get", orgPath("/workspace")).set(headers);
    expect(workspace.body.profile.categoryIds).toEqual([categoryId, secondary!.id]);
    const updated = await authed("put", orgPath("/profile")).set(headers).send({ ...workspace.body.profile, categoryIds: [categoryId] });
    expect(updated.status).toBe(200);
    expect(updated.body.profile.categoryIds).toEqual([categoryId]);
    expect((await match(secondary!.slug)).body).toEqual([]);
    expect((await match(primary!.slug)).body).toContainEqual(expect.objectContaining({ id: locationId }));
  });

  it("quotes a multi-service selection using persisted prices, durations and buffers", async () => {
    const listing = (await authed("get", orgPath("/workspace"))).body.locations.find((entry: { id: string }) => entry.id === locationId);
    const path = `/api/businesses/${listing.slug}/booking-quote`;
    const [variant] = await db.select().from(serviceVariants).where(eq(serviceVariants.serviceId, serviceId));
    const selection = { items: [{ serviceId }, { serviceId, variantId: variant!.id, priceCents: 1 }] };
    expect((await request(app).post(path).send(selection)).status).toBe(404);
    await db.update(services).set({ onlineBooking: true }).where(eq(services.id, serviceId));
    try {
      const response = await request(app).post(path).send(selection);
      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.body).toMatchObject({
        priceCents: 14000, durationMinutes: 110, occupiedMinutes: 140,
        items: [{ variantId: null, priceCents: 6500 }, { variantId: variant!.id, priceCents: 7500 }],
      });
      expect((await request(app).post(path).send({ items: [] })).status).toBe(400);
      expect((await request(app).post(path).send({ items: [{ serviceId, variantId: randomUUID() }] })).status).toBe(404);
      const otherWorkspace = await authed("get", `/api/organizations/${otherOrg}/workspace`, outsider);
      expect((await request(app).post(`/api/businesses/${otherWorkspace.body.locations[0].slug}/booking-quote`).send(selection)).status).toBe(404);
    } finally {
      await db.update(services).set({ onlineBooking: false }).where(eq(services.id, serviceId));
    }
  });

  it("books, reschedules and cancels the same appointment shown to customer and business", async () => {
    const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
    const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId));
    const date = new Date(Date.now() + 7 * 86400000);
    date.setUTCDate(date.getUTCDate() + (8 - date.getUTCDay()) % 7);
    const day = date.toISOString().slice(0, 10);
    const business = `/api/businesses/${location!.slug}`;
    const settings = orgPath(`/locations/${locationId}/booking-settings`);
    const time = [{ weekday: 1, opens: "09:00", closes: "18:00" }];
    await db.update(services).set({ onlineBooking: true }).where(eq(services.id, serviceId));
    await db.update(employees).set({ workingHours: time }).where(eq(employees.id, employeeId));
    const [second] = await db.insert(employees).values({ organizationId: orgId, locationId, displayName: "Second booking employee", workingHours: time }).returning();
    await db.insert(employeeServices).values({ employeeId: second!.id, serviceId });
    const items = [{ serviceId }];
    try {
      const resource = await authed("post", settings + "/resources").send({ name: "QA chair", serviceIds: [serviceId] });
      expect(resource.status).toBe(201);
      const slots = async () => {
        const response = await request(app).post(business + "/availability").send({ date: day, items });
        expect(response.status).toBe(200);
        return response.body;
      };
      const initial = await slots();
      const withDate = await request(app).get("/api/businesses").query({ service: "Facial Test", date: day });
      expect(withDate.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: locationId })]));
      const closedDate = new Date(+date + 86400000).toISOString().slice(0, 10);
      expect((await request(app).get("/api/businesses").query({ service: "Facial Test", date: closedDate })).body).toEqual([]);
      const first = initial.slots.find((slot: { employeeId: string }) => slot.employeeId === employeeId);
      const simultaneous = initial.slots.find((slot: { employeeId: string; startsAt: string }) =>
        slot.employeeId === second!.id && slot.startsAt === first.startsAt);
      expect(+new Date(first.endsAt) - +new Date(first.startsAt)).toBe(65 * 60000);
      const method = await authed("post", "/api/me/payment-methods/simulated");
      expect(method.status).toBe(200);
      expect((await authed("post", "/api/me/payment-methods/simulated").send({ cardNumber: "fake" })).status).toBe(400);
      const otherMethod = await authed("post", "/api/me/payment-methods/simulated", outsider);
      expect(otherMethod.status).toBe(200);
      const bookingPayload = { items, employeeId, paymentMethodId: method.body.id, acceptPolicy: true, startsAt: first.startsAt, idempotencyKey: randomUUID(),
        policyVersion: initial.policy.version, expectedPriceCents: initial.quote.priceCents };
      const reserve = (payload: typeof bookingPayload, user = owner) => authed("post", business + "/bookings", user).send(payload);
      const slotPath = settings + "/online-slots";
      const slotCall = (method: "post" | "put", actor = owner) =>
        authed(method, slotPath, actor).set("X-Forwarded-For", "192.0.2.86");
      const toggle = (enabled: boolean) => slotCall("put").send({ item: items[0], startsAt: first.startsAt, enabled });
      expect((await slotCall("post", outsider).send({ item: items[0], date: day })).status).toBe(403);
      expect((await slotCall("post").send({ item: items[0], date: day })).body)
        .toContainEqual({ startsAt: first.startsAt, endsAt: [first.endsAt], enabled: true });
      try {
        expect((await toggle(false)).status).toBe(204);
        expect((await toggle(false)).status).toBe(204);
        expect((await slotCall("post").send({ item: items[0], date: day })).body)
          .toContainEqual({ startsAt: first.startsAt, endsAt: [first.endsAt], enabled: false });
        const visible = await request(app).post(business + "/availability").set("X-Forwarded-For", "192.0.2.86").send({ date: day, items });
        expect(visible.body.slots.some((slot: { startsAt: string }) => slot.startsAt === first.startsAt)).toBe(false);
        expect((await authed("post", business + "/bookings").set("X-Forwarded-For", "192.0.2.86").send(bookingPayload)).status).toBe(409);
      } finally {
        expect((await toggle(true)).status).toBe(204);
      }
      expect((await reserve({ ...bookingPayload, paymentMethodId: otherMethod.body.id })).status).toBe(412);
      expect((await reserve({ ...bookingPayload, acceptPolicy: false })).status).toBe(400);
      expect((await reserve({ ...bookingPayload, expectedPriceCents: 1 })).status).toBe(409);
      const [one, two] = await Promise.all([reserve(bookingPayload), reserve(bookingPayload)]);
      expect([one.status, two.status].sort()).toEqual([200, 201]);
      expect(one.body.id).toBe(two.body.id);
      const id = one.body.id;
      const [existing] = await db.select().from(reservations).where(eq(reservations.id, id));
      const clone = { ...existing!, id: randomUUID(), idempotencyKey: randomUUID() };
      await expect(db.transaction(async (tx) => {
        await tx.insert(reservations).values(clone);
      })).rejects.toMatchObject({ cause: { code: "23P01", constraint: "booking_staff_no_overlap" } });
      await expect(db.transaction(async (tx) => {
        await tx.insert(reservations).values({ ...clone, employeeId: second!.id, items: clone.items.map((line) => ({ ...line, employeeId: second!.id })) });
        await tx.insert(bookingResourceReservations).values({
          bookingId: clone.id, resourceId: resource.body.id, startsAt: clone.startsAt, endsAt: clone.endsAt,
        });
      })).rejects.toMatchObject({ cause: { code: "23P01", constraint: "booking_resource_no_overlap" } });
      expect((await reserve({ ...bookingPayload, idempotencyKey: randomUUID(), paymentMethodId: otherMethod.body.id }, outsider)).status).toBe(409);
      expect((await reserve({ ...bookingPayload, employeeId: simultaneous.employeeId, idempotencyKey: randomUUID(), paymentMethodId: otherMethod.body.id }, outsider)).status).toBe(409);
      expect((await authed("post", settings + "/blocks").send({ startsAt: first.startsAt, endsAt: first.endsAt, reason: "Holiday" })).status).toBe(409);
      const calendar = orgPath("/booking-calendar");
      const range = { from: new Date(+date - 86400000).toISOString(), to: new Date(+date + 86400000).toISOString() };
      expect((await authed("get", calendar).query(range)).body).toEqual([expect.objectContaining({ id, status: "confirmed" })]);
      expect((await authed("get", calendar, outsider).query(range)).status).toBe(403);
      expect((await authed("get", "/api/me/bookings", outsider)).body).toEqual([]);
      expect((await authed("post", `/api/me/bookings/${id}/cancel`, outsider)).status).toBe(404);
      expect((await authed("post", business + "/waitlist", outsider).send({ date: day })).status).toBe(204);
      expect((await authed("get", "/api/me/booking-waitlist", outsider)).body).toEqual([expect.objectContaining({ openedAt: null })]);
      expect((await authed("get", "/api/me/booking-waitlist")).body).toEqual([]);
      const alternative = (await slots()).slots.find((slot: { startsAt: string; employeeId: string }) =>
        slot.employeeId === employeeId && slot.startsAt >= first.endsAt);
      const moved = await authed("post", `/api/me/bookings/${id}/reschedule`).send({ employeeId, startsAt: alternative.startsAt });
      expect(moved.status).toBe(200);
      expect(moved.body.startsAt).toBe(alternative.startsAt);
      expect((await authed("get", calendar).query(range)).body[0].startsAt).toBe(alternative.startsAt);
      const officePath = `${calendar}/${id}`;
      const officeSlots = await authed("post", officePath + "/availability").send({ date: day });
      expect(officeSlots.status).toBe(200);
      const officeSlot = officeSlots.body.slots.find((slot: { startsAt: string; employeeId: string }) =>
        slot.employeeId === employeeId && slot.startsAt > alternative.startsAt);
      const officeMove = await authed("post", officePath + "/reschedule").send({
        startsAt: officeSlot.startsAt, employeeId, expectedStartsAt: alternative.startsAt, expectedEmployeeId: employeeId,
      });
      expect(officeMove.status).toBe(200);
      expect((await authed("get", "/api/me/bookings")).body).toEqual([
        expect.objectContaining({ id, startsAt: officeSlot.startsAt }),
      ]);

      expect((await authed("post", `/api/me/bookings/${id}/cancel`)).status).toBe(204);
      expect((await authed("get", calendar).query(range)).body[0].status).toBe("cancelled");
      expect((await authed("get", `/api/me/bookings/${id}/events`)).body.map((event: { kind: string }) => event.kind))
        .toEqual(["confirmed", "rescheduled", "rescheduled", "cancelled"]);
      expect((await slots()).slots.some((slot: { startsAt: string; employeeId: string }) =>
        slot.startsAt === alternative.startsAt && slot.employeeId === employeeId)).toBe(true);
      const block = await authed("post", settings + "/blocks").send({ startsAt: first.startsAt, endsAt: first.endsAt, reason: "Holiday" });
      expect(block.status).toBe(201);
      expect((await slots()).slots.some((slot: { startsAt: string }) => slot.startsAt === first.startsAt)).toBe(false);
      expect((await authed("delete", settings + "/blocks/" + block.body.id)).status).toBe(204);
      expect((await authed("post", business + "/waitlist", outsider).send({ date: day })).status).toBe(204);
      expect((await authed("post", business + "/waitlist", outsider).send({ date: day })).status).toBe(204);
      expect((await authed("get", calendar + "/waitlist")).body).toHaveLength(1);
      expect((await authed("get", "/api/me/booking-waitlist", outsider)).body).toEqual([expect.objectContaining({ openedAt: expect.any(String) })]);
      expect((await authed("delete", `/api/me/booking-waitlist/${locationId}/${day}`, outsider)).status).toBe(204);
      expect((await authed("get", calendar + "/waitlist")).body).toEqual([]);
      const competition = await Promise.all([
        reserve({ ...bookingPayload, startsAt: first.startsAt, idempotencyKey: randomUUID() }),
        reserve({ ...bookingPayload, startsAt: first.startsAt, employeeId: simultaneous.employeeId,
          idempotencyKey: randomUUID(), paymentMethodId: otherMethod.body.id }, outsider),
      ]);
      expect(competition.map(({ status }) => status).sort()).toEqual([201, 409]);

    } finally {
      await db.delete(reservations).where(eq(reservations.locationId, locationId));
      await db.delete(paymentReferences).where(and(eq(paymentReferences.provider, "beautyhub-simulated"), eq(paymentReferences.userId, ownerId)));
      const [testOutsider] = await db.select({ id: users.id }).from(users).where(eq(users.externalIdentityId, outsider));
      if (testOutsider) await db.delete(paymentReferences).where(and(eq(paymentReferences.provider, "beautyhub-simulated"), eq(paymentReferences.userId, testOutsider.id)));
      await db.delete(employeeServices).where(eq(employeeServices.employeeId, second!.id));
      await db.delete(employees).where(eq(employees.id, second!.id));
      await db.update(employees).set({ workingHours: employee!.workingHours }).where(eq(employees.id, employeeId));
      await db.update(services).set({ onlineBooking: false }).where(eq(services.id, serviceId));
    }
  });

  it("quotes exact professional prices and keeps historical snapshots after an override changes", async () => {
    const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
    const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId));
    const [variant] = await db.select().from(serviceVariants).where(eq(serviceVariants.serviceId, serviceId));
    const date = new Date(Date.now() + 7 * 86400000);
    date.setUTCDate(date.getUTCDate() + (8 - date.getUTCDay()) % 7);
    const day = date.toISOString().slice(0, 10);
    const business = `/api/businesses/${location!.slug}`;
    const settings = orgPath(`/locations/${locationId}/professional-pricing`);
    const choices = { differentialPricing: true, allowProfessionalChoice: true, allowAnyProfessional: true };
    const offer = { employeeId, serviceId, variantId: variant!.id, priceCents: 8700, durationMinutes: 70 };
    await db.update(employees).set({ workingHours: [{ weekday: 1, opens: "09:00", closes: "18:00" }] }).where(eq(employees.id, employeeId));
    await db.update(services).set({ onlineBooking: true }).where(eq(services.id, serviceId));
    try {
      expect((await authed("put", settings, outsider).send(choices)).status).toBe(403);
      expect((await authed("put", `/api/organizations/${otherOrg}/locations/${locationId}/professional-pricing/overrides`, outsider).send(offer)).status).toBe(404);
      expect((await authed("put", settings).send(choices)).status).toBe(204);
      expect((await authed("put", settings + "/overrides").send(offer)).status).toBe(204);
      const items = [{ serviceId }, { serviceId, variantId: variant!.id }];
      const find = () => request(app).post(business + "/availability").send({ date: day, items, professionalId: employeeId });
      const response = await find();
      expect(response.status).toBe(200);
      expect(response.body.slots.length).toBeGreaterThan(0);
      const slot = response.body.slots[0];
      expect(slot).toMatchObject({ employeeId, quote: {
        priceCents: 15200, durationMinutes: 120, occupiedMinutes: 150,
        items: [expect.objectContaining({ priceCents: 6500, employeeId }), expect.objectContaining({ priceCents: 8700, employeeId })],
      } });
      const unavailable = await request(app).post(business + "/availability").send({ date: day, items, professionalId: randomUUID() });
      expect(unavailable.body.slots).toEqual([]);
      const payment = await authed("post", "/api/me/payment-methods/simulated");
      const payload = { items, employeeId, startsAt: slot.startsAt, paymentMethodId: payment.body.id, acceptPolicy: true,
        idempotencyKey: randomUUID(), policyVersion: response.body.policy.version };
      expect((await authed("post", business + "/bookings").send({ ...payload, expectedPriceCents: response.body.quote.priceCents })).status).toBe(409);
      expect((await authed("post", business + "/bookings").send({ ...payload, expectedPriceCents: slot.quote.priceCents,
        expectedEndsAt: slot.startsAt })).status).toBe(409);
      const booked = await authed("post", business + "/bookings").send({ ...payload, expectedPriceCents: slot.quote.priceCents, expectedEndsAt: slot.endsAt });
      expect(booked.status).toBe(201);
      expect((await authed("put", settings + "/overrides").send({ ...offer, priceCents: 9000 })).status).toBe(204);
      expect((await authed("get", "/api/me/bookings")).body).toEqual([expect.objectContaining({ id: booked.body.id, priceCents: 15200 })]);
      expect((await authed("put", settings).send({ ...choices, differentialPricing: false, allowProfessionalChoice: false })).status).toBe(204);
      const automatic = await request(app).post(business + "/availability").send({ date: day, items });
      expect(automatic.body.professionalChoice).toEqual({ individual: false, any: true });
      expect(automatic.body.slots[0].quote.priceCents).toBe(14000);
    } finally {
      await db.delete(reservations).where(eq(reservations.locationId, locationId));
      await db.delete(paymentReferences).where(and(eq(paymentReferences.userId, ownerId), eq(paymentReferences.provider, "beautyhub-simulated")));
      await authed("put", settings + "/overrides").send({ ...offer, priceCents: null, durationMinutes: null });
      await authed("put", settings).send({ ...choices, differentialPricing: false });
      await db.update(employees).set({ workingHours: employee!.workingHours }).where(eq(employees.id, employeeId));
      await db.update(services).set({ onlineBooking: false }).where(eq(services.id, serviceId));
    }
  });

  it("reserves successive services with different professionals and releases each hold on cancellation", async () => {
    const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
    const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId));
    const date = new Date(Date.now() + 7 * 86400000);
    date.setUTCDate(date.getUTCDate() + (8 - date.getUTCDay()) % 7);
    const day = date.toISOString().slice(0, 10);
    const url = `/api/businesses/${location!.slug}`;
    const workingHours = [{ weekday: 1, opens: "09:00", closes: "18:00" }];
    const [secondService] = await db.insert(services).values({
      locationId, name: "Second treatment", description: "Test treatment", published: true, priceCents: 2500, durationMinutes: 30, onlineBooking: true,
    }).returning();
    const [secondProfessional] = await db.insert(employees).values({
      locationId, organizationId: orgId, displayName: "Second professional", publicName: "Second professional", workingHours,
    }).returning();
    const items = [{ serviceId }, { serviceId: secondService!.id }];
    await db.insert(employeeServices).values({ employeeId: secondProfessional!.id, serviceId: secondService!.id });
    await db.update(employees).set({ workingHours }).where(eq(employees.id, employeeId));
    await db.update(services).set({ onlineBooking: true }).where(eq(services.id, serviceId));
    const reviewBookings: string[] = [];
    const allNotifications = () => db.select({ notification: bookingNotifications, event: bookingEvents })
      .from(bookingNotifications).innerJoin(bookingEvents, eq(bookingEvents.id, bookingNotifications.eventId))
      .innerJoin(reservations, eq(reservations.id, bookingEvents.bookingId)).where(eq(reservations.locationId, locationId));
    vi.stubEnv("BEAUTYHUB_BOOKING_EMAIL_MODE", "capture");
    vi.stubEnv("BEAUTYHUB_BOOKING_EMAIL_APP_URL", "http://localhost:18082/");
    try {
      const dates = await request(app).post(url + "/available-dates").send({ from: day, items });
      expect(dates.status).toBe(200);
      expect(dates.body).toHaveLength(7);
      expect(dates.body[0]).toEqual({ date: day, available: true });
      expect(dates.body.slice(1).every((entry: { available: boolean }) => !entry.available)).toBe(true);
      const response = await request(app).post(url + "/availability").send({ date: day, items });
      expect(response.status).toBe(200);
      const slot = response.body.slots[0];
      expect(slot).toMatchObject({ mixed: true, employeeId, quote: { priceCents: 9000, items: [
        expect.objectContaining({ employeeId }),
        expect.objectContaining({ employeeId: secondProfessional!.id }),
      ] } });
      const payment = await authed("post", "/api/me/payment-methods/simulated");
      const payload = { items, employeeId, startsAt: slot.startsAt, expectedEndsAt: slot.endsAt,
        expectedPriceCents: slot.quote.priceCents, paymentMethodId: payment.body.id, acceptPolicy: true,
        idempotencyKey: randomUUID(), policyVersion: response.body.policy.version, appointmentNote: "  Fragrance-free products, please.  " };
      expect((await authed("post", url + "/bookings").send({ ...payload, expectedProfessionals: [employeeId, employeeId] })).status).toBe(409);
      expect(await allNotifications()).toEqual([]);
      const bookingPayload = { ...payload, expectedProfessionals: [employeeId, secondProfessional!.id] };
      const booking = await authed("post", url + "/bookings").send(bookingPayload);
      expect(booking.status).toBe(201);
      expect((await authed("post", url + "/bookings").send(bookingPayload)).status).toBe(200);
      const notifications = await allNotifications();
      expect(notifications).toHaveLength(1);
      const confirmation = notifications[0]!.notification;
      expect(confirmation.payload.to).toBe(owner + "@example.com");
      expect(confirmation.payload.text).toContain("Second professional");
      expect(confirmation.payload.text).toContain("90,00");
      expect(confirmation.payload.html).toContain("http://localhost:18082/konto");
      expect(confirmation.payload.calendar).toContain("SEQUENCE:0");
      expect(confirmation.payload.text).not.toContain(payload.appointmentNote.trim());
      const failed = vi.fn(async () => { throw new Error("test failure"); });
      const now = new Date();
      expect(await deliverNextBookingEmail(failed, now)).toBe(true);
      expect(await deliverNextBookingEmail(failed, now)).toBe(false);
      const provider = vi.fn(async () => undefined);
      const recovered = await Promise.all([
        deliverNextBookingEmail(provider, new Date(+now + 120_000)),
        deliverNextBookingEmail(provider, new Date(+now + 120_000)),
      ]);
      expect(recovered.sort()).toEqual([false, true]);
      expect(provider).toHaveBeenCalledExactlyOnceWith(confirmation.eventId, confirmation.payload);
      expect((await allNotifications())[0]!.notification).toMatchObject({ status: "delivered", attempts: 2 });
      expect(booking.body.appointmentNote).toBe("Fragrance-free products, please.");
      expect(booking.body.rescheduleNoticeHours).toBe(2);
      expect((await authed("get", "/api/me/bookings")).body[0].appointmentNote).toBe(booking.body.appointmentNote);
      expect((await authed("get", "/api/me/bookings", outsider)).body).toEqual([]);
      const staff = () => db.select().from(bookingStaffReservations).where(eq(bookingStaffReservations.bookingId, booking.body.id));
      const holds = (await staff()).sort((a, b) => a.position - b.position);
      expect(holds.map((hold) => hold.employeeId)).toEqual([employeeId, secondProfessional!.id]);
      expect(holds[0]!.endsAt).toEqual(holds[1]!.startsAt);
      const secondSlots = await request(app).post(url + "/availability").send({ date: day, items: [items[1]] });
      expect(secondSlots.body.slots.some((entry: { startsAt: string }) => entry.startsAt === holds[1]!.startsAt.toISOString())).toBe(false);
      const [stored] = await db.select().from(reservations).where(eq(reservations.id, booking.body.id));
      await expect(db.insert(reservations).values({ ...stored!, id: randomUUID(), idempotencyKey: randomUUID(),
        employeeId: secondProfessional!.id, items: [stored!.items[1]!],
        startsAt: holds[1]!.startsAt, endsAt: holds[1]!.endsAt,
      })).rejects.toMatchObject({ cause: { code: "23P01", constraint: "booking_staff_no_overlap" } });
      const moveUrl = `/api/me/bookings/${booking.body.id}`;
      const initialCalendar = await authed("get", moveUrl + "/calendar.ics");
      expect(initialCalendar.status).toBe(200);
      expect(initialCalendar.headers["content-type"]).toContain("text/calendar");
      expect(initialCalendar.text).toContain("UID:" + booking.body.id + "@appointments.beautyhub");
      expect(initialCalendar.text).toContain("SEQUENCE:0");
      expect(initialCalendar.text).toContain("Second treatment");
      expect(initialCalendar.text).not.toContain(payload.appointmentNote.trim());
      expect((await authed("get", moveUrl + "/calendar.ics", outsider)).status).toBe(404);
      const next = await authed("post", moveUrl + "/availability").send({ date: day });
      const later = next.body.slots.find((entry: { startsAt: string }) => entry.startsAt > slot.startsAt);
      expect(later.mixed).toBe(true);
      expect((await authed("post", moveUrl + "/reschedule").send({ startsAt: later.startsAt, employeeId })).status).toBe(200);
      expect((await staff()).find(({ position }) => position === 0)?.startsAt.toISOString()).toBe(later.startsAt);
      const updatedCalendar = await authed("get", moveUrl + "/calendar.ics");
      expect(updatedCalendar.text).toContain("SEQUENCE:1");
      expect(updatedCalendar.text).toContain("DTSTART:" + later.startsAt.replace(/[-:]|\.\d{3}/g, ""));
      await db.update(reservations).set({ policySnapshot: { ...stored!.policySnapshot, rescheduleNoticeHours: 720 } })
        .where(eq(reservations.id, booking.body.id));
      expect((await authed("post", moveUrl + "/availability").send({ date: day })).status).toBe(409);
      expect((await authed("post", moveUrl + "/reschedule").send({ startsAt: slot.startsAt, employeeId })).status).toBe(409);
      expect((await authed("post", moveUrl + "/cancel")).status).toBe(204);
      expect(await staff()).toEqual([]);
      const cancelledCalendar = await authed("get", moveUrl + "/calendar.ics");
      expect(cancelledCalendar.text).toContain("SEQUENCE:2");
      expect(cancelledCalendar.text).toContain("STATUS:CANCELLED");
      const lifecycle = await allNotifications();
      expect(lifecycle).toHaveLength(3);
      expect(lifecycle.find(({ event }) => event.kind === "rescheduled")?.notification.payload.calendar)
        .toContain("SEQUENCE:1");
      expect(lifecycle.find(({ event }) => event.kind === "cancelled")?.notification.payload.calendar)
        .toContain("STATUS:CANCELLED");
      const [paymentRecord] = await db.insert(appointmentPayments).values({
        bookingId: booking.body.id, actorId: ownerId, idempotencyKey: randomUUID(), kind: "deposit", method: "cash", amountCents: 1000,
      }).returning();
      await db.insert(appointmentRefunds).values({ paymentId: paymentRecord!.id, actorId: ownerId, idempotencyKey: randomUUID(),
        amountCents: 200, reason: "Internal cash note" });
      const history = await authed("get", moveUrl + "/payment-history");
      expect(history.status).toBe(200);
      expect(history.body).toMatchObject({ payments: [{ amountCents: 1000 }], refunds: [{ amountCents: 200 }] });
      expect(history.body.payments[0]).not.toHaveProperty("actorId");
      expect(history.body.refunds[0]).not.toHaveProperty("reason");
      expect((await authed("get", moveUrl + "/payment-history", outsider)).status).toBe(404);
      const [first, second, draft, cancelled, eligibleReview] = await db.insert(reservations).values(
        (["completed", "completed", "completed", "cancelled", "completed"] as const).map((status) => ({
          ...stored!, id: randomUUID(), idempotencyKey: randomUUID(), status,
        })),
      ).returning({ id: reservations.id });
      reviewBookings.push(first!.id, second!.id, draft!.id, cancelled!.id, eligibleReview!.id);
      await db.insert(bookingReviews).values([
        { bookingId: first!.id, comment: "First public review", reply: "Thank you", rating: 3, published: new Date(), createdAt: new Date(0) },
        { bookingId: second!.id, comment: "Second public review", rating: 5, published: new Date() },
        { bookingId: draft!.id, comment: "Private draft", rating: 1 },
        { bookingId: cancelled!.id, comment: "Cancelled booking", rating: 1, published: new Date() },
      ]);
      const sorted = await request(app).get(url + "/reviews").query({ sort: "lowest" });
      expect(sorted.body).toMatchObject({ count: 2, average: 4, reviews: [{ rating: 3, reply: "Thank you" }, { rating: 5 }] });
      expect(Object.keys(sorted.body.reviews[0]).sort()).toEqual(["comment", "date", "id", "rating", "reply"]);
      const highest = await request(app).get(url + "/reviews").query({ sort: "highest" });
      expect(highest.body.reviews[0].rating).toBe(5);
      const reviewPath = "/api/me/bookings/" + eligibleReview!.id + "/review";
      const submission = { rating: 4, comment: "  Verified visit  " };
      expect((await authed("post", reviewPath, outsider).send(submission)).status).toBe(404);
      expect((await authed("post", "/api/me/bookings/" + cancelled!.id + "/review").send(submission)).status).toBe(409);
      expect((await authed("post", reviewPath).send({ ...submission, rating: 6 })).status).toBe(400);
      const attempts = await Promise.all([submission, submission].map((body) => authed("post", reviewPath).send(body)));
      expect(attempts.map(({ status }) => status).sort()).toEqual([201, 409]);
      expect((await authed("get", "/api/me/bookings")).body).toContainEqual(
        expect.objectContaining({ id: eligibleReview!.id, reviewRating: 4 }));
      expect((await request(app).get(url + "/reviews")).body).toMatchObject({ count: 3, average: 4,
        reviews: expect.arrayContaining([expect.objectContaining({ rating: 4, comment: "Verified visit" })]) });
      const businessReviews = orgPath("/reviews");
      const listing = await authed("get", businessReviews);
      expect(listing.status).toBe(200);
      expect(listing.body.reviews).toHaveLength(3);
      expect(Object.keys(listing.body.reviews[0]).sort()).toEqual(["comment", "date", "id", "location", "rating", "reply"]);
      expect((await authed("get", businessReviews, outsider)).status).toBe(403);
      const reviewId = listing.body.reviews.find((row: { comment: string }) => row.comment === "Verified visit").id;
      const replyPath = businessReviews + "/" + reviewId + "/reply";
      const reply = { reply: "  Thanks for visiting  " };
      expect((await authed("put", replyPath, outsider).send(reply)).status).toBe(403);
      expect((await authed("put", "/api/organizations/" + otherOrg + "/reviews/" + reviewId + "/reply", outsider)
        .send(reply)).status).toBe(404);
      const [hidden] = await db.select({ id: bookingReviews.id }).from(bookingReviews).where(eq(bookingReviews.bookingId, draft!.id));
      expect((await authed("put", businessReviews + "/" + hidden!.id + "/reply").send(reply)).status).toBe(404);
      expect((await authed("put", replyPath).send(reply)).body.reply).toBe("Thanks for visiting");
      expect((await request(app).get(url + "/reviews")).body.reviews).toContainEqual(
        expect.objectContaining({ id: reviewId, reply: "Thanks for visiting" }));
      expect((await authed("put", replyPath).send({ reply: "" })).body.reply).toBe("");
      const reportPath = "/api/me/reviews/" + reviewId + "/report";
      const report = { reason: "personal_information", details: "  Please review the comment.  " };
      expect((await request(app).post(reportPath).send(report)).status).toBe(401);
      expect((await authed("post", reportPath, outsider).send({ reason: "invalid" })).status).toBe(400);
      expect((await authed("post", "/api/me/reviews/" + hidden!.id + "/report", outsider).send(report)).status).toBe(404);
      const reports = await Promise.all([report, report].map((body) => authed("post", reportPath, outsider).send(body)));
      expect(reports.map(({ status }) => status)).toEqual([204, 204]);
      expect((await authed("post", reportPath, outsider).send({ reason: "spam" })).status).toBe(204);
      expect(await db.select().from(bookingReviewReports).where(eq(bookingReviewReports.reviewId, reviewId)))
        .toEqual([expect.objectContaining({ reason: "personal_information", details: "Please review the comment." })]);
      expect((await request(app).get(url + "/reviews")).body).toMatchObject({ count: 3, average: 4,
        reviews: expect.arrayContaining([expect.objectContaining({ id: reviewId, comment: "Verified visit" })]) });
      const moderation = "/api/admin/review-moderation";
      const decision = moderation + "/" + reviewId;
      expect((await request(app).get(moderation)).status).toBe(401);
      expect((await authed("get", moderation)).status).toBe(403);
      expect((await authed("put", decision).send({ action: "hide" })).status).toBe(403);
      expect((await authed("get", "/api/me", worker)).status).toBe(200);
      await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.externalIdentityId, worker));
      try {
        const queue = await authed("get", moderation, worker);
        expect(queue.status).toBe(200);
        expect(queue.body.reviews).toContainEqual(expect.objectContaining({ id: reviewId, hidden: false,
          report: { reason: "personal_information", details: "Please review the comment.", pendingCount: 1,
            reportedAt: expect.any(String) } }));
        expect((await authed("put", decision, worker).send({ action: "hide" })).status).toBe(204);
        expect((await request(app).get(url + "/reviews")).body).toMatchObject({ count: 2, average: 4 });
        expect((await authed("put", replyPath).send(reply)).status).toBe(404);
        expect((await authed("post", reportPath, outsider).send(report)).status).toBe(404);
        expect((await authed("get", moderation, worker)).body.reviews).toContainEqual(
          expect.objectContaining({ id: reviewId, hidden: true, report: null }));
        expect((await authed("put", decision, worker).send({ action: "restore" })).status).toBe(204);
        expect((await request(app).get(url + "/reviews")).body).toMatchObject({ count: 3 });
        expect((await authed("post", reportPath).send({ reason: "spam" })).status).toBe(204);
        expect((await authed("put", decision, worker).send({ action: "dismiss" })).status).toBe(204);
        expect((await authed("get", moderation, worker)).body.reviews).toEqual([]);
        expect((await request(app).get(url + "/reviews")).body).toMatchObject({ count: 3 });
        const directory = "/api/admin/businesses";
        const businessDecision = directory + "/" + orgId;
        const platform = (method: "get" | "put", path: string, user = worker) =>
          authed(method, path, user).set("X-Forwarded-For", "192.0.2.71");
        expect((await platform("get", directory, owner)).status).toBe(403);
        expect((await platform("put", businessDecision, owner).send({ action: "suspend" })).status).toBe(403);
        const listed = await platform("get", directory);
        expect(listed.body.businesses).toContainEqual(expect.objectContaining({ id: orgId, locationCount: 1 }));
        expect((await platform("put", businessDecision).send({ action: "verify" })).body.verifiedAt).toBeTruthy();
        expect((await request(app).get(url)).body.verified).toBe(true);
        const suspensions = await Promise.all(["suspend", "suspend"].map((action) => platform("put", businessDecision).send({ action })));
        expect(suspensions.map(({ status }) => status)).toEqual([200, 200]);
        expect((await request(app).get(url)).status).toBe(404);
        expect((await request(app).get(url + "/reviews")).status).toBe(404);
        expect((await request(app).post(url + "/booking-quote").send({ items })).status).toBe(404);
        expect((await request(app).post(url + "/availability").send({ date: day, items })).status).toBe(404);
        expect((await platform("get", orgPath("/workspace"), owner)).status).toBe(200);
        expect((await platform("put", businessDecision).send({ action: "reactivate" })).body.suspendedAt).toBeNull();
        expect((await request(app).get(url)).body.verified).toBe(true);
        expect((await platform("put", businessDecision).send({ action: "unverify" })).body.verifiedAt).toBeNull();
        expect((await request(app).get(url)).body.verified).toBe(false);
        expect((await db.select({ action: auditEvents.action }).from(auditEvents).where(eq(auditEvents.targetId, orgId)))
          .filter(({ action }) => action.startsWith("platform.business.")).map(({ action }) => action).sort())
          .toEqual(["platform.business.reactivate", "platform.business.suspend", "platform.business.unverify", "platform.business.verify"]);
        const audit = await db.select({ action: auditEvents.action }).from(auditEvents).where(eq(auditEvents.targetId, reviewId));
        expect(audit.map(({ action }) => action).sort()).toEqual([
          "review_moderation_dismiss", "review_moderation_hide", "review_moderation_restore",
        ]);
      } finally {
        await db.update(users).set({ isPlatformAdmin: false }).where(eq(users.externalIdentityId, worker));
      }
      const campaigns = orgPath("/marketing-campaigns");
      const marketing = (method: "get" | "post" | "put", path: string, user = owner) =>
        authed(method, path, user).set("X-Forwarded-For", "192.0.2.65");
      const consentPath = "/api/me/business-marketing/" + orgId;
      const preferences = await marketing("get", "/api/me/business-marketing");
      expect(preferences.body).toContainEqual(expect.objectContaining({ organizationId: orgId, consent: false }));
      expect((await marketing("get", campaigns + "/audience").query({ segment: "repeat" })).body).toEqual({ count: 0 });
      expect((await marketing("put", consentPath, outsider).send({ consent: true })).status).toBe(404);
      expect((await marketing("put", consentPath).send({ consent: true })).status).toBe(204);
      expect((await marketing("get", campaigns + "/audience").query({ segment: "repeat" })).body).toEqual({ count: 1 });
      expect((await marketing("get", campaigns + "/audience", outsider).query({ segment: "repeat" })).status).toBe(403);
      expect((await marketing("get", "/api/organizations/" + otherOrg + "/marketing-campaigns/audience", outsider)
        .query({ segment: "completed" })).body).toEqual({ count: 0 });
      const campaignDraft = { title: "Retention draft", subject: "Studio update", body: "An example draft.", segment: "repeat" };
      const saved = await marketing("post", campaigns).send(campaignDraft);
      expect(saved.status).toBe(201);
      expect((await marketing("put", "/api/organizations/" + otherOrg + "/marketing-campaigns/" + saved.body.id, outsider)
        .send(campaignDraft)).status).toBe(404);
      expect((await marketing("put", campaigns + "/" + saved.body.id).send({ ...campaignDraft, subject: "Updated draft" })).status).toBe(200);
      expect((await marketing("get", campaigns)).body).toEqual([expect.objectContaining({ subject: "Updated draft" })]);
      const templatesPath = campaigns.replace("marketing-campaigns", "marketing-templates");
      const template = await marketing("post", templatesPath).send(campaignDraft);
      expect(template.status).toBe(201);
      expect((await marketing("get", templatesPath, outsider)).status).toBe(403);
      const otherTemplates = "/api/organizations/" + otherOrg + "/marketing-templates";
      expect((await marketing("get", otherTemplates, outsider)).body).toEqual([]);
      expect((await marketing("put", otherTemplates + "/" + template.body.id, outsider)
        .send(campaignDraft)).status).toBe(404);
      expect((await marketing("put", templatesPath + "/" + template.body.id)
        .send({ ...campaignDraft, subject: "Updated template" })).status).toBe(200);
      expect((await marketing("get", templatesPath)).body).toEqual([expect.objectContaining({ subject: "Updated template" })]);
      expect((await marketing("get", campaigns)).body).toEqual([expect.objectContaining({ subject: "Updated draft" })]);
      const capturePath = campaigns + "/" + saved.body.id + "/captures";
      const requestKey = { idempotencyKey: randomUUID() };
      vi.stubEnv("BEAUTYHUB_MARKETING_CAPTURE_APP_URL", "");
      expect((await marketing("post", capturePath).send(requestKey)).status).toBe(409);
      vi.stubEnv("BEAUTYHUB_MARKETING_CAPTURE_APP_URL", "http://localhost:18082/");
      expect((await marketing("post", capturePath, outsider).send(requestKey)).status).toBe(403);
      const captures = await Promise.all([requestKey, requestKey].map((body) => marketing("post", capturePath).send(body)));
      expect(captures.map(({ status }) => status).sort()).toEqual([200, 201]);
      expect(captures[0]!.body).toMatchObject({ count: 1 });
      expect(captures[0]!.body.id).toBe(captures[1]!.body.id);
      expect(captures[0]!.body).not.toHaveProperty("message");
      const captureId = captures[0]!.body.id;
      const [snapshot] = await db.select().from(marketingCaptures).where(eq(marketingCaptures.id, captureId));
      expect(snapshot?.subject).toBe("Updated draft");
      expect(snapshot?.message).toContain("http://localhost:18082/konto?business-marketing=" + orgId);
      expect(await db.select().from(marketingCapturedRecipients).where(eq(marketingCapturedRecipients.captureId, captureId)))
        .toEqual([expect.objectContaining({ userId: ownerId, email: owner + "@example.com" })]);
      expect((await marketing("put", consentPath).send({ consent: false })).status).toBe(204);
      expect((await marketing("get", campaigns + "/audience").query({ segment: "completed" })).body).toEqual({ count: 0 });
      const afterWithdrawal = await marketing("post", capturePath).send({ idempotencyKey: randomUUID() });
      expect(afterWithdrawal.status).toBe(201);
      expect(afterWithdrawal.body.count).toBe(0);
      const loyalty = orgPath("/loyalty");
      const balance = "/api/me/loyalty";
      expect((await authed("get", loyalty)).body).toEqual({ pointsPerVisit: 0 });
      expect((await authed("get", balance)).body).toEqual([]);
      expect((await authed("put", loyalty, outsider).send({ pointsPerVisit: 8 })).status).toBe(403);
      expect((await authed("put", loyalty).send({ pointsPerVisit: 1001 })).status).toBe(400);
      expect((await authed("put", loyalty).send({ pointsPerVisit: 8 })).body).toEqual({ pointsPerVisit: 8 });
      const completeVisit = async (daysAgo: number, userId: string | null, status: "completed" | "no_show", retry = false, single = false) => {
        const startsAt = new Date(Date.now() - daysAgo * 86400000);
        const item = stored!.items[0]!;
        const duration = single ? (item.preparationMinutes + item.durationMinutes + item.cleanupMinutes) * 60000
          : +stored!.endsAt - +stored!.startsAt;
        const [visit] = await db.insert(reservations).values({
          ...stored!, id: randomUUID(), idempotencyKey: randomUUID(), status: "confirmed",
          startsAt, endsAt: new Date(+startsAt + duration), userId,
          ...(single ? { items: [{ ...item, variantId: null, variantName: null }], priceCents: item.priceCents, durationMinutes: item.durationMinutes } : {}),
          ...(userId ? {} : { source: "walk_in" as const, guestName: "QA guest", paymentMethodId: null }),
        }).returning({ id: reservations.id });
        const path = orgPath("/booking-calendar/" + visit!.id + "/status");
        const response = await Promise.all(Array.from({ length: retry ? 2 : 1 }, () => authed("post", path).set("X-Forwarded-For", "192.0.2.68").send({ status })));
        expect(response.map((result) => result.status)).toEqual(retry ? [204, 204] : [204]);
        return visit!.id;
      };
      await completeVisit(5, ownerId, "completed", true);
      const guestVisit = await completeVisit(4, null, "completed");
      await completeVisit(3, ownerId, "no_show");
      expect((await authed("get", balance)).body).toEqual([expect.objectContaining({ organizationId: orgId, points: 8 })]);
      expect((await authed("get", balance, outsider)).body).toEqual([]);
      expect((await authed("put", loyalty).send({ pointsPerVisit: 3 })).status).toBe(200);
      await completeVisit(2, ownerId, "completed");
      expect((await authed("put", loyalty).send({ pointsPerVisit: 0 })).status).toBe(200);
      await completeVisit(1, ownerId, "completed");
      expect((await authed("get", balance)).body).toEqual([expect.objectContaining({ organizationId: orgId, points: 11 })]);
      const loyaltyRequest = (method: "get" | "post" | "put", path: string, user = owner) =>
        authed(method, path, user).set("X-Forwarded-For", "192.0.2.66");
      const rewards = balance + "/rewards";
      const exchange = rewards + "/" + orgId;
      expect((await loyaltyRequest("post", exchange).send({ requestId: randomUUID() })).status).toBe(409);
      expect((await loyaltyRequest("put", loyalty).send({ pointsPerVisit: 39 })).status).toBe(200);
      const payableVisit = await completeVisit(7, ownerId, "completed");
      const requestIds = [randomUUID(), randomUUID()];
      const exchanges = await Promise.all(requestIds.map((requestId) => loyaltyRequest("post", exchange).send({ requestId })));
      expect(exchanges.map((result) => result.status).sort()).toEqual([200, 409]);
      const issuedIndex = exchanges.findIndex((result) => result.status === 200);
      const reward = exchanges[issuedIndex]!.body;
      expect(reward).toMatchObject({ discountCents: 500, redeemedAt: null });
      expect((await loyaltyRequest("post", exchange).send({ requestId: requestIds[issuedIndex] })).body).toEqual(reward);
      expect((await loyaltyRequest("get", balance)).body).toEqual([expect.objectContaining({ organizationId: orgId, points: 0 })]);
      expect((await loyaltyRequest("get", rewards, outsider)).body).toEqual([]);
      const pay = (id: string, amountCents: number) => loyaltyRequest("post", orgPath("/booking-calendar/" + id + "/payments"))
        .send({ idempotencyKey: randomUUID(), amountCents, kind: "settlement", method: "cash", voucherCode: reward.code });
      expect((await pay(guestVisit, stored!.priceCents - 500)).status).toBe(409);
      expect((await pay(payableVisit, stored!.priceCents - 499)).status).toBe(409);
      expect((await pay(payableVisit, stored!.priceCents - 500)).status).toBe(201);
      expect((await loyaltyRequest("get", rewards)).body).toEqual([expect.objectContaining({ code: reward.code, redeemedAt: expect.any(String) })]);



      const packageRequest = (method: "get" | "post" | "put", path: string, user = owner) =>
        authed(method, path, user).set("X-Forwarded-For", "192.0.2.67");
      const packagePath = orgPath("/service-packages");
      const customerPath = "/api/me/service-packages";
      const offerInput = { name: "QA two-visit package", serviceId: stored!.items[0]!.serviceId,
        visits: 2, priceCents: 9900, validDays: 90 };
      expect((await packageRequest("post", packagePath, outsider).send(offerInput)).status).toBe(403);
      const offer = await packageRequest("post", packagePath).send(offerInput);
      expect(offer.status).toBe(201);
      expect((await packageRequest("get", customerPath + "/offers")).body).toContainEqual(expect.objectContaining({ id: offer.body.id }));
      const buy = customerPath + "/offers/" + offer.body.id;
      const purchaseInput = { requestId: randomUUID(), expectedPriceCents: offerInput.priceCents };
      expect((await packageRequest("post", buy).send({ ...purchaseInput, expectedPriceCents: 1 })).status).toBe(409);
      const purchases = await Promise.all([purchaseInput, purchaseInput].map((body) => packageRequest("post", buy).send(body)));
      expect(purchases.map(({ status }) => status)).toEqual([200, 200]);
      expect(purchases[0]!.body).toEqual(purchases[1]!.body);
      expect((await packageRequest("get", customerPath, outsider)).body).toEqual([]);
      expect((await packageRequest("put", packagePath + "/" + offer.body.id).send({ active: false })).status).toBe(200);
      expect((await packageRequest("post", buy).send({ ...purchaseInput, requestId: randomUUID() })).status).toBe(404);
      const firstPackageVisit = await completeVisit(8, ownerId, "completed", false, true);
      const packagePayment = (id: string) => orgPath("/booking-calendar/" + id + "/payments");
      const apply = (id: string) => packageRequest("post", packagePayment(id) + "/package");
      expect((await apply(payableVisit)).status).toBe(409);
      expect((await Promise.all([apply(firstPackageVisit), apply(firstPackageVisit)])).map((result) => result.status)).toEqual([204, 204]);
      expect((await packageRequest("get", packagePayment(firstPackageVisit))).body)
        .toMatchObject({ packageCoveredCents: stored!.items[0]!.priceCents, outstandingCents: 0, paidCents: 0 });
      const nextVisit = await completeVisit(9, ownerId, "completed", false, true);
      const competingVisit = await completeVisit(10, ownerId, "completed", false, true);
      expect((await Promise.all([apply(nextVisit), apply(competingVisit)])).map((result) => result.status).sort()).toEqual([204, 409]);
      expect((await packageRequest("get", customerPath)).body).toEqual([expect.objectContaining({ remaining: 0 })]);
      const membership = await packageRequest("post", packagePath).send({ ...offerInput, name: "QA membership", kind: "membership" });
      expect(membership.status).toBe(201);
      const joinMembership = () => packageRequest("post", customerPath + "/offers/" + membership.body.id)
        .send({ ...purchaseInput, requestId: randomUUID() });
      const enrollments = await Promise.all([joinMembership(), joinMembership()]);
      expect(enrollments.map(({ status }) => status).sort()).toEqual([200, 409]);
      const enrolled = enrollments.find(({ status }) => status === 200)!;
      expect((await packageRequest("get", customerPath)).body).toContainEqual(
        expect.objectContaining({ id: enrolled.body.id, kind: "membership", remaining: 2 }));
      await db.update(customerPackages).set({ expiresAt: new Date(0) }).where(eq(customerPackages.id, enrolled.body.id));
      expect((await joinMembership()).status).toBe(200);

      const giftPath = orgPath("/pos-vouchers/gifts");
      expect((await packageRequest("post", giftPath, outsider).send({ discountCents: 1000 })).status).toBe(403);
      const giftInput = { discountCents: 1000, requestId: randomUUID() };
      const gift = await packageRequest("post", giftPath).send(giftInput);
      expect(gift.status).toBe(201);
      expect(gift.body).toMatchObject({ isGift: true, discountCents: 1000, code: expect.stringMatching(/^GESCHENK-[0-9A-F]{23}$/) });
      expect((await packageRequest("post", giftPath).send(giftInput)).body.code).toBe(gift.body.code);
      const giftPayment = (id: string) => packageRequest("post", packagePayment(id)).send({
        idempotencyKey: randomUUID(), amountCents: stored!.priceCents - 1000, kind: "settlement", method: "cash",
        voucherCode: gift.body.code,
      });
      expect((await giftPayment(guestVisit)).status).toBe(201);
      expect((await giftPayment(guestVisit)).status).toBe(409);
      const analyticsPath = orgPath("/analytics");
      const reportRequest = (path: string, user = owner) =>
        authed("get", path, user).set("X-Forwarded-For", "192.0.2.69");
      const reportFrom = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const reportTo = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
      const reportDates = { from: reportFrom, to: reportTo };
      expect((await reportRequest(analyticsPath, outsider).query(reportDates)).status).toBe(403);
      expect((await reportRequest(analyticsPath).query({ from: reportTo, to: reportFrom })).status).toBe(400);
      const foreign = (await reportRequest("/api/organizations/" + otherOrg + "/workspace", outsider)).body.locations[0].id;
      expect((await reportRequest(analyticsPath).query({ ...reportDates, locationId: foreign })).status).toBe(404);
      const metrics = await reportRequest(analyticsPath).query({ ...reportDates, locationId });
      expect(metrics.status).toBe(200);
      expect(metrics.body.locations).toHaveLength(1);
      const sourceBookings = await db.select().from(reservations).where(eq(reservations.locationId, locationId));
      const sourcePayments = await db.select().from(appointmentPayments)
        .where(inArray(appointmentPayments.bookingId, sourceBookings.map(({ id }) => id)));
      const sourceRefunds = await db.select().from(appointmentRefunds)
        .where(inArray(appointmentRefunds.paymentId, sourcePayments.map(({ id }) => id)));
      expect(metrics.body.locations[0]).toMatchObject({ id: locationId, bookings: sourceBookings.length,
        completed: sourceBookings.filter((entry) => entry.status === "completed").length,
        receivedCents: sourcePayments.reduce((sum, entry) => sum + entry.amountCents, 0),
        refundedCents: sourceRefunds.reduce((sum, entry) => sum + entry.amountCents, 0),
      });
      const secondStaffBookings = sourceBookings.filter((entry) => entry.status === "completed" &&
        entry.items.some((line) => line.employeeId === secondProfessional!.id));
      expect(metrics.body.staff).toContainEqual(expect.objectContaining({ id: secondProfessional!.id,
        completed: secondStaffBookings.length,
        minutes: secondStaffBookings.flatMap(({ items }) => items).filter((line) => line.employeeId === secondProfessional!.id)
          .reduce((sum, line) => sum + line.durationMinutes, 0),
      }));
      expect(metrics.body.marketing).toEqual({ captures: 2, recipients: 1 });
      const download = await reportRequest("/api/me/export");
      expect(download.status).toBe(200);
      expect(download.headers["cache-control"]).toBe("no-store");
      expect(download.headers["content-disposition"]).toContain("attachment");
      expect(download.body.records.bookings).toContainEqual(expect.objectContaining({ id: stored!.id }));
      expect(download.body.records.bookings).not.toContainEqual(expect.objectContaining({ id: guestVisit }));
      const exportedBooking = download.body.records.bookings.find((row: { id: string }) => row.id === stored!.id);
      expect(exportedBooking).not.toHaveProperty("employeeId");
      expect(exportedBooking.items[0]).not.toHaveProperty("employeeId");
      expect(download.body.records.payments).toContainEqual(expect.objectContaining({ amountCents: 1000, bookingId: stored!.id }));
      expect(download.body.records.refunds).toContainEqual(expect.objectContaining({ amountCents: 200 }));
      expect(download.body.records.refunds[0]).not.toHaveProperty("reason");
      expect(download.body.records.paymentMethods[0]).not.toHaveProperty("providerCustomerId");
      const otherExport = await reportRequest("/api/me/export", outsider);
      expect(otherExport.body.records.bookings).toEqual([]);
      expect(otherExport.body.records.payments).toEqual([]);

      const money = (rows: { receivedCents: number; refundedCents: number }[]) => rows.reduce((sum, row) =>
        ({ received: sum.received + row.receivedCents, refunded: sum.refunded + row.refundedCents }), { received: 0, refunded: 0 });
      const totals = { received: metrics.body.locations[0].receivedCents, refunded: metrics.body.locations[0].refundedCents };
      expect(money(metrics.body.services)).toEqual(totals);
      expect(money(metrics.body.staff)).toEqual(totals);
      expect(metrics.body.services).toContainEqual(expect.objectContaining({ id: stored!.items[0]!.serviceId, receivedCents: expect.any(Number) }));
      expect(metrics.body.customers).toEqual({ new: 1, repeat: 0 });
      const lastVisit = sourceBookings.filter((row) => row.status === "completed" && row.userId === ownerId)
        .sort((left, right) => +right.startsAt - +left.startsAt)[0]!;
      const returnDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", dateStyle: "short" }).format(lastVisit.startsAt);
      expect((await reportRequest(analyticsPath).query({ from: returnDay, to: returnDay, locationId })).body.customers)
        .toEqual({ new: 0, repeat: 1 });



      vi.stubEnv("BEAUTYHUB_BOOKING_EMAIL_MODE", "capture");
      vi.stubEnv("BEAUTYHUB_BOOKING_EMAIL_APP_URL", "http://localhost:18082/");
      vi.stubEnv("BEAUTYHUB_BOOKING_EMAIL_REMINDERS", "1");
      const [previousOptIn] = await db.select({ emailNotifications: users.emailNotifications }).from(users).where(eq(users.id, ownerId));
      try {
        await db.update(users).set({ emailNotifications: true }).where(eq(users.id, ownerId));
        const shift = (days: number) => {
          const startsAt = new Date(Date.now() + days * 86400000);
          return { startsAt, endsAt: new Date(+startsAt + +stored!.endsAt - +stored!.startsAt) };
        };
        const reminderBooking = await db.transaction(async (tx) => {
          const [visit] = await tx.insert(reservations).values({ ...stored!, ...shift(8), id: randomUUID(),
            idempotencyKey: randomUUID(), status: "confirmed" }).returning();
          await recordBookingEvent(tx, visit!, "confirmed");
          return visit!;
        });
        const reminderRows = () => db.select({ id: bookingNotifications.eventId, available: bookingNotifications.availableAt,
          payload: bookingNotifications.payload }).from(bookingNotifications).innerJoin(bookingEvents, eq(bookingEvents.id, bookingNotifications.eventId))
          .where(and(eq(bookingEvents.bookingId, reminderBooking.id), eq(bookingEvents.kind, "reminder")));
        const [originalReminder] = await reminderRows();
        expect(+originalReminder!.available).toBe(+reminderBooking.startsAt - 86400000);
        expect(originalReminder!.payload.subject).toContain("Terminerinnerung");
        await db.transaction(async (tx) => {
          const [rescheduledVisit] = await tx.update(reservations).set(shift(10))
            .where(eq(reservations.id, reminderBooking.id)).returning();
          await recordBookingEvent(tx, rescheduledVisit!, "rescheduled");
        });
        const [replacement] = await reminderRows();
        expect(await reminderRows()).toHaveLength(1);
        expect(replacement!.id).not.toBe(originalReminder!.id);
        expect(+replacement!.available).toBeGreaterThan(+originalReminder!.available);
        await db.update(users).set({ emailNotifications: false }).where(eq(users.id, ownerId));
        const deliver = vi.fn(async () => undefined);
        for (let i = 0; i < 40 && await deliverNextBookingEmail(deliver, replacement!.available); i++) { /* drain due items */ }
        expect(await reminderRows()).toEqual([]);
        expect(deliver.mock.calls).not.toContainEqual([replacement!.id, replacement!.payload]);
        vi.stubEnv("BEAUTYHUB_BOOKING_EMAIL_FOLLOW_UPS", "1");
        await db.update(users).set({ emailNotifications: true }).where(eq(users.id, ownerId));
        const followUps = () => db.select({ id: bookingNotifications.eventId, payload: bookingNotifications.payload,
          available: bookingNotifications.availableAt }).from(bookingNotifications)
          .innerJoin(bookingEvents, eq(bookingEvents.id, bookingNotifications.eventId))
          .innerJoin(reservations, eq(reservations.id, bookingEvents.bookingId))
          .where(and(eq(reservations.locationId, locationId), eq(bookingEvents.kind, "follow_up")));
        await completeVisit(11, ownerId, "completed");
        expect(await followUps()).toEqual([]);
        expect((await marketing("put", consentPath).send({ consent: true })).status).toBe(204);
        await completeVisit(12, ownerId, "completed");
        const [followUp] = await followUps();
        expect(followUp!.payload.text).toContain("business-marketing=" + orgId);
        expect((await marketing("put", consentPath).send({ consent: false })).status).toBe(204);
        for (let i = 0; i < 40 && await deliverNextBookingEmail(deliver, followUp!.available); i++) { /* drain due items */ }
        expect(await followUps()).toEqual([]);
        expect(deliver.mock.calls).not.toContainEqual([followUp!.id, followUp!.payload]);


      } finally {
        await db.update(users).set(previousOptIn!).where(eq(users.id, ownerId));
      }
    } finally {
      const offers = db.select({ id: servicePackages.id }).from(servicePackages).where(eq(servicePackages.organizationId, orgId));
      const purchased = db.select({ id: customerPackages.id }).from(customerPackages).where(inArray(customerPackages.packageId, offers));
      await db.delete(packageUses).where(inArray(packageUses.customerPackageId, purchased));
      await db.delete(customerPackages).where(inArray(customerPackages.packageId, offers));
      await db.delete(servicePackages).where(eq(servicePackages.organizationId, orgId));
      await db.delete(marketingCampaigns).where(eq(marketingCampaigns.organizationId, orgId));
      await db.delete(businessMarketingPreferences).where(eq(businessMarketingPreferences.organizationId, orgId));
      vi.unstubAllEnvs();
      if (reviewBookings.length) await db.delete(bookingReviews).where(inArray(bookingReviews.bookingId, reviewBookings));
      const bookingIds = db.select({ id: reservations.id }).from(reservations).where(eq(reservations.locationId, locationId));
      await db.delete(appointmentRefunds).where(inArray(appointmentRefunds.paymentId,
        db.select({ id: appointmentPayments.id }).from(appointmentPayments).where(inArray(appointmentPayments.bookingId, bookingIds))));
      await db.delete(appointmentPayments).where(inArray(appointmentPayments.bookingId, bookingIds));
      await db.delete(reservations).where(eq(reservations.locationId, locationId));
      await db.delete(paymentReferences).where(and(eq(paymentReferences.userId, ownerId), eq(paymentReferences.provider, "beautyhub-simulated")));
      await db.delete(employeeServices).where(eq(employeeServices.employeeId, secondProfessional!.id));
      await db.delete(employees).where(eq(employees.id, secondProfessional!.id));
      await db.delete(services).where(eq(services.id, secondService!.id));
      await db.update(employees).set({ workingHours: employee!.workingHours }).where(eq(employees.id, employeeId));
      await db.update(services).set({ onlineBooking: false }).where(eq(services.id, serviceId));
    }
  });

  it("isolates location inventory and serializes competing stock movements", async () => {
    const path = orgPath("/locations/" + locationId + "/inventory");
    const query = (method: "get" | "post" | "put", endpoint: string, user = owner) =>
      authed(method, endpoint, user).set("X-Forwarded-For", "192.0.2.64");
    const payload = { sku: " shampoo-1 ", name: "Salon shampoo", category: "Hair", supplier: "Supplier",
      imageUrl: "https://example.com/shampoo.png", unitCents: 1250, reorderAt: 3, purchaseCostCents: 450 };
    try {
      expect((await query("get", path, outsider)).status).toBe(403);
      expect((await query("get", "/api/organizations/" + otherOrg + "/locations/" + locationId + "/inventory", outsider)).status).toBe(404);
      expect((await query("post", path).send({ ...payload, imageUrl: "http://example.com/a.png" })).status).toBe(400);
      expect((await query("post", path).send({ ...payload, purchaseCostCents: -1 })).status).toBe(400);
      const product = await query("post", path).send(payload);
      expect(product.status).toBe(201);
      expect(product.body).toMatchObject({ sku: "SHAMPOO-1", stock: 0, reorderAt: 3, archived: false, purchaseCostCents: 450 });
      expect((await query("post", path).send({ ...payload, sku: "SHAMPOO-1" })).status).toBe(409);
      const movements = path + "/" + product.body.id + "/movements";
      const receipt = { idempotencyKey: randomUUID(), kind: "receipt", quantity: 10, reason: "Delivery 1" };
      const duplicates = await Promise.all([query("post", movements).send(receipt), query("post", movements).send(receipt)]);
      expect(duplicates.map(({ status }) => status).sort()).toEqual([200, 201]);
      expect(duplicates[0]!.body.id).toBe(duplicates[1]!.body.id);
      const corrections = await Promise.all([randomUUID(), randomUUID()].map((idempotencyKey) =>
        query("post", movements).send({ idempotencyKey, kind: "adjustment", quantity: -7, reason: "Count correction" })));
      expect(corrections.map(({ status }) => status).sort()).toEqual([201, 409]);
      const updated = await query("put", path + "/" + product.body.id).send({ ...payload, name: "Shampoo", archived: true });
      expect(updated.body).toMatchObject({ stock: 3, archived: true });
      expect((await query("post", movements).send({ ...receipt, idempotencyKey: randomUUID() })).status).toBe(409);
      expect((await query("get", movements)).body).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "receipt", balance: 10 }),
        expect.objectContaining({ kind: "adjustment", balance: 3 }),
      ]));
      expect((await query("get", path)).body).toEqual([expect.objectContaining({ stock: 3, archived: true })]);
      const suppliers = path + "/suppliers";
      const supplier = await query("post", suppliers).send({ name: "QA Supplier", email: "orders@example.com", phone: "+49 201 123456" });
      expect(supplier.status).toBe(201);
      expect((await query("get", suppliers, outsider)).status).toBe(403);
      expect((await query("put", suppliers + "/" + supplier.body.id).send({ name: "Updated supplier" })).status).toBe(200);
      expect((await query("put", path + "/" + product.body.id).send({ ...payload, archived: false })).status).toBe(200);
      const second = await query("post", path).send({ ...payload, sku: "SOAP", name: "Soap", purchaseCostCents: null });
      const orders = path + "/purchase-orders";
      const purchase = { idempotencyKey: randomUUID(), supplierId: supplier.body.id,
        items: [{ productId: product.body.id, quantity: 2 }, { productId: second.body.id, quantity: 4 }] };
      const replies = await Promise.all([purchase, { ...purchase, items: [...purchase.items].reverse() }]
        .map((body) => query("post", orders).send(body)));
      expect(replies.map(({ status }) => status).sort()).toEqual([200, 201]);
      expect(replies[0]!.body.id).toBe(replies[1]!.body.id);
      expect(replies[0]!.body.supplierName).toBe("Updated supplier");
      expect(replies[0]!.body.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ productId: product.body.id, purchaseCostCents: 450 }),
        expect.objectContaining({ productId: second.body.id, purchaseCostCents: null }),
      ]));
      expect((await query("put", path + "/" + product.body.id).send({ ...payload, purchaseCostCents: 600 })).status).toBe(200);
      const savedOrder = (await query("get", orders)).body.find((entry: { id: string }) => entry.id === replies[0]!.body.id);
      expect(savedOrder.items).toContainEqual(expect.objectContaining({ productId: product.body.id, purchaseCostCents: 450 }));
      const receivePath = orders + "/" + replies[0]!.body.id + "/status";
      expect((await query("put", path + "/" + second.body.id).send({ ...payload, sku: "SOAP", archived: true })).status).toBe(200);
      expect((await query("post", receivePath).send({ status: "received" })).status).toBe(409);
      expect((await query("get", path)).body).toEqual([
        expect.objectContaining({ stock: 3, archived: false }), expect.objectContaining({ stock: 0, archived: true }),
      ]);
      expect((await query("put", path + "/" + second.body.id).send({ ...payload, sku: "SOAP" })).status).toBe(200);
      const partialPath = orders + "/" + replies[0]!.body.id + "/receipts";
      const part = { idempotencyKey: randomUUID(), items: [{ productId: product.body.id, quantity: 1 }] };
      expect((await query("post", partialPath, outsider).send(part)).status).toBe(403);
      const partial = await Promise.all([part, part].map((delivery) => query("post", partialPath).send(delivery)));
      expect(partial.map(({ status }) => status).sort()).toEqual([200, 201]);
      expect(partial[0]!.body).toMatchObject({ status: "open", items: expect.arrayContaining([
        expect.objectContaining({ productId: product.body.id, receivedQuantity: 1 }),
        expect.objectContaining({ productId: second.body.id, receivedQuantity: 0 }),
      ]) });
      expect((await query("post", partialPath).send({ ...part, idempotencyKey: randomUUID(),
        items: [{ productId: product.body.id, quantity: 2 }] })).status).toBe(409);
      expect((await query("post", partialPath).send({ ...part, items: [{ productId: product.body.id, quantity: 2 }] })).status).toBe(409);
      const receipts = await Promise.all([1, 2].map(() => query("post", receivePath).send({ status: "received" })));
      expect(receipts.map(({ status }) => status)).toEqual([200, 200]);
      expect((await query("post", receivePath).send({ status: "cancelled" })).status).toBe(409);
      expect((await query("get", path)).body).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: product.body.id, stock: 5 }), expect.objectContaining({ id: second.body.id, stock: 4 }),
      ]));
      expect((await query("get", movements)).body.filter((entry: { idempotencyKey: string }) => entry.idempotencyKey === replies[0]!.body.id))
        .toEqual([expect.objectContaining({ kind: "receipt", balance: 5 })]);
      const sales = orgPath("/locations/" + locationId + "/retail-sales");
      const requested = { method: "cash", idempotencyKey: randomUUID(), items: [
        { productId: product.body.id, description: "Client label ignored", unitCents: 1250, quantity: 4 },
      ] };
      expect((await query("post", sales).send({ ...requested, items: [{ ...requested.items[0], unitCents: 100 }] })).status).toBe(409);
      const rival = { ...requested, idempotencyKey: randomUUID() };
      const salesResults = await Promise.all([requested, rival].map((row) => query("post", sales).send(row)));
      expect(salesResults.map(({ status }) => status).sort()).toEqual([201, 409]);
      const sale = salesResults.find(({ status }) => status === 201)!.body;
      expect(sale).toMatchObject({ amountCents: 5000, items: [
        { productId: product.body.id, sku: "SHAMPOO-1", description: "Salon shampoo", unitCents: 1250, quantity: 4 },
      ] });
      expect((await query("post", sales).send(sale.idempotencyKey === requested.idempotencyKey ? requested : rival)).status).toBe(200);
      expect((await query("post", sales + "/" + sale.id + "/refunds").send({
        idempotencyKey: randomUUID(), reason: "Refund without merchandise receipt", amountCents: 5000,
      })).status).toBe(201);
      expect((await query("get", path)).body).toEqual(expect.arrayContaining([expect.objectContaining({ id: product.body.id, stock: 1 })]));
      const stockReport = await query("get", orgPath("/analytics")).query({ from: "2026-06-15", to: "2026-06-15", locationId });
      expect(stockReport.status).toBe(200);
      expect(stockReport.body.locations).toEqual([expect.objectContaining({
        id: locationId, units: 5, lowStock: 1, inventoryValueCents: 2400, unpricedUnits: 0,
      })]);
      expect((await query("get", movements)).body.filter((entry: { kind: string }) => entry.kind === "sale"))
        .toEqual([expect.objectContaining({ quantity: -4, balance: 1, idempotencyKey: sale.id })]);
    } finally {
      await db.delete(retailRefunds).where(inArray(retailRefunds.saleId,
        db.select({ id: retailSales.id }).from(retailSales).where(eq(retailSales.locationId, locationId))));
      await db.delete(retailSales).where(eq(retailSales.locationId, locationId));
      await db.delete(inventoryOrderReceipts).where(inArray(inventoryOrderReceipts.orderId,
        db.select({ id: inventoryOrders.id }).from(inventoryOrders).where(eq(inventoryOrders.locationId, locationId))));
      await db.delete(inventoryOrders).where(eq(inventoryOrders.locationId, locationId));
      await db.delete(inventorySuppliers).where(eq(inventorySuppliers.locationId, locationId));
      await db.delete(inventoryMovements).where(inArray(inventoryMovements.productId,
        db.select({ id: inventoryProducts.id }).from(inventoryProducts).where(eq(inventoryProducts.locationId, locationId))));
      await db.delete(inventoryProducts).where(eq(inventoryProducts.locationId, locationId));
    }
  });

  it("records tenant-scoped retail sales once and reflects them in daily reconciliation", async () => {
    const scope = "/locations/" + locationId;
    const path = orgPath(scope + "/retail-sales");
    const query = (method: "get" | "post", endpoint: string, user = owner) =>
      authed(method, endpoint, user).set("X-Forwarded-For", "192.0.2.63");
    const payload = { idempotencyKey: randomUUID(), method: "cash", items: [
      { description: "Shampoo", unitCents: 1250, quantity: 2 },
      { description: "Comb", unitCents: 375, quantity: 1 },
    ] };
    try {
      expect((await query("post", path, outsider).send(payload)).status).toBe(403);
      expect((await query("post", "/api/organizations/" + otherOrg + scope + "/retail-sales", outsider).send(payload)).status).toBe(404);
      expect((await query("post", path).send({ ...payload, items: [{ description: "Shampoo", unitCents: 1250.1, quantity: 1 }] })).status).toBe(400);
      const requests = await Promise.all([query("post", path).send(payload), query("post", path).send(payload)]);
      expect(requests.map(({ status }) => status).sort()).toEqual([200, 201]);
      expect(requests[0]!.body.id).toBe(requests[1]!.body.id);
      const sale = requests[0]!.body;
      expect(sale).toMatchObject({ locationId, amountCents: 2875, items: payload.items });
      expect((await query("post", path).send({ ...payload, method: "simulated_card" })).status).toBe(409);
      const receipt = path + "/" + sale.id + "/receipt";
      expect((await query("get", receipt, outsider)).status).toBe(403);
      const download = await query("get", receipt);
      expect(download.text).toContain("Shampoo | 2 x");
      expect(download.text).toContain("28,75");
      await db.update(retailSales).set({ createdAt: new Date("2026-06-15T21:59:59Z") }).where(eq(retailSales.id, sale.id));
      const report = await query("get", orgPath(scope + "/appointment-transactions")).query({ date: "2026-06-15" });
      expect(report.body).toMatchObject({
        count: 1, entries: [{ id: sale.id, bookingId: null, kind: "retail", amountCents: 2875 }],
        totals: [{ method: "cash", receivedCents: 2875, refundedCents: 0, discountCents: 0 }],
      });
      const balance = path + "/" + sale.id;
      const refundPath = balance + "/refunds";
      const refund = { idempotencyKey: randomUUID(), amountCents: 1000, reason: "Returned item" };
      expect((await query("post", refundPath, outsider).send(refund)).status).toBe(403);
      expect((await query("post", refundPath).send({ ...refund, reason: " " })).status).toBe(400);
      const attempts = await Promise.all([query("post", refundPath).send(refund), query("post", refundPath).send(refund)]);
      expect(attempts.map(({ status }) => status).sort()).toEqual([200, 201]);
      expect(attempts[0]!.body.id).toBe(attempts[1]!.body.id);
      expect((await query("post", refundPath).send({ ...refund, amountCents: 1001 })).status).toBe(409);
      const remainder = { ...refund, amountCents: 1875 };
      const rivals = await Promise.all([randomUUID(), randomUUID()].map((idempotencyKey) =>
        query("post", refundPath).send({ ...remainder, idempotencyKey })));
      expect(rivals.map(({ status }) => status).sort()).toEqual([201, 409]);
      expect((await query("get", balance)).body).toMatchObject({ refundableCents: 0, refunds: expect.arrayContaining([
        expect.objectContaining({ amountCents: 1000 }), expect.objectContaining({ amountCents: 1875 }),
      ]) });
      expect((await query("get", receipt)).text).toContain("Nach Erstattungen 0,00");
      await db.update(retailRefunds).set({ createdAt: new Date("2026-06-15T22:00:00Z") }).where(eq(retailRefunds.saleId, sale.id));
      const nextDay = await query("get", orgPath(scope + "/appointment-transactions")).query({ date: "2026-06-16" });
      expect(nextDay.body).toMatchObject({
        count: 2, entries: [expect.objectContaining({ kind: "retail_refund", paymentId: sale.id }),
          expect.objectContaining({ kind: "retail_refund", paymentId: sale.id })],
        totals: [{ method: "cash", receivedCents: 0, refundedCents: 2875, discountCents: 0 }],
      });
      const analytics = orgPath("/analytics");
      const byDay = (date: string) => query("get", analytics).query({ from: date, to: date, locationId });
      expect((await byDay("2026-06-15")).body.locations).toEqual([expect.objectContaining({ receivedCents: 2875, refundedCents: 0 })]);
      expect((await byDay("2026-06-16")).body.locations).toEqual([expect.objectContaining({ receivedCents: 0, refundedCents: 2875 })]);
      const vouchers = orgPath("/pos-vouchers");
      const code = "FIXTURE50";
      expect((await query("post", vouchers, outsider).send({ code, discountCents: 500 })).status).toBe(403);
      expect((await query("post", vouchers).send({ code: code.toLowerCase(), discountCents: 500 })).status).toBe(201);
      expect((await query("get", vouchers + "/" + code)).body).toMatchObject({ code, discountCents: 500 });
      const requested = { ...payload, idempotencyKey: randomUUID(), voucherCode: code };
      expect((await query("post", path).send({ ...requested, items: [{ description: "Comb", unitCents: 500, quantity: 1 }] })).status).toBe(409);
      expect((await query("get", vouchers + "/" + code)).status).toBe(200);
      const redemptions = await Promise.all([requested, { ...requested, idempotencyKey: randomUUID() }].map((value) =>
        query("post", path).send(value)));
      expect(redemptions.map(({ status }) => status).sort()).toEqual([201, 409]);
      const index = redemptions.findIndex(({ status }) => status === 201);
      expect(redemptions[index]!.body).toMatchObject({ amountCents: 2375, discountCents: 500, voucherCode: code });
      const replay = index === 0 ? requested : { ...requested, idempotencyKey: redemptions[index]!.body.idempotencyKey };
      expect((await query("post", path).send(replay)).status).toBe(200);
      expect((await query("get", vouchers + "/" + code)).status).toBe(404);
    } finally {
      await db.delete(retailRefunds).where(inArray(retailRefunds.saleId,
        db.select({ id: retailSales.id }).from(retailSales).where(eq(retailSales.locationId, locationId))));
      await db.delete(retailSales).where(eq(retailSales.locationId, locationId));
      await db.delete(posVouchers).where(eq(posVouchers.organizationId, orgId));
    }
  });

  it("adds tenant-private manual and walk-in appointments through the shared slot engine", async () => {
    const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
    const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId));
    const date = new Date(Date.now() + 7 * 86400000);
    date.setUTCDate(date.getUTCDate() + (8 - date.getUTCDay()) % 7);
    const day = date.toISOString().slice(0, 10);
    const calendar = orgPath("/booking-calendar");
    const availabilityBody = { locationId, date: day, items: [{ serviceId }], source: "manual" };
    const from = new Date(day + "T00:00:00Z").toISOString();
    const to = new Date(+new Date(from) + 86400000).toISOString();
    await db.update(employees).set({ workingHours: [{ weekday: 1, opens: "09:00", closes: "18:00" }] }).where(eq(employees.id, employeeId));
    try {
      expect((await authed("post", calendar + "/availability", outsider).send(availabilityBody)).status).toBe(403);
      expect((await authed("post", `/api/organizations/${otherOrg}/booking-calendar/availability`, outsider).send(availabilityBody)).status).toBe(404);
      expect((await request(app).post(`/api/businesses/${location!.slug}/availability`).send({ date: day, items: availabilityBody.items })).status).toBe(404);
      const ready = await authed("post", calendar + "/availability").send(availabilityBody);
      expect(ready.status).toBe(200);
      const first = ready.body.slots.find((slot: { employeeId: string }) => slot.employeeId === employeeId);
      const payload = { locationId, items: availabilityBody.items, employeeId, startsAt: first.startsAt,
        guestName: "Calendar-only guest", source: "manual", idempotencyKey: randomUUID() };
      const [created, replay] = await Promise.all([
        authed("post", calendar).send(payload), authed("post", calendar).send(payload),
      ]);
      expect([created.status, replay.status].sort()).toEqual([200, 201]);
      expect(created.body.id).toBe(replay.body.id);
      expect((await authed("post", calendar).send({ ...payload, idempotencyKey: randomUUID() })).status).toBe(409);
      expect((await authed("get", "/api/me/bookings")).body).toEqual([]);
      await db.update(services).set({ onlineBooking: true }).where(eq(services.id, serviceId));
      try {
        const publicSlots = await request(app).post(`/api/businesses/${location!.slug}/availability`)
          .send({ date: day, items: availabilityBody.items });
        expect(publicSlots.status).toBe(200);
        expect(publicSlots.body.slots.some((slot: { employeeId: string; startsAt: string }) =>
          slot.employeeId === employeeId && slot.startsAt === first.startsAt)).toBe(false);
      } finally {
        await db.update(services).set({ onlineBooking: false }).where(eq(services.id, serviceId));
      }
      expect((await authed("get", calendar).query({ from, to })).body).toEqual([
        expect.objectContaining({ id: created.body.id, customerName: "Calendar-only guest", source: "manual" }),
      ]);
      const movePath = `${calendar}/${created.body.id}`;
      const paymentPath = movePath + "/payments";
      const deposit = { idempotencyKey: randomUUID(), amountCents: 4000, method: "cash", kind: "deposit" };
      expect((await authed("get", paymentPath, outsider)).status).toBe(403);
      expect((await authed("get", `/api/organizations/${otherOrg}/booking-calendar/${created.body.id}/payments`, outsider)).status).toBe(404);
      expect((await authed("post", paymentPath).send({ ...deposit, amountCents: 4000.5 })).status).toBe(400);
      expect((await authed("post", paymentPath).send({ ...deposit, kind: "settlement", amountCents: created.body.priceCents })).status).toBe(409);
      const rival = { ...deposit, idempotencyKey: randomUUID() };
      const deposits = await Promise.all([deposit, rival].map((entry) => authed("post", paymentPath).send(entry)));
      expect(deposits.map((entry) => entry.status).sort()).toEqual([201, 409]);
      const successfulDeposit = deposits[0]!.status === 201 ? deposit : rival;
      expect((await authed("post", paymentPath).send(successfulDeposit)).status).toBe(200);
      expect((await authed("post", paymentPath).send({ ...successfulDeposit, amountCents: 3999 })).status).toBe(409);
      const occupiedBefore = new Date(first.startsAt);
      const occupiedAfter = new Date(+occupiedBefore + 60 * 60 * 1000);
      const breaksPath = orgPath(`/staff-breaks/${employeeId}`);
      const clock = (value: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: location!.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value);
      expect((await authed("put", breaksPath).send([{ weekday: 1, begins: clock(occupiedBefore), ends: clock(occupiedAfter) }])).status).toBe(409);
      expect((await authed("get", breaksPath, outsider)).status).toBe(403);
      expect((await authed("put", breaksPath).send([{ weekday: 1, begins: "12:00", ends: "13:00" }])).status).toBe(200);
      const blockId = randomUUID();
      await pool.query(`insert into booking_blocks (id, location_id, employee_id, starts_at, ends_at, reason)
        values ($1, $2, $3, ($4::date + time '12:30') at time zone $5,
          ($4::date + time '13:30') at time zone $5, 'Capacity fixture')`, [blockId, locationId, employeeId, day, location!.timezone]);
      try {
        const capacity = await authed("get", orgPath("/analytics")).set("X-Forwarded-For", "192.0.2.75")
          .query({ from: day, to: day, locationId });
        expect(capacity.status).toBe(200);
        expect(capacity.body.locations).toEqual([expect.objectContaining({
          capacityMinutes: 450, occupiedMinutes: (Date.parse(first.endsAt) - Date.parse(first.startsAt)) / 60000,
        })]);
      } finally {
        await pool.query("delete from booking_blocks where id = $1", [blockId]);
      }
      const available = await authed("post", movePath + "/availability").send({ date: day });
      expect(available.status).toBe(200);
      expect(available.body.slots.some((entry: { startsAt: string }) => clock(new Date(entry.startsAt)) === "12:00")).toBe(false);
      const target = available.body.slots.find((entry: { employeeId: string; startsAt: string }) =>
        entry.employeeId === employeeId && entry.startsAt >= first.endsAt);
      const move = { employeeId, startsAt: target.startsAt, expectedEmployeeId: employeeId, expectedStartsAt: first.startsAt };
      expect((await authed("post", movePath + "/reschedule", outsider).send(move)).status).toBe(403);
      expect((await authed("post", movePath + "/reschedule").send(move)).status).toBe(200);
      expect((await authed("post", movePath + "/reschedule").send({ ...move, startsAt: first.startsAt })).status).toBe(409);
      expect((await authed("get", calendar).query({ from, to })).body[0].startsAt).toBe(target.startsAt);
      const crm = orgPath("/crm-customers");
      const customerFields = { name: "Private guest", email: "private@example.com", phone: "", contactPreference: "email", notes: "Internal preference", tags: ["repeat"] };
      const customer = await authed("post", crm).send(customerFields);
      expect(customer.status).toBe(201);
      const customerPath = crm + "/" + customer.body.id;
      expect((await authed("get", crm, outsider)).status).toBe(403);
      expect((await authed("get", `/api/organizations/${otherOrg}/crm-customers`, outsider).query({ q: "Private" })).body).toEqual([]);
      expect((await authed("get", crm).query({ q: "Private", tag: "repeat" })).body).toEqual([expect.objectContaining({ id: customer.body.id })]);
      expect((await authed("put", `/api/organizations/${otherOrg}/crm-customers/${customer.body.id}`, outsider)
        .send({ ...customerFields, revision: 0 })).status).toBe(404);
      expect((await authed("put", customerPath).send({ ...customerFields, revision: 0, notes: "Updated" })).status).toBe(200);
      expect((await authed("put", customerPath).send({ ...customerFields, revision: 0 })).status).toBe(409);
      const link = `${customerPath}/appointments/${created.body.id}`;
      expect((await authed("put", link)).status).toBe(204);
      expect((await authed("get", customerPath + "/appointments")).body.history).toEqual([
        expect.objectContaining({ bookingId: created.body.id, startsAt: target.startsAt }),
      ]);
      expect((await authed("get", crm).query({ minVisits: "1" })).body).toEqual([]);
      await db.update(reservations).set({ status: "completed" }).where(eq(reservations.id, created.body.id));
      const completedCapacity = await authed("get", orgPath("/analytics")).set("X-Forwarded-For", "192.0.2.75")
        .query({ from: day, to: day, locationId });
      expect(completedCapacity.body.locations).toEqual([expect.objectContaining({
        capacityMinutes: 480, occupiedMinutes: (Date.parse(first.endsAt) - Date.parse(first.startsAt)) / 60000,
      })]);
      const postCheckout = () => authed("post", paymentPath).set("X-Forwarded-For", "192.0.2.62");
      const settlement = { idempotencyKey: randomUUID(), method: "simulated_card", kind: "settlement", amountCents: created.body.priceCents - 4500, discountCents: 500, discountReason: "Courtesy adjustment" };
      expect((await postCheckout().send({ ...settlement, discountReason: " " })).status).toBe(400);
      expect((await postCheckout().send({ ...settlement, discountCents: 501 })).status).toBe(409);
      const settledResponses = await Promise.all([postCheckout().send(settlement), postCheckout().send(settlement)]);
      expect(settledResponses.map(({ status }) => status).sort()).toEqual([200, 201]);
      const settled = settledResponses[0]!;
      expect((await postCheckout().send({ ...settlement, discountReason: "Different reason" })).status).toBe(409);
      expect(settled.body.providerReference).toMatch(/^simulated:/);
      expect((await postCheckout().send({ ...settlement, idempotencyKey: randomUUID() })).status).toBe(409);
      expect((await authed("get", paymentPath)).body).toMatchObject({
        currency: "EUR", paidCents: created.body.priceCents - 500, discountCents: 500, outstandingCents: 0,
        entries: expect.arrayContaining([expect.objectContaining({ kind: "deposit", providerReference: null }),
          expect.objectContaining({ kind: "settlement", method: "simulated_card" })]),
      });
      const receiptPath = paymentPath + "/" + settled.body.id + "/receipt";
      const refundPath = paymentPath + "/" + settled.body.id + "/refunds";
      const refund = { idempotencyKey: randomUUID(), amountCents: settlement.amountCents - 100, reason: "Service adjustment" };
      expect((await authed("get", receiptPath, outsider)).status).toBe(403);
      expect((await authed("post", refundPath, outsider).send(refund)).status).toBe(403);
      const competing = { ...refund, idempotencyKey: randomUUID() };
      const results = await Promise.all([refund, competing].map((value) => authed("post", refundPath).send(value)));
      expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
      const winner = results[0]!.status === 201 ? refund : competing;
      expect((await authed("post", refundPath).send(winner)).status).toBe(200);
      expect((await authed("post", refundPath).send({ ...winner, reason: "Changed reason" })).status).toBe(409);
      const receipt = await authed("get", receiptPath);
      expect(receipt.status).toBe(200);
      expect(receipt.headers["content-disposition"]).toContain("attachment");
      expect(receipt.text).toContain("Simulierte Kartenzahlung");
      expect(receipt.text).toContain("Rabatt 5,00");
      expect(receipt.text).toContain("Erstattung");
      expect((await authed("get", paymentPath)).body).toMatchObject({
        outstandingCents: 0, refundedCents: refund.amountCents, refunds: [expect.objectContaining({ reason: refund.reason })],
      });
      // Berlin's fall-back day has 25 hours. Count the payment on that local day
      // and the refund exactly at the next midnight on the following day.
      await db.update(appointmentPayments).set({ createdAt: new Date("2026-10-25T22:59:59Z") })
        .where(eq(appointmentPayments.id, settled.body.id));
      await db.update(appointmentRefunds).set({ createdAt: new Date("2026-10-25T23:00:00Z") })
        .where(eq(appointmentRefunds.paymentId, settled.body.id));
      const daily = (path: string, user = owner) => authed("get", path, user).set("X-Forwarded-For", "192.0.2.61");
      const transactions = orgPath("/locations/" + locationId + "/appointment-transactions");
      expect((await daily(transactions, outsider).query({ date: "2026-10-25" })).status).toBe(403);
      expect((await daily("/api/organizations/" + otherOrg + "/locations/" + locationId + "/appointment-transactions", outsider)
        .query({ date: "2026-10-25" })).status).toBe(404);
      expect((await daily(transactions).query({ date: "2026-02-30" })).status).toBe(400);
      const paymentDay = await daily(transactions).query({ date: "2026-10-25" });
      expect(paymentDay.status, JSON.stringify(paymentDay.body)).toBe(200);
      expect(paymentDay.body).toMatchObject({
        count: 1, timezone: "Europe/Berlin",
        totals: [{ method: "simulated_card", receivedCents: settlement.amountCents, refundedCents: 0, discountCents: 500 }],
        entries: [{ id: settled.body.id, bookingId: created.body.id, kind: "settlement", discountCents: 500 }],
      });
      const refundDay = await daily(transactions).query({ date: "2026-10-26" });
      expect(refundDay.body).toMatchObject({
        count: 1, totals: [{ method: "simulated_card", receivedCents: 0, refundedCents: refund.amountCents, discountCents: 0 }],
        entries: [{ paymentId: settled.body.id, kind: "refund" }],
      });
      const page = await daily(transactions).query({ date: "2026-10-26", page: 1 });
      expect(page.body).toMatchObject({ count: 1, entries: [], totals: refundDay.body.totals });
      expect((await authed("get", crm).query({ minVisits: "1" })).body).toEqual([
        expect.objectContaining({ id: customer.body.id, completedVisits: 1 }),
      ]);
      const source = await db.select().from(reservations).where(eq(reservations.id, created.body.id));
      const [voucherBooking] = await db.insert(reservations).values({
        ...source[0]!, id: randomUUID(), idempotencyKey: randomUUID(),
      }).returning();
      const voucherCode = "APPT500";
      const requestCheckout = (endpoint: string) => authed("post", endpoint).set("X-Forwarded-For", "192.0.2.62");
      expect((await requestCheckout(orgPath("/pos-vouchers")).send({ code: voucherCode, discountCents: 500 })).status).toBe(201);
      const checkout = requestCheckout(calendar + "/" + voucherBooking!.id + "/payments");
      const redeemed = await checkout.send({ voucherCode, idempotencyKey: randomUUID(), method: "cash",
        kind: "settlement", amountCents: voucherBooking!.priceCents - 500 });
      expect(redeemed.status).toBe(201);
      expect(redeemed.body).toMatchObject({ voucherCode, discountCents: 500, discountReason: "Gutschein " + voucherCode });
      expect((await authed("delete", link)).status).toBe(204);
      expect((await authed("get", customerPath + "/appointments")).body.history).toEqual([]);
      const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
      const upload = (data: Buffer) => authed("post", customerPath + "/attachments")
        .set("Content-Type", "application/pdf").set("X-Attachment-Name", "private.pdf").send(data);
      expect((await upload(Buffer.from("not a PDF"))).status).toBe(400);
      const document = await upload(pdf);
      expect(document.status).toBe(201);
      const download = customerPath + "/attachments/" + document.body.id;
      const downloaded = await authed("get", download);
      expect(downloaded.status).toBe(200);
      expect(downloaded.headers["content-disposition"]).toContain("attachment");
      expect(downloaded.headers["content-length"]).toBe(String(pdf.length));
      expect((await authed("get", download, outsider)).status).toBe(403);
      expect((await authed("get", `/api/organizations/${otherOrg}/crm-customers/${customer.body.id}/attachments/${document.body.id}`, outsider)).status).toBe(404);
      expect((await authed("delete", download)).status).toBe(204);
      expect((await authed("get", download)).status).toBe(404);
      expect((await authed("put", breaksPath).send([])).status).toBe(200);
      expect((await authed("post", calendar + "/availability").send({ ...availabilityBody, source: "walk_in" })).status).toBe(400);
      vi.useFakeTimers({ toFake: ["Date"], now: +new Date(day + "T07:00:00Z") });
      try {
        const walkIn = await authed("post", calendar + "/availability").send({ ...availabilityBody, source: "walk_in" });
        expect(walkIn.status).toBe(200);
        const slot = walkIn.body.slots.find((entry: { employeeId: string; startsAt: string }) =>
          entry.employeeId === employeeId && entry.startsAt >= first.endsAt);
        const guest = await authed("post", calendar).send({ ...payload, source: "walk_in", startsAt: slot.startsAt,
          idempotencyKey: randomUUID(), guestName: "Walk-in guest" });
        expect(guest.status).toBe(201);
        expect((await authed("get", calendar).query({ from, to })).body).toEqual(expect.arrayContaining([
          expect.objectContaining({ id: guest.body.id, customerName: "Walk-in guest", source: "walk_in" }),
        ]));
      } finally { vi.useRealTimers(); }
    } finally {
      await db.delete(appointmentRefunds).where(inArray(appointmentRefunds.paymentId,
        db.select({ id: appointmentPayments.id }).from(appointmentPayments)
          .innerJoin(reservations, eq(reservations.id, appointmentPayments.bookingId)).where(eq(reservations.locationId, locationId))));
      await db.delete(appointmentPayments).where(inArray(appointmentPayments.bookingId,
        db.select({ id: reservations.id }).from(reservations).where(eq(reservations.locationId, locationId))));
      await db.delete(posVouchers).where(eq(posVouchers.organizationId, orgId));
      await db.delete(reservations).where(eq(reservations.locationId, locationId));
      await db.update(employees).set({ workingHours: employee!.workingHours }).where(eq(employees.id, employeeId));
    }
  });

  it("validates and persists gallery uploads with tenant and publication boundaries", async () => {
    const listing = (await authed("get", orgPath("/workspace"))).body.locations.find((entry: { id: string }) => entry.id === locationId);
    const manage = orgPath(`/locations/${locationId}/gallery`);
    const publicList = `/api/businesses/${listing.slug}/gallery`;
    const image = readFileSync(new URL("../../../../tests/fixtures/gallery-photo.png", import.meta.url));
    const tiny = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=", "base64");
    const lookup = (path: string) => request(app).get(path).set("X-Forwarded-For", "192.0.2.85");
    const call = (method: "get" | "post" | "put" | "delete", path: string, user = owner) =>
      authed(method, path, user).set("X-Forwarded-For", "192.0.2.85");
    const upload = (bytes: Buffer, user = owner) => call("post", manage, user)
      .query({ alt: "Eingang" }).set("Content-Type", "image/png").send(bytes);
    expect((await upload(image, outsider)).status).toBe(403);
    const otherWorkspace = await authed("get", `/api/organizations/${otherOrg}/workspace`, outsider);
    const otherLocation = otherWorkspace.body.locations[0].id;
    const crossTenant = `/api/organizations/${otherOrg}/locations/${locationId}/gallery`;
    expect((await call("get", crossTenant, outsider)).status).toBe(404);
    expect((await upload(Buffer.from("not an image"))).status).toBe(400);
    expect((await upload(tiny)).status).toBe(400);
    expect((await upload(Buffer.alloc(3 * 1024 * 1024 + 1))).status).toBe(413);
    const created = await upload(image);
    expect(created.status).toBe(201);
    const photo = created.body;
    expect(photo).toEqual({ id: expect.any(String), alt: "Eingang" });
    expect((await call("get", manage)).body).toEqual([photo]);
    expect((await lookup(publicList)).body).toEqual([photo]);
    const placements = manage + "/assignments";
    const [product] = await db.insert(inventoryProducts).values({
      locationId, sku: "GALLERY-QA", name: "Gallery QA product", unitCents: 250,
    }).returning();
    const assign = (kind: "cover" | "service" | "product", targetId?: string) =>
      call("put", placements).send({ kind, photoId: photo.id, ...(targetId ? { targetId } : {}) });
    try {
      expect((await call("put", placements, outsider).send({ kind: "cover", photoId: photo.id })).status).toBe(403);
      expect((await call("put", `/api/organizations/${otherOrg}/locations/${otherLocation}/gallery/assignments`, outsider)
        .send({ kind: "cover", photoId: photo.id })).status).toBe(404);
      expect((await assign("service", randomUUID())).status).toBe(404);
      expect((await assign("cover")).status).toBe(204);
      expect((await assign("service", serviceId)).status).toBe(204);
      expect((await assign("product", product!.id)).status).toBe(204);
      const state = await call("get", placements);
      expect(state.body).toMatchObject({ coverPhotoId: photo.id, products: [{ id: product!.id, photoId: photo.id }] });
      expect(state.body.services).toContainEqual(expect.objectContaining({ id: serviceId, photoId: photo.id }));
      const detail = await lookup(`/api/businesses/${listing.slug}`);
      expect(detail.body).toMatchObject({ coverPhotoId: photo.id, coverPhotoAlt: "Eingang" });
      expect(detail.body.services).toContainEqual(expect.objectContaining({ id: serviceId, photoId: photo.id, photoAlt: "Eingang" }));
      expect(await lookup("/api/businesses").then((response) => response.body))
        .toContainEqual(expect.objectContaining({ id: locationId, coverPhotoId: photo.id }));

      for (let i = 0; i < 8; i++) expect((await upload(image)).status).toBe(201);
      const last = await Promise.all([upload(image), upload(image)]);
      expect(last.map(({ status }) => status).sort()).toEqual([201, 409]);

      const imagePath = `/api/gallery/${photo.id}`;
      const publicPhoto = await lookup(imagePath);
      expect(publicPhoto.status).toBe(200);
      expect(publicPhoto.headers["content-type"]).toBe("image/png");
      expect(publicPhoto.body).toEqual(image);
      expect((await call("delete", `/api/organizations/${otherOrg}/locations/${otherLocation}/gallery/${photo.id}`, outsider)).status).toBe(404);
      expect((await call("put", orgPath("/publication")).send({ locationId, published: false })).status).toBe(200);
      expect((await lookup(publicList)).status).toBe(404);
      expect((await lookup(imagePath)).status).toBe(404);
      expect((await call("get", `${manage}/${photo.id}`)).body).toEqual(image);
      expect((await call("put", orgPath("/publication")).send({ locationId, published: true })).status).toBe(200);
      expect((await call("delete", `${manage}/${photo.id}`)).status).toBe(204);
      expect((await lookup(imagePath)).status).toBe(404);
      const cleared = await call("get", placements);
      expect(cleared.body).toMatchObject({ coverPhotoId: null, products: [{ id: product!.id, photoId: null }] });
      expect(cleared.body.services).toContainEqual(expect.objectContaining({ id: serviceId, photoId: null }));
    } finally {
      await db.delete(inventoryProducts).where(eq(inventoryProducts.id, product!.id));
      await db.delete(galleryPhotos).where(eq(galleryPhotos.locationId, locationId));
    }
  });

  it("keeps favorites account-scoped, idempotent and limited to public locations", async () => {
    const list = "/api/me/favorites";
    const favorite = `${list}/${locationId}`;
    expect((await request(app).get(list)).status).toBe(401);
    const saves = await Promise.all([authed("put", favorite), authed("put", favorite)]);
    expect(saves.map((response) => response.status)).toEqual([204, 204]);
    expect((await authed("get", list)).body).toEqual([
      expect.objectContaining({ id: locationId, city: "Essen" }),
    ]);
    expect((await authed("get", list, outsider)).body).toEqual([]);
    expect((await authed("delete", favorite, outsider)).status).toBe(204);
    expect((await authed("get", list)).body).toHaveLength(1);
    expect((await authed("put", orgPath("/publication")).send({ locationId, published: false })).status).toBe(200);
    expect((await authed("get", list)).body).toEqual([]);
    expect((await authed("put", favorite, outsider)).status).toBe(404);
    expect((await authed("delete", favorite)).status).toBe(204);
    expect((await authed("delete", favorite)).status).toBe(204);
    expect((await authed("put", orgPath("/publication")).send({ locationId, published: true })).status).toBe(200);
    expect((await authed("get", list)).body).toEqual([]);
  });

  it("publishes only an active employee's explicit public name at their salon", async () => {
    const listing = (await authed("get", orgPath("/workspace"))).body.locations.find((entry: { id: string }) => entry.id === locationId);
    const profile = () => request(app).get(`/api/businesses/${listing.slug}`);
    expect((await profile()).body.staff).toEqual([]);
    const payload = { displayName: "Internal Staff Name", publicName: "  Alex  ", email: "private@example.com",
      phone: "1234", locationId, active: true, workingHours: [] };
    const created = await authed("post", orgPath("/employees")).send(payload);
    expect(created.status).toBe(201);
    const staffId = created.body.employees.find((entry: { publicName: string }) => entry.publicName === "Alex").id;
    expect((await profile()).body.staff).toEqual([{ id: staffId, name: "Alex" }]);
    const denied = await authed("put", orgPath(`/employees/${staffId}`), outsider).send({ ...payload, publicName: "" });
    expect(denied.status).toBe(403);
    expect((await profile()).body.staff).toEqual([{ id: staffId, name: "Alex" }]);
    expect((await authed("put", orgPath(`/employees/${staffId}`)).send({ ...payload, active: false })).status).toBe(200);
    expect((await profile()).body.staff).toEqual([]);
    expect((await authed("put", orgPath(`/employees/${staffId}`)).send({ ...payload, publicName: "" })).status).toBe(200);
    expect((await profile()).body.staff).toEqual([]);
  });
  it("creates staff with working-hour templates without granting account access implicitly", async () => {
    workerId = (await authed("get", "/api/me", worker)).body.id;
    const res = await authed("post", orgPath("/employees")).send({
      displayName: "Invited Worker", email: `${worker}@example.com`, phone: "", locationId, active: true,
      workingHours: [{ weekday: 1, opens: "10:00", closes: "16:00" }],
    });
    expect(res.status).toBe(201);
    expect(res.body.memberships).toHaveLength(1);
    expect(res.body.employees.find((entry: { email: string }) => entry.email === `${worker}@example.com`).workingHours).toHaveLength(1);
  });
  it("hashes invitation tokens and refuses the wrong verified recipient", async () => {
    const res = await authed("post", orgPath("/invitations")).send({ email: `${worker}@example.com`, role: "employee", locationId });
    expect(res.status).toBe(201);
    invitationToken = res.body.token;
    const [invite] = await db.select().from(staffInvitations).where(eq(staffInvitations.tokenHash, createHash("sha256").update(invitationToken).digest("hex")));
    expect(invite).toBeTruthy();
    expect(JSON.stringify(invite)).not.toContain(invitationToken);
    expect((await authed("post", "/api/invitations/accept", outsider).send({ token: invitationToken })).status).toBe(403);
  });
  it("atomically accepts a valid intended-recipient invitation only once", async () => {
    const results = await Promise.all([1, 2].map(() => authed("post", "/api/invitations/accept", worker).send({ token: invitationToken })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    const profile = await authed("get", "/api/me", worker);
    workerId = profile.body.id;
    const view = await authed("get", orgPath("/workspace"), worker);
    expect(view.status).toBe(200);
    expect(view.body.role).toBe("employee");
    expect(view.body.memberships).toEqual([]);
    expect(view.body.invitations).toEqual([]);
    expect(view.body.employees.every((employee: { userId: string }) => employee.userId === workerId)).toBe(true);
  });
  it("denies employee role escalation and revokes inactive membership access", async () => {
    const view = await authed("get", orgPath("/workspace"));
    const workerMembership = view.body.memberships.find((member: { userId: string }) => member.userId === workerId);
    expect((await authed("put", orgPath(`/members/${workerMembership.id}`), worker).send({ role: "manager", status: "active" })).status).toBe(403);
    const removed = await authed("put", orgPath(`/members/${workerMembership.id}`)).send({ role: "employee", status: "inactive" });
    expect(removed.status).toBe(200);
    expect((await authed("get", orgPath("/workspace"), worker)).status).toBe(403);
    expect((await db.select().from(auditEvents).where(and(eq(auditEvents.organizationId, orgId), eq(auditEvents.action, "membership.changed")))).length).toBeGreaterThan(0);
  });
  it("rejects expired invitations", async () => {
    const invite = await authed("post", orgPath("/invitations")).send({ email: `${worker}@example.com`, role: "employee", locationId });
    await db.update(staffInvitations).set({ expiresAt: new Date(0) }).where(eq(staffInvitations.tokenHash, createHash("sha256").update(invite.body.token).digest("hex")));
    expect((await authed("post", "/api/invitations/accept", worker).send({ token: invite.body.token })).status).toBe(400);
  });
  it("allows independent manager membership without allowing manager role grants or owner publication", async () => {
    const view = await authed("get", orgPath("/workspace"));
    const member = view.body.memberships.find((entry: { userId: string }) => entry.userId === workerId);
    expect((await authed("put", orgPath(`/members/${member.id}`)).send({ role: "manager", status: "active" })).status).toBe(200);
    expect((await authed("get", orgPath("/workspace"), worker)).body.role).toBe("manager");
    expect((await authed("put", orgPath(`/members/${member.id}`), worker).send({ role: "manager", status: "active" })).status).toBe(403);
    expect((await authed("post", orgPath("/invitations"), worker).send({ email: "another@example.com", role: "manager", locationId })).status).toBe(403);
    expect((await authed("put", orgPath("/publication"), worker).send({ locationId, published: false })).status).toBe(403);
    expect((await authed("get", "/api/admin/workspace", worker)).status).toBe(403);
    const service = view.body.services.find((entry: { id: string }) => entry.id === serviceId);
    const { id: _id, archived: _archived, ...data } = service;
    expect((await authed("put", orgPath(`/services/${serviceId}`), worker).send(data)).status).toBe(200);
    expect((await authed("get", `/api/organizations/${otherOrg}/workspace`, worker)).status).toBe(403);
  });
  it("keeps unpublished services out of discovery despite valid tenant data", async () => {
    const service = (await authed("get", orgPath("/workspace"))).body.services[0];
    const { id: _id, archived: _archived, variants: _variants, ...data } = service;
    const res = await authed("post", orgPath("/services")).send({ ...data, name: "Private Draft Treatment", published: false, variants: [] });
    expect(res.status).toBe(201);
    const publicView = await request(app).get(`/api/businesses/${res.body.locations[0].slug}`);
    expect(publicView.body.services.some((item: { name: string }) => item.name === "Private Draft Treatment")).toBe(false);
    expect((await request(app).get("/api/businesses").query({ q: "Private Draft Treatment" })).body).toEqual([]);
  });
  it("soft-archives services without losing stable references or exposing them publicly", async () => {
    expect((await authed("delete", orgPath(`/services/${serviceId}`))).status).toBe(200);
    const [service] = await db.select().from(services).where(eq(services.id, serviceId));
    expect(service?.archived).toBe(true);
    expect(service?.published).toBe(false);
    const view = await authed("get", orgPath("/workspace"));
    expect((await request(app).get(`/api/businesses/${view.body.locations[0].slug}`)).body.services).toEqual([]);
  });
  it("isolates payment references and provides export/deletion workflow without raw card data", async () => {
    expect((await authed("post", "/api/me/payment-methods").send({ cardNumber: "not-a-real-card", cvv: "not-a-cvv" })).status).toBe(404);
    await db.insert(paymentReferences).values({ userId: ownerId, provider: "test-unconfigured", providerCustomerId: "opaque-test-reference" });
    expect((await authed("get", "/api/me/payment-methods")).body).toHaveLength(1);
    expect((await authed("get", "/api/me/payment-methods", outsider)).body).toEqual([]);
    const exported = await authed("get", "/api/me/export");
    expect(exported.body.profile.id).toBe(ownerId);
    expect(exported.body.organizations.some((org: { id: string }) => org.id === otherOrg)).toBe(false);
    expect((await authed("post", "/api/me/deletion-requests")).status).toBe(200);
    expect((await authed("get", "/api/me")).body.deletionRequested).toBe(true);
    const columns = await pool.query("select column_name from information_schema.columns where table_name='payment_provider_references'");
    expect(columns.rows.map((row: { column_name: string }) => row.column_name)).not.toContain("card_number");
    expect(columns.rows.map((row: { column_name: string }) => row.column_name)).not.toContain("cvv");
  });
  it("publishes only administrator-assigned homepage photos and clears placements on deletion", async () => {
    const path = "/api/admin/homepage-gallery";
    const publicPath = "/api/marketplace/homepage-images";
    const call = (method: "get" | "post" | "put" | "delete", route = path, actor = worker) =>
      authed(method, route, actor).set("X-Forwarded-For", "192.0.2.87");
    const read = (route: string) => request(app).get(route).set("X-Forwarded-For", "192.0.2.87");
    const photo = readFileSync(new URL("../../../../tests/fixtures/gallery-photo.png", import.meta.url));
    expect((await read(path)).status).toBe(401);
    expect((await call("get", path, owner)).status).toBe(403);
    await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, workerId));
    let photoId: string | undefined;
    try {
      const uploaded = await call("post").query({ alt: "Homepage QA" }).set("Content-Type", "image/png").send(photo);
      expect(uploaded.status).toBe(201);
      photoId = uploaded.body.id;
      expect((await read(publicPath + "/" + photoId)).status).toBe(404);
      expect((await call("get", path + "/" + photoId)).status).toBe(200);
      expect((await call("put", path + "/placements/category:missing").send({ photoId })).status).toBe(404);
      for (const target of ["hero", "category:friseur"]) {
        expect((await call("put", path + "/placements/" + target).send({ photoId })).status).toBe(204);
      }
      expect((await read(publicPath)).body).toEqual(expect.arrayContaining([
        { target: "hero", id: photoId, alt: "Homepage QA" },
        { target: "category:friseur", id: photoId, alt: "Homepage QA" },
      ]));
      expect((await read(publicPath + "/" + photoId)).body).toEqual(photo);
      expect((await call("delete", path + "/" + photoId)).status).toBe(204);
      expect((await read(publicPath)).body).toEqual([]);
      expect((await read(publicPath + "/" + photoId)).status).toBe(404);
      photoId = undefined;
    } finally {
      if (photoId) await call("delete", path + "/" + photoId);
      await db.update(users).set({ isPlatformAdmin: false }).where(eq(users.id, workerId));
    }
  });

  it("denies platform endpoints to guests, consumers and business owners", async () => {
    const headers = { "X-Forwarded-For": "192.0.2.82" };
    for (const path of ["/api/admin/platform-analytics", "/api/admin/customers", "/api/admin/platform-settings"]) {
      expect((await request(app).get(path).set(headers)).status).toBe(401);
      expect((await authed("get", path, consumer).set(headers)).status).toBe(403);
      expect((await authed("get", path, owner).set(headers)).status).toBe(403);
    }
    expect((await authed("put", "/api/admin/platform-settings", consumer).set(headers).send({})).status).toBe(403);
    expect((await authed("put", "/api/admin/platform-settings", owner).set(headers).send({})).status).toBe(403);
  });
  it("isolates customer administration and records one review without clearing the deletion request", async () => {
    const path = "/api/admin/customers";
    const review = path + "/" + ownerId + "/deletion-review";
    const call = (method: "get" | "put" | "post", url: string, actor = worker) =>
      authed(method, url, actor).set("X-Forwarded-For", "192.0.2.72");
    expect((await request(app).get(path)).status).toBe(401);
    expect((await call("get", path, owner)).status).toBe(403);
    expect((await call("put", review, owner)).status).toBe(403);
    await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, workerId));
    try {
      const pending = await call("get", path).query({ scope: "pending", search: owner + "@example.com" });
      expect(pending.status).toBe(200);
      expect(pending.body.customers).toEqual([expect.objectContaining({ id: ownerId, activeOwnerships: 2, reviewedAt: null })]);
      const [customer] = pending.body.customers;
      expect(Object.keys(customer).sort()).toEqual(["activeOwnerships", "canRehearseErasure", "deletionRequestedAt", "email", "emailVerified", "id", "name", "reviewedAt"]);
      expect((await call("put", review).send({ requestedAt: new Date(0).toISOString() })).status).toBe(409);
      const attempts = await Promise.all([1, 2].map(() => call("put", review).send({ requestedAt: customer.deletionRequestedAt })));
      expect(attempts.map(({ status }) => status)).toEqual([200, 200]);
      expect(attempts[0]!.body).toEqual(attempts[1]!.body);
      expect(await db.select().from(deletionRequestReviews).where(eq(deletionRequestReviews.userId, ownerId)))
        .toEqual([expect.objectContaining({ reviewerId: workerId })]);
      await call("post", "/api/me/deletion-requests", owner);
      expect((await call("get", path).query({ scope: "pending", search: owner })).body.customers).toEqual([]);
      expect((await call("get", path).query({ scope: "reviewed", search: owner })).body.customers)
        .toEqual([expect.objectContaining({ id: ownerId, deletionRequestedAt: customer.deletionRequestedAt, reviewedAt: expect.any(String) })]);
      expect((await call("get", "/api/me", owner)).body.deletionRequested).toBe(true);
      const assessment = path + "/" + ownerId + "/deletion-assessment";
      expect((await call("get", assessment, owner)).status).toBe(403);
      const counts = await call("get", assessment);
      expect(counts.status).toBe(200);
      expect(counts.body).toMatchObject({ activeOwnerships: 2, paymentReferences: 1,
        businessActions: expect.any(Number), staffProfiles: expect.any(Number) });
      const withdraw = "/api/me/deletion-requests/withdraw";
      expect((await call("post", withdraw, owner).send({ requestedAt: new Date(0).toISOString() })).status).toBe(409);
      expect((await Promise.all([1, 2].map(() => call("post", withdraw, owner)
        .send({ requestedAt: customer.deletionRequestedAt })))).map(({ status }) => status)).toEqual([204, 204]);
      expect((await call("get", "/api/me", owner)).body).toMatchObject({ deletionRequested: false, deletionRequestedAt: null });
      expect((await call("get", assessment)).status).toBe(404);
      expect((await call("get", path).query({ scope: "reviewed", search: owner })).body.customers).toEqual([]);
      expect((await call("post", "/api/me/deletion-requests", owner)).status).toBe(200);
      expect((await call("post", withdraw, owner).send({ requestedAt: customer.deletionRequestedAt })).status).toBe(409);
      expect((await call("put", review).send({ requestedAt: customer.deletionRequestedAt })).status).toBe(409);
      expect((await call("get", path).query({ scope: "pending", search: owner })).body.customers)
        .toEqual([expect.objectContaining({ id: ownerId, reviewedAt: null })]);

    } finally {
      await db.update(users).set({ isPlatformAdmin: false }).where(eq(users.id, workerId));
    }
  });
  it("isolates support conversations and records replies and state changes", async () => {
    const mine = "/api/me/support-cases";
    const admin = "/api/admin/support-cases";
    const call = (method: "get" | "post" | "put", path: string, actor = owner) =>
      authed(method, path, actor).set("X-Forwarded-For", "192.0.2.73");
    const submission = { subject: "Synthetic booking question", body: "Please check my booking.", requestId: randomUUID() };
    expect((await request(app).get(mine)).status).toBe(401);
    const created = await Promise.all([submission, submission].map((entry) => call("post", mine).send(entry)));
    expect(created.map(({ status }) => status).sort()).toEqual([200, 201]);
    const id = created[0]!.body.id;
    expect((await call("get", mine, outsider)).body.cases).toEqual([]);
    expect((await call("get", mine + "/" + id, outsider)).status).toBe(404);
    expect((await call("post", mine + "/" + id + "/messages", outsider).send(submission)).status).toBe(400);
    expect((await call("post", mine + "/" + id + "/messages", outsider)
      .send({ body: "Other customer", requestId: randomUUID() })).status).toBe(404);
    expect((await call("get", admin)).status).toBe(403);
    await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, workerId));
    try {
      expect((await call("get", admin, worker).query({ state: "open" })).body.cases)
        .toContainEqual(expect.objectContaining({ id }));
      const reply = { body: "Happy to help.", requestId: randomUUID() };
      const replies = await Promise.all([reply, reply].map((entry) => call("post", admin + "/" + id + "/messages", worker).send(entry)));
      expect(replies.map(({ status }) => status)).toEqual([204, 204]);
      const transition = (state: string) => call("put", admin + "/" + id + "/state", worker).send({ state });
      expect((await Promise.all([transition("resolved"), transition("resolved")])).map(({ status }) => status)).toEqual([204, 204]);
      expect((await call("post", mine + "/" + id + "/messages").send({ body: "Follow-up", requestId: randomUUID() })).status).toBe(409);
      expect((await transition("open")).status).toBe(204);
      const thread = await call("get", mine + "/" + id);
      expect(thread.body.messages.map(({ kind }: { kind: string }) => kind)).toEqual(["customer", "staff", "resolved", "reopened"]);
      expect(Object.keys(thread.body.messages[1]).sort()).toEqual(["body", "createdAt", "id", "kind"]);
      const downloaded = await call("get", "/api/me/export");
      expect(downloaded.body.records.supportCases).toEqual([expect.objectContaining({ id,
        messages: expect.arrayContaining([expect.objectContaining({ body: "Happy to help.", kind: "staff" })]) })]);
      expect(downloaded.body.records.supportCases[0].messages[1]).not.toHaveProperty("actorId");
      expect((await call("get", "/api/me/export", outsider)).body.records.supportCases).toEqual([]);

    } finally {
      await db.update(users).set({ isPlatformAdmin: false }).where(eq(users.id, workerId));
    }
  });
  it("erases only reviewed synthetic accounts and prevents their reprovisioning", async () => {
    const providerId = `qa-erasure-${randomUUID()}+clerk_test`;
    const profile = "/api/me";
    const call = (method: "get" | "post" | "put", path: string, actor = worker) =>
      authed(method, path, actor).set("X-Forwarded-For", "192.0.2.77");
    const { body: { id } } = await call("get", profile, providerId);
    const digest = createHash("sha256").update(providerId).digest("hex");
    const marker = eq(erasedTestIdentities.providerDigest, digest);
    const payment = eq(paymentReferences.userId, id);
    const route = `/api/admin/customers/${id}`;
    const erase = route + "/test-erasure";
    await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, workerId));
    try {
      expect((await call("post", profile + "/support-cases", providerId)
        .send({ subject: "Synthetic erasure fixture", body: "Synthetic support data.", requestId: randomUUID() })).status).toBe(201);
      expect((await call("post", profile + "/deletion-requests", providerId)).status).toBe(200);
      const { body: { deletionRequestedAt: requestedAt } } = await call("get", profile, providerId);
      vi.stubEnv("BEAUTYHUB_TEST_ERASURE", "0");
      expect((await call("post", erase).send({ requestedAt })).status).toBe(404);
      vi.stubEnv("BEAUTYHUB_TEST_ERASURE", "1");
      vi.stubEnv("CLERK_SECRET_KEY", "sk_live_fixture");
      expect((await call("post", erase).send({ requestedAt })).status).toBe(404);
      vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
      expect((await call("post", erase, owner).send({ requestedAt })).status).toBe(403);
      expect((await call("post", erase).send({ requestedAt })).status).toBe(409);
      expect((await call("put", route + "/deletion-review").send({ requestedAt })).status).toBe(200);
      const directory = await call("get", "/api/admin/customers").query({ scope: "reviewed", search: providerId });
      expect(directory.body.customers).toEqual([expect.objectContaining({ id, canRehearseErasure: true })]);
      expect((await call("post", erase).send({ requestedAt: new Date(0).toISOString() })).status).toBe(409);

      await db.insert(paymentReferences).values({ userId: id, provider: "test-retained", providerCustomerId: randomUUID() });
      expect((await call("post", erase).send({ requestedAt })).status).toBe(409);
      expect(await db.select().from(erasedTestIdentities).where(marker)).toHaveLength(0);
      expect((await call("get", profile, providerId)).status).toBe(200);
      await db.delete(paymentReferences).where(payment);

      expect((await call("post", erase).send({ requestedAt })).status).toBe(204);
      expect(await db.select().from(supportCases).where(eq(supportCases.customerId, id))).toHaveLength(0);
      expect(await db.select().from(erasedTestIdentities).where(marker))
        .toEqual([expect.objectContaining({ actorId: workerId })]);
      expect((await call("get", profile, providerId)).status).toBe(401);
      expect(await db.select().from(users).where(eq(users.externalIdentityId, providerId))).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
      await db.delete(paymentReferences).where(payment);
      await db.delete(users).where(eq(users.id, id));
      await db.delete(erasedTestIdentities).where(marker);
      await db.update(users).set({ isPlatformAdmin: false }).where(eq(users.id, workerId));
    }
  });

  it("enforces SaaS trial, simulated billing and location limits for the business account", async () => {
    const saas = orgPath("/saas");
    const plans = "/api/admin/saas-plans";
    const subscriptionRequest = (method: "get" | "post" | "put", path: string, user = owner) =>
      authed(method, path, user).set("X-Forwarded-For", "192.0.2.70");
    const change = (body: object) => subscriptionRequest("post", saas + "/changes").send(body);
    const initial = await subscriptionRequest("get", saas);
    expect(initial.status).toBe(200);
    expect(initial.body).toMatchObject({ current: { state: "trial", planCode: "professional" },
      history: [expect.objectContaining({ action: "trial", amountCents: 0 })] });
    expect((await subscriptionRequest("get", saas, worker)).status).toBe(403);
    expect((await subscriptionRequest("get", saas, outsider)).status).toBe(403);
    expect((await subscriptionRequest("get", plans)).status).toBe(403);
    await db.update(saasSubscriptions).set({ periodEndsAt: new Date(0) }).where(eq(saasSubscriptions.organizationId, orgId));
    expect((await subscriptionRequest("get", saas)).body.current.state).toBe("expired");
    const location = {
      name: "SaaS location", country: "DE", postalCode: "45127", city: "Essen", street: "Teststraße", houseNumber: "12a",
      addressExtra: "", district: "", timezone: "Europe/Berlin", latitude: null, longitude: null,
      leadTimeHours: 4, advanceBookingDays: 60, contactPreference: "email", openingHours: [],
    };
    const createLocation = () => subscriptionRequest("post", orgPath("/locations")).send(location);
    expect((await createLocation()).body.code).toBe("SAAS_LOCATION_LIMIT");
    const starter = { action: "activate", planCode: "starter", expectedCents: 2900, requestId: randomUUID() };
    expect((await change({ ...starter, expectedCents: 1 })).status).toBe(409);
    expect((await Promise.all([change(starter), change(starter)])).map(({ status }) => status)).toEqual([204, 204]);
    expect((await createLocation()).body.code).toBe("SAAS_LOCATION_LIMIT");
    const [original] = await db.select().from(saasPlans).where(eq(saasPlans.code, "enterprise"));
    await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, workerId));
    try {
      const { code: _code, ...terms } = original!;
      const enterprise = { ...terms, monthlyCents: 12345, locationLimit: initial.body.locationCount + 1 };
      expect((await subscriptionRequest("put", plans + "/enterprise", worker).send(enterprise)).status).toBe(200);
      expect((await change({ ...starter, requestId: randomUUID(), planCode: "enterprise", expectedCents: 12345 })).status).toBe(204);
      expect((await Promise.all([createLocation(), createLocation()])).map(({ status }) => status).sort()).toEqual([201, 409]);
      expect((await change({ ...starter, requestId: randomUUID() })).status).toBe(204);
      expect((await createLocation()).body.code).toBe("SAAS_LOCATION_LIMIT");
      expect((await change({ action: "cancel", requestId: randomUUID() })).status).toBe(204);
      expect((await createLocation()).body.code).toBe("SAAS_LOCATION_LIMIT");
      const final = (await subscriptionRequest("get", saas)).body;
      expect(final.current.state).toBe("cancelled");
      expect(final.locationCount).toBe(initial.body.locationCount + 1);
      expect(final.history.map((event: { amountCents: number }) => event.amountCents)).toEqual([0, 2900, 12345, 2900, 0]);
    } finally {
      await db.update(users).set({ isPlatformAdmin: false }).where(eq(users.id, workerId));
      const { code: _code, ...terms } = original!;
      await db.update(saasPlans).set(terms).where(eq(saasPlans.code, "enterprise"));
    }
  });
  it("reconciles platform aggregates and applies audited intake settings", async () => {
    const analytics = "/api/admin/platform-analytics";
    const settings = "/api/admin/platform-settings";
    const call = (method: "get" | "post" | "put", path: string, actor = worker) =>
      authed(method, path, actor).set("X-Forwarded-For", "192.0.2.74");
    expect((await request(app).get(analytics)).status).toBe(401);
    expect((await call("get", analytics, owner)).status).toBe(403);
    expect((await call("put", settings, owner)).status).toBe(403);
    await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, workerId));
    const open = { businessRegistrationOpen: true, supportIntakeOpen: true };
    const closed = { businessRegistrationOpen: false, supportIntakeOpen: false };
    try {
      const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", dateStyle: "short" }).format(new Date());
      const report = await call("get", analytics).query({ from: date, to: date });
      expect(report.status).toBe(200);
      expect(report.body.timezone).toBe("Europe/Berlin");
      const activations = await db.select().from(saasChanges).where(eq(saasChanges.action, "activate"));
      expect(report.body.billing).toEqual({ activations: activations.length,
        simulatedCents: activations.reduce((sum, row) => sum + row.amountCents, 0) });
      expect(report.body.business.total).toBe((await db.select().from(organizations).where(eq(organizations.isDemo, false))).length);
      const cases = await db.select().from(supportCases);
      expect(report.body.support).toEqual({ open: cases.filter((row) => row.state === "open").length,
        resolved: cases.filter((row) => row.state === "resolved").length });
      expect((await call("get", analytics).query({ from: "2025-01-01", to: "2026-01-02" })).status).toBe(400);
      const support = "/api/me/support-cases";
      const original = { subject: "Intake fixture", body: "Testing the pause.", requestId: randomUUID() };
      const caseReply = await call("post", support, owner).send(original);
      expect(caseReply.status).toBe(201);
      expect((await call("get", settings)).body.current).toEqual(open);
      const toggle = { expected: open, next: closed };
      expect((await Promise.all([toggle, toggle].map((body) => call("put", settings).send(body))))
        .map(({ status }) => status)).toEqual([204, 204]);
      expect((await call("put", settings).send({ expected: open, next: { ...open, supportIntakeOpen: false } })).status).toBe(409);
      expect((await call("post", "/api/organizations", owner).send({ name: "Paused fixture", categoryId })).body.code).toBe("PLATFORM_INTAKE_PAUSED");
      expect((await call("post", support, owner).send({ ...original, requestId: randomUUID() })).body.code).toBe("PLATFORM_INTAKE_PAUSED");
      expect((await call("post", support, owner).send(original)).status).toBe(200);
      expect((await call("post", support + "/" + caseReply.body.id + "/messages", owner)
        .send({ body: "Existing conversations continue.", requestId: randomUUID() })).status).toBe(204);
      expect((await call("put", settings).send({ expected: closed, next: open })).status).toBe(204);
      const review = await call("get", settings);
      expect(review.body.current).toEqual(open);
      expect(review.body.history).toHaveLength(2);
      expect((await db.select().from(platformSettingChanges)).every((row) => row.actorId === workerId)).toBe(true);
    } finally {
      await db.update(platformSettings).set(open).where(eq(platformSettings.id, 1));
      await db.delete(platformSettingChanges).where(eq(platformSettingChanges.actorId, workerId));
      await db.update(users).set({ isPlatformAdmin: false }).where(eq(users.id, workerId));
    }
  });
  it("preserves all original synthetic businesses and services", async () => {
    const originals = await db.select().from(locations).where(inArray(locations.slug, ["atelier-haar", "studio-ruhe", "nail-atelier"]));
    expect(originals).toHaveLength(3);
    const originalServices = await db.select().from(services).where(inArray(services.locationId, originals.map((loc) => loc.id)));
    expect(originalServices).toHaveLength(9);
  });
});
