export type BusinessRole = "owner" | "manager" | "employee";
export interface Principal {
  userId: string;
  isPlatformAdmin: boolean;
  memberships: ReadonlyArray<{ organizationId: string; role: BusinessRole; status: "active" | "inactive" | "removed" }>;
}

// Callers must construct principals from verified identity and persisted memberships.
// Platform administration does not implicitly grant access to private salon CRM.
export function canAccessOrganization(
  principal: Principal | null,
  organizationId: string,
  allowedRoles: readonly BusinessRole[] = ["owner", "manager", "employee"],
): boolean {
  return !!principal && principal.memberships.some(
    (membership) => membership.status === "active" && membership.organizationId === organizationId && allowedRoles.includes(membership.role),
  );
}

export function canAccessAdministration(principal: Principal | null): boolean {
  return principal?.isPlatformAdmin === true;
}
