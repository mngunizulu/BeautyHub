import { createHash } from "node:crypto";
import { db, erasedTestIdentities, users, type User } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { BookingTransaction } from "./booking-quote";

export const providerIdentityDigest = (providerId: string) =>
  createHash("sha256").update(providerId).digest("hex");

export async function lockProviderIdentity(tx: BookingTransaction, digest: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${digest}, 0))`);
}

export async function synchronizeIdentity(trusted: {
  externalIdentityId: string; email: string; emailVerified: boolean; displayName: string;
}): Promise<User | undefined> {
  return db.transaction(async (tx) => {
    const digest = providerIdentityDigest(trusted.externalIdentityId);
    await lockProviderIdentity(tx, digest);
    const [erased] = await tx.select({ digest: erasedTestIdentities.providerDigest }).from(erasedTestIdentities)
      .where(eq(erasedTestIdentities.providerDigest, digest));
    if (erased) return undefined;
    const [user] = await tx.insert(users).values({
      ...trusted, email: trusted.email.toLowerCase().trim(),
    }).onConflictDoNothing({ target: users.externalIdentityId }).returning();
    if (user) return user;
    const [existing] = await tx.select().from(users).where(eq(users.externalIdentityId, trusted.externalIdentityId));
    if (!existing) throw new Error("Identity provisioning failed");
    return existing;
  });
}

export const publicProfile = (user: User) => ({
  id: user.id, email: user.email, emailVerified: user.emailVerified,
  displayName: user.displayName, phone: user.phone,
  emailNotifications: user.emailNotifications, marketingConsent: user.marketingConsent,
  isPlatformAdmin: user.isPlatformAdmin, deletionRequested: user.deletionRequestedAt !== null,
  deletionRequestedAt: user.deletionRequestedAt?.toISOString() ?? null,
});
