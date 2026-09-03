import type { Role } from "@psych-savings/shared-types";

/**
 * Encodes docs/architecture/ROLE_MATRIX.md §3 (the permission matrix) and
 * §2 (privileged roles) as executable, testable code. If this file and
 * that document ever disagree, the document is wrong and must be updated
 * to match — this file is what the API actually enforces.
 */

export type Action = "create" | "view" | "update" | "transfer" | "close" | "verify";

export type Domain =
  | "referrals"
  | "reception"
  | "appointments"
  | "work_items"
  | "waste"
  | "handovers"
  | "capacity"
  | "recurring_costs"
  | "patterns"
  | "savings"
  | "dashboards"
  | "audit"
  | "configuration"
  | "alerts";

/**
 * "all" — organisation-wide, no centre/ownership restriction.
 * "assigned_centres" — limited to the centre(s) the user is assigned to.
 * "own" — limited to records the user owns/authored, per ROLE_MATRIX.md's "(own)" notes.
 */
export type Scope = "all" | "assigned_centres" | "own";

interface Grant {
  actions: readonly Action[];
  scope: Scope;
}

type Matrix = Record<Domain, Partial<Record<Role, Grant>>>;

const CVUTCl: readonly Action[] = ["create", "view", "update", "transfer", "close"];
const CVU: readonly Action[] = ["create", "view", "update"];

const MATRIX: Matrix = {
  referrals: {
    director: { actions: CVUTCl, scope: "all" },
    manager: { actions: CVUTCl, scope: "all" },
    reception_admin: { actions: CVUTCl, scope: "assigned_centres" },
    clinician: { actions: ["view", "update"], scope: "own" },
  },
  reception: {
    director: { actions: ["view"], scope: "all" },
    manager: { actions: CVUTCl, scope: "all" },
    reception_admin: { actions: CVUTCl, scope: "assigned_centres" },
    clinician: { actions: ["view"], scope: "own" },
  },
  appointments: {
    director: { actions: ["view"], scope: "all" },
    manager: { actions: CVUTCl, scope: "all" },
    reception_admin: { actions: CVUTCl, scope: "assigned_centres" },
    clinician: { actions: ["view"], scope: "own" },
  },
  work_items: {
    director: { actions: CVUTCl, scope: "all" },
    manager: { actions: CVUTCl, scope: "all" },
    reception_admin: { actions: CVUTCl, scope: "assigned_centres" },
    clinician: { actions: CVUTCl, scope: "own" },
  },
  waste: {
    director: { actions: ["view"], scope: "all" },
    manager: { actions: CVUTCl, scope: "all" },
    reception_admin: { actions: CVU, scope: "assigned_centres" },
    clinician: { actions: CVU, scope: "own" },
  },
  handovers: {
    director: { actions: ["view"], scope: "all" },
    manager: { actions: CVUTCl, scope: "all" },
    reception_admin: { actions: ["create", "view", "update", "transfer"], scope: "assigned_centres" },
    clinician: { actions: ["create", "view", "update", "transfer"], scope: "own" },
  },
  capacity: {
    director: { actions: ["view"], scope: "all" },
    manager: { actions: CVU, scope: "all" },
    reception_admin: { actions: ["view"], scope: "assigned_centres" },
    clinician: { actions: ["view"], scope: "own" },
  },
  recurring_costs: {
    director: { actions: ["view", "verify"], scope: "all" },
    manager: { actions: ["create", "view", "update", "close", "verify"], scope: "all" },
    reception_admin: { actions: ["view"], scope: "assigned_centres" },
  },
  patterns: {
    director: { actions: CVU, scope: "all" },
    manager: { actions: ["create", "view", "update", "close"], scope: "all" },
    reception_admin: { actions: ["view"], scope: "assigned_centres" },
    clinician: { actions: ["view"], scope: "own" },
  },
  savings: {
    director: { actions: ["create", "view", "update", "verify"], scope: "all" },
    manager: { actions: ["create", "view", "update", "verify"], scope: "all" },
    reception_admin: { actions: ["create", "view"], scope: "own" },
    clinician: { actions: ["create", "view"], scope: "own" },
  },
  dashboards: {
    director: { actions: ["view"], scope: "all" },
    manager: { actions: ["view"], scope: "assigned_centres" },
  },
  audit: {
    director: { actions: ["view"], scope: "all" },
    manager: { actions: ["view"], scope: "assigned_centres" },
    technical_admin: { actions: ["view"], scope: "all" },
  },
  configuration: {
    director: { actions: ["view"], scope: "all" },
    manager: { actions: ["view"], scope: "all" },
    technical_admin: { actions: CVU, scope: "all" },
  },
  alerts: {
    director: { actions: ["view"], scope: "all" },
    manager: { actions: CVU, scope: "all" },
    technical_admin: { actions: CVU, scope: "all" },
  },
};

/** Roles required to complete MFA before a session is fully authenticated.
 *  See docs/security/SECURITY_PRIVACY_GOVERNANCE.md "MFA for privileged
 *  accounts" — director/manager/technical_admin hold verification, config
 *  or audit-visibility rights that reception/clinician roles do not. */
export const PRIVILEGED_ROLES: readonly Role[] = ["director", "manager", "technical_admin"];

export function isPrivilegedRole(role: Role): boolean {
  return PRIVILEGED_ROLES.includes(role);
}

export function can(role: Role, domain: Domain, action: Action): boolean {
  return MATRIX[domain][role]?.actions.includes(action) ?? false;
}

export function scopeFor(role: Role, domain: Domain): Scope | undefined {
  return MATRIX[domain][role]?.scope;
}

/**
 * Self-verification rule (docs/product/SAVINGS_MEASUREMENT_CONTRACT.md
 * "Who may verify significant savings"): a manager may not verify a
 * savings case they personally implemented. Directors are exempt because
 * they are the final accountable authority in the organisation.
 */
export function canVerifySavingsCase(
  role: Role,
  actorUserId: string,
  implementedByUserId: string,
): boolean {
  if (!can(role, "savings", "verify")) return false;
  if (role === "director") return true;
  return actorUserId !== implementedByUserId;
}

/**
 * Centre-scope check for a request against a resource in a given domain.
 * `all` scope roles (or missing centreId, e.g. an org-level resource)
 * always pass. `own` scope is not a centre check — callers must also
 * verify record ownership separately.
 */
export function hasCentreAccess(
  role: Role,
  domain: Domain,
  userCentreIds: readonly string[],
  resourceCentreId: string | null,
): boolean {
  const scope = scopeFor(role, domain);
  if (!scope) return false;
  if (scope === "all") return true;
  if (resourceCentreId === null) return true;
  if (scope === "assigned_centres") return userCentreIds.includes(resourceCentreId);
  // "own" scope: centre access is irrelevant, ownership is checked elsewhere.
  return true;
}
