import { describe, expect, it } from "vitest";
import { canAccessAdministration, canAccessOrganization, type Principal } from "./authorization";

const owner: Principal = {
  userId: "synthetic-owner", isPlatformAdmin: false,
  memberships: [{ organizationId: "org-a", role: "owner" }],
};
describe("fail-closed authorization policy", () => {
  it("denies anonymous business and administrator access", () => {
    expect(canAccessOrganization(null, "org-a")).toBe(false);
    expect(canAccessAdministration(null)).toBe(false);
  });
  it("permits membership in the exact organization", () => {
    expect(canAccessOrganization(owner, "org-a")).toBe(true);
  });
  it("denies cross-tenant access", () => {
    expect(canAccessOrganization(owner, "org-b")).toBe(false);
  });
  it("does not turn an owner into a platform administrator", () => {
    expect(canAccessAdministration(owner)).toBe(false);
  });
  it("enforces allowed roles for sensitive operations", () => {
    const employee: Principal = { ...owner, memberships: [{ organizationId: "org-a", role: "employee" }] };
    expect(canAccessOrganization(employee, "org-a", ["owner", "manager"])).toBe(false);
  });
  it("requires a matching membership even for administrators to access salon-private records", () => {
    const admin: Principal = { userId: "synthetic-admin", isPlatformAdmin: true, memberships: [] };
    expect(canAccessAdministration(admin)).toBe(true);
    expect(canAccessOrganization(admin, "org-a")).toBe(false);
  });
  it("supports independent roles across multiple memberships", () => {
    const multi: Principal = { ...owner, memberships: [...owner.memberships, { organizationId: "org-b", role: "employee" }] };
    expect(canAccessOrganization(multi, "org-b")).toBe(true);
    expect(canAccessOrganization(multi, "org-b", ["owner"])).toBe(false);
  });
});
