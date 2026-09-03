import type { Recurrence, RootCauseCategory, WasteCategory } from "@psych-savings/shared-types";

/**
 * A waste event is a cheap, ownerless observation — deliberately NOT a
 * work item, unlike a referral (Phase 8) or a vacancy (Phase 10).
 * MODULE_REGISTER.md M05 asks for "quick waste-event capture", and
 * requiring an owner, a due date and a health state on a ten-second
 * observation is what stops staff logging one at all. Ownership arrives
 * later, with the intervention.
 */
export interface WasteEvent {
  id: string;
  organisationId: string;
  centreId: string | null;
  reportedByUserId: string;
  category: WasteCategory;
  /** Whose time was consumed — the basis for labour valuation and for M05's wrong-role reporting. */
  staffRole: string;
  description: string;
  estimatedMinutes: number;
  recurrence: Recurrence;
  occurredAt: Date;
  rootCauseCategory: RootCauseCategory | null;
  rootCauseNote: string | null;
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  interventionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * An intervention IS a work item (domain = 'waste_intervention'): once
 * the practice decides to act, it is owned work with a deadline that
 * needs transfer, escalation and close-with-reason — all of which the
 * Phase 7 engine already does.
 */
export interface ProcessIntervention {
  id: string;
  organisationId: string;
  workItemId: string;
  title: string;
  description: string | null;
  rootCauseCategory: RootCauseCategory;
  implementedAt: Date | null;
  implementedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
