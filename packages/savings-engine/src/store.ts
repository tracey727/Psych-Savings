import type {
  EvidenceType,
  Recurrence,
  SavingsCategory,
  SavingsState,
} from "@psych-savings/shared-types";
import type { SavingsBaseline, SavingsCase, SavingsCaseStateChange, SavingsEvidence } from "./types";

export interface CreateBaselineInput {
  organisationId: string;
  category: SavingsCategory;
  method: string;
  baselineMinutes: number | null;
  baselineAmountCents: number | null;
  recurrence: Recurrence;
  measuredFrom: Date;
  measuredTo: Date;
  sourceReference: string | null;
  createdByUserId: string;
}

export interface CreateSavingsCaseInput {
  organisationId: string;
  title: string;
  category: SavingsCategory;
  baselineId: string;
  interventionId: string | null;
  sourceEntityType: string;
  sourceEntityId: string;
  createdByUserId: string;
}

/**
 * Only the fields a lifecycle transition may write. The measured figures
 * are here because the engine computes them; nothing outside
 * calculate.ts ever supplies them.
 */
export interface SavingsCasePatch {
  state?: SavingsState;
  postMinutes?: number | null;
  postAmountCents?: number | null;
  postMeasuredAt?: Date | null;
  measuredMinutesReleased?: number | null;
  measuredAmountCents?: number | null;
  annualisedMinutesReleased?: number | null;
  annualisedAmountCents?: number | null;
  labourRateCentsPerHour?: number | null;
  approvedByUserId?: string | null;
  approvedAt?: Date | null;
  implementedByUserId?: string | null;
  implementedAt?: Date | null;
  measuredAt?: Date | null;
  verifiedByUserId?: string | null;
  verifiedAt?: Date | null;
  closeReason?: string | null;
  closedAt?: Date | null;
}

export interface RecordStateChangeInput {
  organisationId: string;
  savingsCaseId: string;
  changedByUserId: string | null;
  fromState: SavingsState | null;
  toState: SavingsState;
  reason: string | null;
}

export interface AddEvidenceInput {
  organisationId: string;
  savingsCaseId: string;
  evidenceType: EvidenceType;
  reference: string | null;
  note: string | null;
  createdByUserId: string | null;
}

export interface SavingsCaseFilters {
  state?: SavingsState;
  category?: SavingsCategory;
  interventionId?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  /** Omit or set false to hide cases closed with a reason. */
  includeClosed?: boolean;
}

/** Same interface + in-memory-fake + Neon-adapter pattern as every other store in this repo. */
export interface SavingsStore {
  createBaseline(input: CreateBaselineInput): Promise<SavingsBaseline>;
  getBaseline(id: string, organisationId: string): Promise<SavingsBaseline | null>;

  createCase(input: CreateSavingsCaseInput): Promise<SavingsCase>;
  getCase(id: string, organisationId: string): Promise<SavingsCase | null>;
  updateCase(id: string, organisationId: string, patch: SavingsCasePatch): Promise<SavingsCase>;
  listCases(organisationId: string, filters: SavingsCaseFilters): Promise<SavingsCase[]>;

  recordStateChange(input: RecordStateChangeInput): Promise<void>;
  listStateHistory(savingsCaseId: string, organisationId: string): Promise<SavingsCaseStateChange[]>;

  addEvidence(input: AddEvidenceInput): Promise<SavingsEvidence>;
  listEvidence(savingsCaseId: string, organisationId: string): Promise<SavingsEvidence[]>;
}
