export type RefillOutcome = "refilled" | "not_refilled";

/**
 * Documented but not DB-enforced — same data-minimisation stance as
 * Phase 9's contact outcomes (docs/architecture/DATA_MODEL_BLUEPRINT.md
 * "Free-text fields are minimised", balanced against not over-
 * constraining a reason category that will vary by practice).
 */
export const STANDARD_CANCELLATION_REASONS = [
  "client_illness",
  "client_scheduling_conflict",
  "clinician_unavailable",
  "no_show",
  "weather_or_travel",
  "other",
] as const;
export type StandardCancellationReason = (typeof STANDARD_CANCELLATION_REASONS)[number];

export interface AppointmentVacancy {
  id: string;
  organisationId: string;
  workItemId: string;
  cancellationReason: string;
  originalValueCents: number | null;
  slotTime: Date | null;
  refillOutcome: RefillOutcome | null;
  recoveredValueCents: number | null;
  createdAt: Date;
  updatedAt: Date;
}
