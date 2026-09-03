import type { NeonQueryFunction, NeonQueryFunctionInTransaction, NeonQueryInTransaction } from "@neondatabase/serverless";
import type {
  CreateReferralInput,
  OutcomeCounts,
  RecordContactAttemptInput,
  ReferralPatch,
  ReferralStore,
} from "../referrals/store";
import type { ContactAttempt, ContactStatus, Referral, ReferralOutcome } from "../referrals/types";

type Sql = NeonQueryFunction<false, false>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/** Same pattern as db/neonAuthStore.ts and db/neonWorkItemStore.ts — see docs/architecture/ENVIRONMENTS.md "Testing the database adapter". */
export class NeonReferralStore implements ReferralStore {
  constructor(private readonly sql: Sql) {}

  async createReferral(input: CreateReferralInput): Promise<Referral> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${input.organisationId}, true)`,
      tx`insert into referrals (organisation_id, work_item_id, source, value_estimate_cents)
         values (${input.organisationId}, ${input.workItemId}, ${input.source}, ${input.valueEstimateCents})
         returning id, organisation_id, work_item_id, source, received_at, contact_status, outcome, lost_reason, value_estimate_cents, created_at, updated_at`,
    ]);
    return toReferral((rows as Row[])[0]!);
  }

  async getReferral(id: string, organisationId: string): Promise<Referral | null> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select id, organisation_id, work_item_id, source, received_at, contact_status, outcome, lost_reason, value_estimate_cents, created_at, updated_at
         from referrals where id = ${id} and organisation_id = ${organisationId}`,
    ]);
    const r = (rows as Row[])[0];
    return r ? toReferral(r) : null;
  }

  async getReferralByWorkItem(workItemId: string, organisationId: string): Promise<Referral | null> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select id, organisation_id, work_item_id, source, received_at, contact_status, outcome, lost_reason, value_estimate_cents, created_at, updated_at
         from referrals where work_item_id = ${workItemId} and organisation_id = ${organisationId}`,
    ]);
    const r = (rows as Row[])[0];
    return r ? toReferral(r) : null;
  }

  async updateReferral(id: string, organisationId: string, patch: ReferralPatch): Promise<Referral> {
    if (patch.contactStatus !== undefined) {
      await this.setConfigThenRun(
        organisationId,
        (tx) => tx`update referrals set contact_status = ${patch.contactStatus} where id = ${id} and organisation_id = ${organisationId}`,
      );
    }
    if (patch.outcome !== undefined) {
      await this.setConfigThenRun(
        organisationId,
        (tx) => tx`update referrals set outcome = ${patch.outcome} where id = ${id} and organisation_id = ${organisationId}`,
      );
    }
    if (patch.lostReason !== undefined) {
      await this.setConfigThenRun(
        organisationId,
        (tx) => tx`update referrals set lost_reason = ${patch.lostReason} where id = ${id} and organisation_id = ${organisationId}`,
      );
    }
    await this.setConfigThenRun(
      organisationId,
      (tx) => tx`update referrals set updated_at = now() where id = ${id} and organisation_id = ${organisationId}`,
    );

    const updated = await this.getReferral(id, organisationId);
    if (!updated) throw new Error("referral not found after update");
    return updated;
  }

  private async setConfigThenRun(
    organisationId: string,
    query: (tx: NeonQueryFunctionInTransaction<false, false>) => NeonQueryInTransaction,
  ) {
    await this.sql.transaction((tx) => [tx`select set_config('app.current_org_id', ${organisationId}, true)`, query(tx)]);
  }

  async recordContactAttempt(input: RecordContactAttemptInput): Promise<ContactAttempt> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${input.organisationId}, true)`,
      tx`insert into referral_contact_attempts (organisation_id, referral_id, method, outcome, notes, created_by_user_id)
         values (${input.organisationId}, ${input.referralId}, ${input.method}, ${input.outcome}, ${input.notes}, ${input.createdByUserId})
         returning id, organisation_id, referral_id, attempted_at, method, outcome, notes, created_by_user_id`,
    ]);
    return toContactAttempt((rows as Row[])[0]!);
  }

  async listContactAttempts(referralId: string, organisationId: string): Promise<ContactAttempt[]> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select id, organisation_id, referral_id, attempted_at, method, outcome, notes, created_by_user_id
         from referral_contact_attempts where referral_id = ${referralId} and organisation_id = ${organisationId}
         order by attempted_at asc`,
    ]);
    return (rows as Row[]).map(toContactAttempt);
  }

  async getOutcomeCounts(organisationId: string): Promise<OutcomeCounts> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select outcome, count(*)::int as n from referrals where organisation_id = ${organisationId} group by outcome`,
    ]);
    const counts: OutcomeCounts = { waiting: 0, booked: 0, declined: 0, not_suitable: 0, undecided: 0 };
    for (const r of rows as Row[]) {
      if (r.outcome === null) counts.undecided = r.n;
      else counts[r.outcome as ReferralOutcome] = r.n;
    }
    return counts;
  }
}

function toReferral(r: Row): Referral {
  return {
    id: r.id,
    organisationId: r.organisation_id,
    workItemId: r.work_item_id,
    source: r.source,
    receivedAt: new Date(r.received_at),
    contactStatus: r.contact_status as ContactStatus,
    outcome: r.outcome as ReferralOutcome | null,
    lostReason: r.lost_reason,
    valueEstimateCents: r.value_estimate_cents,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

function toContactAttempt(r: Row): ContactAttempt {
  return {
    id: r.id,
    organisationId: r.organisation_id,
    referralId: r.referral_id,
    attemptedAt: new Date(r.attempted_at),
    method: r.method,
    outcome: r.outcome,
    notes: r.notes,
    createdByUserId: r.created_by_user_id,
  };
}
