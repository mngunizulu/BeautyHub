import { db, users, type User } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function synchronizeIdentity(trusted: {
  externalIdentityId: string; email: string; emailVerified: boolean; displayName: string;
}): Promise<User> {
  const [user] = await db.insert(users).values({
    ...trusted, email: trusted.email.toLowerCase().trim(),
  }).onConflictDoNothing({ target: users.externalIdentityId }).returning();
  if (user) return user;
  const [existing] = await db.select().from(users).where(eq(users.externalIdentityId, trusted.externalIdentityId));
  if (!existing) throw new Error("Identity provisioning failed");
  return existing;
}

export const publicProfile = (user: User) => ({
  id: user.id, email: user.email, emailVerified: user.emailVerified,
  displayName: user.displayName, phone: user.phone,
  emailNotifications: user.emailNotifications, marketingConsent: user.marketingConsent,
  isPlatformAdmin: user.isPlatformAdmin, deletionRequested: user.deletionRequestedAt !== null,
});
