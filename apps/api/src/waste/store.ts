import type { Recurrence, RootCauseCategory, WasteCategory } from "@psych-savings/shared-types";
import type { ProcessIntervention, WasteEvent } from "./types";

export interface CreateWasteEventInput {
  organisationId: string;
  centreId: string | null;
  reportedByUserId: string;
  category: WasteCategory;
  staffRole: string;
  description: string;
  estimatedMinutes: number;
  recurrence: Recurrence;
  occurredAt: Date;
}

export interface WasteEventPatch {
  rootCauseCategory?: RootCauseCategory | null;
  rootCauseNote?: string | null;
  reviewedAt?: Date | null;
  reviewedByUserId?: string | null;
  interventionId?: string | null;
}

export interface WasteEventFilters {
  category?: WasteCategory;
  interventionId?: string;
  /** Only events nobody has established a root cause for yet — the review queue. */
  reviewedOnly?: boolean;
  unreviewedOnly?: boolean;
}

export interface CreateInterventionInput {
  organisationId: string;
  workItemId: string;
  title: string;
  description: string | null;
  rootCauseCategory: RootCauseCategory;
}

export interface InterventionPatch {
  implementedAt?: Date | null;
  implementedByUserId?: string | null;
}

/** Minutes of waste logged per category — MODULE_REGISTER.md M05 reporting, and the input to Phase 15's pattern ranking. */
export interface WasteCategoryTotal {
  category: WasteCategory;
  eventCount: number;
  totalEstimatedMinutes: number;
  /** Estimated minutes per year if every event recurred at its recorded frequency. Estimate, never a verified saving. */
  annualisedMinutes: number;
}

/** Same interface + in-memory-fake + Neon-adapter pattern as every other domain store in this repo. */
export interface WasteStore {
  createWasteEvent(input: CreateWasteEventInput): Promise<WasteEvent>;
  getWasteEvent(id: string, organisationId: string): Promise<WasteEvent | null>;
  updateWasteEvent(id: string, organisationId: string, patch: WasteEventPatch): Promise<WasteEvent>;
  listWasteEvents(organisationId: string, filters: WasteEventFilters): Promise<WasteEvent[]>;

  createIntervention(input: CreateInterventionInput): Promise<ProcessIntervention>;
  getIntervention(id: string, organisationId: string): Promise<ProcessIntervention | null>;
  updateIntervention(id: string, organisationId: string, patch: InterventionPatch): Promise<ProcessIntervention>;

  getWasteTotalsByCategory(organisationId: string): Promise<WasteCategoryTotal[]>;
}
