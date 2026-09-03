/**
 * Canonical domain types shared by the API and both apps.
 * These mirror the frozen states in docs/product/PRODUCT_CONTRACT.md and
 * docs/product/SAVINGS_MEASUREMENT_CONTRACT.md — do not redefine these
 * status sets locally elsewhere (see docs/10_DEVELOPER_HANDOFF "Shared
 * status types are canonical").
 */

/** Operating health state of a work item, per PRODUCT_CONTRACT.md §6. */
export const HEALTH_STATES = ["green", "amber", "red", "recovery"] as const;
export type HealthState = (typeof HEALTH_STATES)[number];

/** Savings case lifecycle, per SAVINGS_MEASUREMENT_CONTRACT.md. */
export const SAVINGS_STATES = [
  "potential",
  "approved",
  "implemented",
  "measured",
  "verified",
] as const;
export type SavingsState = (typeof SAVINGS_STATES)[number];

/** Savings value categories, per SAVINGS_MEASUREMENT_CONTRACT.md. */
export const SAVINGS_CATEGORIES = [
  "recovered_revenue",
  "avoided_revenue_leakage",
  "avoided_operating_cost",
  "released_staff_time",
] as const;
export type SavingsCategory = (typeof SAVINGS_CATEGORIES)[number];

/** Roles, per docs/architecture/ROLE_MATRIX.md §2. */
export const ROLES = [
  "director",
  "manager",
  "reception_admin",
  "clinician",
  "technical_admin",
] as const;
export type Role = (typeof ROLES)[number];
