import type { ContactAttempt, ContactStatus, Referral, ReferralOutcome } from "./types";

export interface CreateReferralInput {
  organisationId: string;
  workItemId: string;
  source: string;
  valueEstimateCents: number | null;
}

export interface ReferralPatch {
  contactStatus?: ContactStatus;
  outcome?: ReferralOutcome;
  lostReason?: string | null;
}

export interface RecordContactAttemptInput {
  organisationId: string;
  referralId: string;
  method: string;
  outcome: string;
  notes: string | null;
  createdByUserId: string | null;
}

export interface OutcomeCounts {
  waiting: number;
  booked: number;
  declined: number;
  not_suitable: number;
  undecided: number;
}

/** Same interface + in-memory-fake + Neon-adapter pattern as auth/store.ts and workflow-engine/store.ts. */
export interface ReferralStore {
  createReferral(input: CreateReferralInput): Promise<Referral>;
  getReferral(id: string, organisationId: string): Promise<Referral | null>;
  getReferralByWorkItem(workItemId: string, organisationId: string): Promise<Referral | null>;
  updateReferral(id: string, organisationId: string, patch: ReferralPatch): Promise<Referral>;

  recordContactAttempt(input: RecordContactAttemptInput): Promise<ContactAttempt>;
  listContactAttempts(referralId: string, organisationId: string): Promise<ContactAttempt[]>;

  getOutcomeCounts(organisationId: string): Promise<OutcomeCounts>;
}
