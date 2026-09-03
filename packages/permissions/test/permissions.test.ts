import { describe, expect, it } from "vitest";
import {
  can,
  canVerifySavingsCase,
  hasCentreAccess,
  isPrivilegedRole,
  scopeFor,
} from "../src/index";

describe("privileged roles (MFA policy)", () => {
  it("director, manager and technical_admin are privileged", () => {
    expect(isPrivilegedRole("director")).toBe(true);
    expect(isPrivilegedRole("manager")).toBe(true);
    expect(isPrivilegedRole("technical_admin")).toBe(true);
  });

  it("reception_admin and clinician are not privileged", () => {
    expect(isPrivilegedRole("reception_admin")).toBe(false);
    expect(isPrivilegedRole("clinician")).toBe(false);
  });
});

describe("permission matrix — matches docs/architecture/ROLE_MATRIX.md §3", () => {
  it("referrals: reception_admin has full CVUTCl, clinician view+update only", () => {
    expect(can("reception_admin", "referrals", "create")).toBe(true);
    expect(can("reception_admin", "referrals", "transfer")).toBe(true);
    expect(can("clinician", "referrals", "view")).toBe(true);
    expect(can("clinician", "referrals", "update")).toBe(true);
    expect(can("clinician", "referrals", "create")).toBe(false);
    expect(can("clinician", "referrals", "transfer")).toBe(false);
  });

  it("recurring_costs: clinician has no access at all", () => {
    expect(can("clinician", "recurring_costs", "view")).toBe(false);
    expect(can("clinician", "recurring_costs", "create")).toBe(false);
  });

  it("recurring_costs: director can view+verify but not create/update", () => {
    expect(can("director", "recurring_costs", "view")).toBe(true);
    expect(can("director", "recurring_costs", "verify")).toBe(true);
    expect(can("director", "recurring_costs", "create")).toBe(false);
  });

  it("savings: only director/manager can verify", () => {
    expect(can("director", "savings", "verify")).toBe(true);
    expect(can("manager", "savings", "verify")).toBe(true);
    expect(can("reception_admin", "savings", "verify")).toBe(false);
    expect(can("clinician", "savings", "verify")).toBe(false);
  });

  it("configuration: only technical_admin can write, director/manager view-only", () => {
    expect(can("technical_admin", "configuration", "create")).toBe(true);
    expect(can("technical_admin", "configuration", "update")).toBe(true);
    expect(can("director", "configuration", "view")).toBe(true);
    expect(can("director", "configuration", "update")).toBe(false);
    expect(can("reception_admin", "configuration", "view")).toBe(false);
  });

  it("audit: technical_admin, director and manager can view; nobody can write", () => {
    expect(can("technical_admin", "audit", "view")).toBe(true);
    expect(can("director", "audit", "view")).toBe(true);
    expect(can("manager", "audit", "view")).toBe(true);
    expect(can("technical_admin", "audit", "create")).toBe(false);
    expect(can("reception_admin", "audit", "view")).toBe(false);
    expect(can("clinician", "audit", "view")).toBe(false);
  });

  it("dashboards: reception_admin and clinician have no access", () => {
    expect(can("reception_admin", "dashboards", "view")).toBe(false);
    expect(can("clinician", "dashboards", "view")).toBe(false);
    expect(can("director", "dashboards", "view")).toBe(true);
    expect(can("manager", "dashboards", "view")).toBe(true);
  });

  it("technical_admin has no access to any business domain", () => {
    const businessDomains = [
      "referrals",
      "reception",
      "appointments",
      "work_items",
      "waste",
      "handovers",
      "capacity",
      "recurring_costs",
      "patterns",
      "savings",
      "dashboards",
    ] as const;
    for (const domain of businessDomains) {
      expect(can("technical_admin", domain, "view")).toBe(false);
      expect(can("technical_admin", domain, "create")).toBe(false);
    }
  });

  it("work_items: every role can create/view/update/transfer/close within its own scope", () => {
    for (const role of ["director", "manager", "reception_admin", "clinician"] as const) {
      expect(can(role, "work_items", "create")).toBe(true);
      expect(can(role, "work_items", "view")).toBe(true);
      expect(can(role, "work_items", "update")).toBe(true);
      expect(can(role, "work_items", "transfer")).toBe(true);
      expect(can(role, "work_items", "close")).toBe(true);
    }
  });
});

describe("scopeFor", () => {
  it("reception_admin is centre-scoped, director is org-wide, clinician is own-scoped", () => {
    expect(scopeFor("reception_admin", "referrals")).toBe("assigned_centres");
    expect(scopeFor("director", "referrals")).toBe("all");
    expect(scopeFor("clinician", "referrals")).toBe("own");
  });
});

describe("hasCentreAccess", () => {
  it("all-scope roles pass regardless of centre assignment", () => {
    expect(hasCentreAccess("director", "referrals", [], "centre-x")).toBe(true);
  });

  it("assigned_centres roles are denied for a centre they are not assigned to", () => {
    expect(hasCentreAccess("reception_admin", "referrals", ["centre-a"], "centre-b")).toBe(false);
    expect(hasCentreAccess("reception_admin", "referrals", ["centre-a"], "centre-a")).toBe(true);
  });

  it("a role with no matrix entry for the domain is denied", () => {
    expect(hasCentreAccess("clinician", "recurring_costs", ["centre-a"], "centre-a")).toBe(false);
  });
});

describe("canVerifySavingsCase — self-verification rule", () => {
  it("director may verify their own implemented case", () => {
    expect(canVerifySavingsCase("director", "user-1", "user-1")).toBe(true);
  });

  it("manager may not verify a case they personally implemented", () => {
    expect(canVerifySavingsCase("manager", "user-1", "user-1")).toBe(false);
  });

  it("manager may verify a case implemented by someone else", () => {
    expect(canVerifySavingsCase("manager", "user-1", "user-2")).toBe(true);
  });

  it("a role without verify rights can never verify", () => {
    expect(canVerifySavingsCase("reception_admin", "user-1", "user-2")).toBe(false);
  });
});
