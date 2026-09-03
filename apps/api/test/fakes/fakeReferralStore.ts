import type {
  CreateReferralInput,
  OutcomeCounts,
  RecordContactAttemptInput,
  ReferralPatch,
  ReferralStore,
} from "../../src/referrals/store";
import type { ContactAttempt, Referral } from "../../src/referrals/types";

export class FakeReferralStore implements ReferralStore {
  referrals = new Map<string, Referral>();
  attempts: ContactAttempt[] = [];
  private counter = 0;
  private nextId() {
    return `ref-${++this.counter}`;
  }

  async createReferral(input: CreateReferralInput): Promise<Referral> {
    const now = new Date();
    const referral: Referral = {
      id: this.nextId(),
      organisationId: input.organisationId,
      workItemId: input.workItemId,
      source: input.source,
      receivedAt: now,
      contactStatus: "not_yet_contacted",
      outcome: null,
      lostReason: null,
      valueEstimateCents: input.valueEstimateCents,
      createdAt: now,
      updatedAt: now,
    };
    this.referrals.set(referral.id, referral);
    return referral;
  }

  async getReferral(id: string, organisationId: string): Promise<Referral | null> {
    const r = this.referrals.get(id);
    return r && r.organisationId === organisationId ? r : null;
  }

  async getReferralByWorkItem(workItemId: string, organisationId: string): Promise<Referral | null> {
    return (
      [...this.referrals.values()].find((r) => r.workItemId === workItemId && r.organisationId === organisationId) ??
      null
    );
  }

  async updateReferral(id: string, organisationId: string, patch: ReferralPatch): Promise<Referral> {
    const r = await this.getReferral(id, organisationId);
    if (!r) throw new Error("not found");
    Object.assign(r, patch, { updatedAt: new Date() });
    return r;
  }

  async recordContactAttempt(input: RecordContactAttemptInput): Promise<ContactAttempt> {
    const attempt: ContactAttempt = {
      id: `attempt-${this.attempts.length + 1}`,
      organisationId: input.organisationId,
      referralId: input.referralId,
      attemptedAt: new Date(),
      method: input.method,
      outcome: input.outcome,
      notes: input.notes,
      createdByUserId: input.createdByUserId,
    };
    this.attempts.push(attempt);
    return attempt;
  }

  async listContactAttempts(referralId: string, organisationId: string): Promise<ContactAttempt[]> {
    return this.attempts.filter((a) => a.referralId === referralId && a.organisationId === organisationId);
  }

  async getOutcomeCounts(organisationId: string): Promise<OutcomeCounts> {
    const counts: OutcomeCounts = { waiting: 0, booked: 0, declined: 0, not_suitable: 0, undecided: 0 };
    for (const r of this.referrals.values()) {
      if (r.organisationId !== organisationId) continue;
      if (r.outcome === null) counts.undecided++;
      else counts[r.outcome]++;
    }
    return counts;
  }
}
