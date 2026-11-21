import { clerkClient, getAuth } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import type { Request, RequestHandler } from "express";
import { db, users, memberships, type User } from "@workspace/db";
import { HttpError } from "../lib/http-error";
import { synchronizeIdentity } from "../services/identity";

declare global {
  // Express' documented request extension point is its global namespace.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { identity?: User; organizationRole?: "owner" | "manager" | "employee" }
  }
}

export async function loadIdentity(req: Request): Promise<User | undefined> {
  if (req.identity) return req.identity;
  const auth = getAuth(req);
  const providerId = auth?.sessionClaims?.userId || auth?.userId;
  if (typeof providerId !== "string" || !providerId) return undefined;
  const [existing] = await db.select().from(users).where(eq(users.externalIdentityId, providerId));
  if (existing && !["/me", "/auth/session"].includes(req.path)) {
    req.identity = existing; return existing;
  }
  const providerUser = await clerkClient.users.getUser(providerId);
  const primaryEmail = providerUser.emailAddresses.find((email) => email.id === providerUser.primaryEmailAddressId);
  if (existing) {
    const [refreshed] = await db.update(users).set({
      email: primaryEmail?.emailAddress.trim().toLowerCase() ?? "",
      emailVerified: primaryEmail?.verification?.status === "verified",
    }).where(eq(users.id, existing.id)).returning();
    req.identity = refreshed!;
    return req.identity;
  }
  req.identity = await synchronizeIdentity({
    externalIdentityId: providerId,
    email: primaryEmail?.emailAddress ?? "",
    emailVerified: primaryEmail?.verification?.status === "verified",
    displayName: [providerUser.firstName, providerUser.lastName].filter(Boolean).join(" ") || providerUser.username || "BeautyHub Mitglied",
  });
  return req.identity;
}

export const requireAuthentication: RequestHandler = async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!await loadIdentity(req)) throw new HttpError(401, "Bitte melde dich an.", "AUTHENTICATION_REQUIRED");
  next();
};

export const requireOrganization: RequestHandler = async (req, _res, next) => {
  const id = req.params.organizationId;
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new HttpError(400, "Ungültige Organisationsadresse.");
  const [membership] = await db.select().from(memberships).where(and(
    eq(memberships.userId, req.identity!.id),
    eq(memberships.organizationId, id),
    eq(memberships.status, "active"),
  ));
  if (!membership) throw new HttpError(403, "Kein Zugriff auf dieses Unternehmen.", "FORBIDDEN");
  req.organizationRole = membership.role;
  next();
};

export function allowRoles(...roles: Array<"owner" | "manager" | "employee">): RequestHandler {
  return (req, _res, next) => {
    if (!req.organizationRole || !roles.includes(req.organizationRole)) throw new HttpError(403, "Dafür fehlt dir die Berechtigung.", "FORBIDDEN");
    next();
  };
}
