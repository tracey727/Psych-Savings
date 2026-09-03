export type ContactStatus = "not_yet_contacted" | "attempting" | "contacted";
export type ReferralOutcome = "waiting" | "booked" | "declined" | "not_suitable";

/** Outcomes MODULE_REGISTER.md M01 treats as "lost" — a lost referral always carries a reason. */
export const LOST_OUTCOMES: readonly ReferralOutcome[] = ["declined", "not_suitable"];

export interface Referral {
  id: string;
  organisationId: string;
  workItemId: string;
  source: string;
  receivedAt: Date;
  contactStatus: ContactStatus;
  outcome: ReferralOutcome | null;
  lostReason: string | null;
  valueEstimateCents: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactAttempt {
  id: string;
  organisationId: string;
  referralId: string;
  attemptedAt: Date;
  method: string;
  outcome: string;
  notes: string | null;
  createdByUserId: string | null;
}
