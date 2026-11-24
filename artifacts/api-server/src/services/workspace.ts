import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db, organizations, memberships, locations, openingHours, employees, services,
  serviceGroups, employeeServices, serviceVariants, cancellationPolicies, staffInvitations, users,
} from "@workspace/db";
import { GetOrganizationWorkspaceResponse, ListMyOrganizationsResponse } from "@workspace/api-zod";
import { HttpError } from "../lib/http-error";

export async function myOrganizations(userId: string) {
  const rows = await db.select({
    id: organizations.id, name: organizations.name, role: memberships.role, status: memberships.status,
    published: sql<boolean>`coalesce(bool_or(${locations.published}),false)`,
    locationCount: sql<number>`count(${locations.id})::int`,
  }).from(memberships).innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .leftJoin(locations, eq(locations.organizationId, organizations.id))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, "active")))
    .groupBy(organizations.id, memberships.id).orderBy(asc(organizations.name));
  return ListMyOrganizationsResponse.parse(rows);
}

export async function workspace(organizationId: string, role: "owner" | "manager" | "employee", userId: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  if (!org) throw new HttpError(404, "Unternehmen nicht gefunden.");
  const locs = await db.select().from(locations).where(eq(locations.organizationId, organizationId)).orderBy(asc(locations.createdAt), asc(locations.id));
  const ids = locs.map((loc) => loc.id);
  const [hours, staff, catalog, groups, members, invites, policies] = await Promise.all([
    ids.length ? db.select().from(openingHours).where(inArray(openingHours.locationId, ids)).orderBy(asc(openingHours.weekday)) : [],
    db.select().from(employees).where(and(eq(employees.organizationId, organizationId), role === "employee" ? eq(employees.userId, userId) : undefined)),
    ids.length ? db.select().from(services).where(inArray(services.locationId, ids)).orderBy(asc(services.name)) : [],
    db.select().from(serviceGroups).where(eq(serviceGroups.organizationId, organizationId)),
    role !== "employee" ? db.select({
      id: memberships.id, userId: users.id, displayName: users.displayName, email: users.email,
      role: memberships.role, status: memberships.status,
    }).from(memberships).innerJoin(users, eq(memberships.userId, users.id)).where(eq(memberships.organizationId, organizationId)) : [],
    role !== "employee" ? db.select({
      id: staffInvitations.id, email: staffInvitations.email, role: staffInvitations.role,
      expiresAt: staffInvitations.expiresAt, acceptedAt: staffInvitations.acceptedAt,
    }).from(staffInvitations).where(eq(staffInvitations.organizationId, organizationId)) : [],
    db.select().from(cancellationPolicies).where(eq(cancellationPolicies.organizationId, organizationId)).orderBy(desc(cancellationPolicies.version)),
  ]);
  const serviceIds = catalog.map((service) => service.id);
  const [assignments, variants] = await Promise.all([
    serviceIds.length ? db.select().from(employeeServices).where(inArray(employeeServices.serviceId, serviceIds)) : [],
    serviceIds.length ? db.select().from(serviceVariants).where(and(inArray(serviceVariants.serviceId, serviceIds), eq(serviceVariants.archived, false))) : [],
  ]);
  const issues = publicationIssues(org, locs[0], catalog.filter((s) => s.locationId === locs[0]?.id), staff);
  if (!hours.some((hour) => hour.locationId === locs[0]?.id)) issues.push("Öffnungszeiten fehlen.");
  return GetOrganizationWorkspaceResponse.parse({
    id: org.id, name: org.name, role, isDemo: org.isDemo,
    profile: {
      name: org.name, description: org.description, contactEmail: org.contactEmail,
      phone: org.phone, website: org.website, socialUrl: org.socialUrl, logoUrl: org.logoUrl, categoryId: locs[0]?.categoryId,
      onboardingStep: Number(org.onboardingStep),
    },
    locations: locs.map((loc) => ({ ...loc, openingHours: hours.filter((hour) => hour.locationId === loc.id) })),
    employees: staff,
    services: catalog.map((service) => ({
      ...service, employeeIds: assignments.filter((a) => a.serviceId === service.id).map((a) => a.employeeId),
      variants: variants.filter((v) => v.serviceId === service.id),
    })),
    serviceCategories: groups,
    memberships: members,
    invitations: invites.map((invite) => ({ ...invite, expiresAt: invite.expiresAt.toISOString(), accepted: !!invite.acceptedAt })),
    policies: policies.map((policy) => ({ ...policy, createdAt: policy.createdAt.toISOString() })),
    publicationIssues: issues,
  });
}

export function publicationIssues(
  org: typeof organizations.$inferSelect,
  location: typeof locations.$inferSelect | undefined,
  catalog: Array<typeof services.$inferSelect>,
  staff: Array<typeof employees.$inferSelect>,
): string[] {
  const issues: string[] = [];
  if (!org.description.trim()) issues.push("Eine Beschreibung ist erforderlich.");
  if (!org.contactEmail.trim()) issues.push("Eine Kontakt-E-Mail ist erforderlich.");
  if (!org.phone.trim()) issues.push("Eine Telefonnummer ist erforderlich.");
  if (!location?.city.trim() || !location.street.trim() || !location.houseNumber.trim() || !/^\d{5}$/.test(location.postalCode)) issues.push("Die vollständige deutsche Adresse fehlt.");
  if (!catalog.some((service) => service.published && !service.archived)) issues.push("Mindestens eine veröffentlichte Leistung ist erforderlich.");
  if (!staff.some((employee) => employee.active && employee.locationId === location?.id)) issues.push("Mindestens eine aktive Fachkraft am Standort ist erforderlich.");
  return issues;
}
