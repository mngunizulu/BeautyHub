import { randomUUID, createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import {
  db, pool, users, organizations, memberships, locations, services, categories,
  employees, employeeServices, serviceVariants, cancellationPolicies, staffInvitations,
  auditEvents, paymentReferences, serviceGroups,
} from "@workspace/db";
import app from "../app";

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
  const identities = await db.select().from(users).where(inArray(users.externalIdentityId, [owner, outsider, worker]));
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
    const res = await authed("post", "/api/organizations").send({ name: `Test Studio ${suffix}`, categoryId });
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
      contactEmail: "studio@example.com", phone: "+49 201 123456", website: "", categoryId, onboardingStep: 2,
    };
    expect((await authed("put", orgPath("/profile")).send({ ...profile, contactEmail: "invalid" })).status).toBe(400);
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
    const policy = { noticeHours: 48, lateFeeType: "percentage", lateFeeValue: 50, noShowFeeType: "fixed", noShowFeeValue: 10000, waiverAllowed: true, exceptions: "Individual waiver after review" };
    expect((await authed("put", orgPath("/policy")).send({ ...policy, lateFeeValue: 101 })).status).toBe(400);
    const res = await authed("put", orgPath("/policy")).send(policy);
    expect(res.status).toBe(200);
    expect(res.body.policies).toHaveLength(2);
    expect(res.body.policies[0]).toMatchObject({ version: 2, noticeHours: 48 });
    expect(res.body.policies[1].noticeHours).toBe(24);
  });
  it("publishes only explicitly and public cities/services reflect actual saved data", async () => {
    const res = await authed("put", orgPath("/publication")).send({ locationId, published: true });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const publicProfile = await request(app).get(`/api/businesses/${res.body.locations[0].slug}`);
    expect(publicProfile.status).toBe(200);
    expect(publicProfile.body).toMatchObject({ city: "Essen", isDemo: false });
    expect(publicProfile.body.services[0]).toMatchObject({ name: "Facial Test", priceCents: 6500 });
    expect((await request(app).get("/api/marketplace/summary")).body.cities).toContain("Essen");
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
  it("preserves all original synthetic businesses and services", async () => {
    const originals = await db.select().from(locations).where(inArray(locations.slug, ["atelier-haar", "studio-ruhe", "nail-atelier"]));
    expect(originals).toHaveLength(3);
    const originalServices = await db.select().from(services).where(inArray(services.locationId, originals.map((loc) => loc.id)));
    expect(originalServices).toHaveLength(9);
  });
});
