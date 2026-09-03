import type {
  EvidenceType,
  Recurrence,
  SavingsCategory,
  SavingsState,
} from "@psych-savings/shared-types";

/**
 * The persisted before-state a savings case is measured against.
 * Anti-double-counting rule 2 in
 * docs/product/SAVINGS_MEASUREMENT_CONTRACT.md: a baseline is always a
 * record, never a figure typed into a total.
 */
export interface SavingsBaseline {
  id: string;
  organisationId: string;
  category: SavingsCategory;
  /** How the figure was arrived at — the "calculation method" the Phase 2 gate requires. */
  method: string;
  baselineMinutes: number | null;
  baselineAmountCents: number | null;
  recurrence: Recurrence;
  measuredFrom: Date;
  measuredTo: Date;
  sourceReference: string | null;
  createdAt: Date;
  createdByUserId: string;
}

export interface SavingsCase {
  id: string;
  organisationId: string;
  title: string;
  category: SavingsCategory;
  state: SavingsState;
  baselineId: string;
  interventionId: string | null;
  /** The underlying operational event this case claims value from (e.g. "waste_event"). */
  sourceEntityType: string;
  sourceEntityId: string;

  postMinutes: number | null;
  postAmountCents: number | null;
  postMeasuredAt: Date | null;

  measuredMinutesReleased: number | null;
  measuredAmountCents: number | null;
  /** Run-rate only. Never summed into a verified total. */
  annualisedMinutesReleased: number | null;
  annualisedAmountCents: number | null;
  labourRateCentsPerHour: number | null;

  approvedByUserId: string | null;
  approvedAt: Date | null;
  implementedByUserId: string | null;
  implementedAt: Date | null;
  measuredAt: Date | null;
  verifiedByUserId: string | null;
  verifiedAt: Date | null;
  closeReason: string | null;
  closedAt: Date | null;
  createdAt: Date;
  createdByUserId: string;
  updatedAt: Date;
}

export interface SavingsEvidence {
  id: string;
  organisationId: string;
  savingsCaseId: string;
  evidenceType: EvidenceType;
  reference: string | null;
  note: string | null;
  createdAt: Date;
  createdByUserId: string | null;
}

export interface SavingsCaseStateChange {
  id: string;
  organisationId: string;
  savingsCaseId: string;
  changedAt: Date;
  changedByUserId: string | null;
  fromState: SavingsState | null;
  toState: SavingsState;
  reason: string | null;
}
