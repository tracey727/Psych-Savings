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

/**
 * Staff-time waste categories, per CHRONOLOGICAL_BUILD_PLAN.md Phase 12
 * item 2 and MODULE_REGISTER.md M05. Frozen: the savings engine has a
 * formula per category, so an operator must not be able to invent one.
 */
export const WASTE_CATEGORIES = [
  "duplicate_work",
  "rework",
  "searching",
  "waiting",
  "unnecessary_approval",
  "wrong_role_work",
  "avoidable_manual_entry",
] as const;
export type WasteCategory = (typeof WASTE_CATEGORIES)[number];

/** Root causes a waste event can be attributed to during review (Phase 12 item 4). */
export const ROOT_CAUSE_CATEGORIES = [
  "no_single_source_of_truth",
  "manual_process",
  "unclear_ownership",
  "system_limitation",
  "training_gap",
  "policy_or_approval_step",
  "external_dependency",
] as const;
export type RootCauseCategory = (typeof ROOT_CAUSE_CATEGORIES)[number];

/**
 * How often a waste event or baseline repeats. Used to annualise a
 * per-occurrence saving into a run-rate, which is always reported
 * separately from verified actuals (SAVINGS_MEASUREMENT_CONTRACT.md
 * "Dashboard totals").
 */
export const RECURRENCES = ["one_off", "daily", "weekly", "fortnightly", "monthly"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

/**
 * Occurrences per year for each recurrence. `daily` is 260 — working
 * days, not calendar days — because this measures staff and practice
 * activity, which does not happen at weekends. These are the only
 * annualisation constants in the system; nothing else may hard-code a
 * multiplier.
 */
export const OCCURRENCES_PER_YEAR: Record<Recurrence, number> = {
  one_off: 1,
  daily: 260,
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
};

/** The evidence hierarchy frozen in SAVINGS_MEASUREMENT_CONTRACT.md "Evidence hierarchy". */
export const EVIDENCE_TYPES = [
  "invoice",
  "subscription_bill",
  "appointment_outcome",
  "booking_record",
  "payment_record",
  "measured_process_time",
  "system_event",
  "staffing_cost_baseline",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
