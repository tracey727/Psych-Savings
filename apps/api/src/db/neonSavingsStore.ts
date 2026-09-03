import type { NeonQueryFunction, NeonQueryFunctionInTransaction, NeonQueryInTransaction } from "@neondatabase/serverless";
import type {
  AddEvidenceInput,
  CreateBaselineInput,
  CreateSavingsCaseInput,
  RecordStateChangeInput,
  SavingsBaseline,
  SavingsCase,
  SavingsCaseFilters,
  SavingsCasePatch,
  SavingsCaseStateChange,
  SavingsEvidence,
  SavingsStore,
} from "@psych-savings/savings-engine";
import type {
  EvidenceType,
  Recurrence,
  SavingsCategory,
  SavingsState,
} from "@psych-savings/shared-types";

type Sql = NeonQueryFunction<false, false>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/** Same pattern as every other Neon-backed store in this repo — see docs/architecture/ENVIRONMENTS.md "Testing the database adapter". */
export class NeonSavingsStore implements SavingsStore {
  constructor(private readonly sql: Sql) {}

  async createBaseline(input: CreateBaselineInput): Promise<SavingsBaseline> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${input.organisationId}, true)`,
      tx`insert into savings_baselines (organisation_id, category, method, baseline_minutes, baseline_amount_cents,
                                        recurrence, measured_from, measured_to, source_reference, created_by_user_id)
         values (${input.organisationId}, ${input.category}, ${input.method}, ${input.baselineMinutes},
                 ${input.baselineAmountCents}, ${input.recurrence}, ${input.measuredFrom.toISOString()},
                 ${input.measuredTo.toISOString()}, ${input.sourceReference}, ${input.createdByUserId})
         returning id, organisation_id, category, method, baseline_minutes, baseline_amount_cents, recurrence,
                   measured_from, measured_to, source_reference, created_at, created_by_user_id`,
    ]);
    return toBaseline((rows as Row[])[0]!);
  }

  async getBaseline(id: string, organisationId: string): Promise<SavingsBaseline | null> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select id, organisation_id, category, method, baseline_minutes, baseline_amount_cents, recurrence,
                measured_from, measured_to, source_reference, created_at, created_by_user_id
         from savings_baselines where id = ${id} and organisation_id = ${organisationId}`,
    ]);
    const r = (rows as Row[])[0];
    return r ? toBaseline(r) : null;
  }

  async createCase(input: CreateSavingsCaseInput): Promise<SavingsCase> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${input.organisationId}, true)`,
      tx`insert into savings_cases (organisation_id, title, category, baseline_id, intervention_id,
                                    source_entity_type, source_entity_id, created_by_user_id)
         values (${input.organisationId}, ${input.title}, ${input.category}, ${input.baselineId},
                 ${input.interventionId}, ${input.sourceEntityType}, ${input.sourceEntityId}, ${input.createdByUserId})
         returning id, organisation_id, title, category, state, baseline_id, intervention_id, source_entity_type,
                source_entity_id, post_minutes, post_amount_cents, post_measured_at, measured_minutes_released,
                measured_amount_cents, annualised_minutes_released, annualised_amount_cents,
                labour_rate_cents_per_hour, approved_by_user_id, approved_at, implemented_by_user_id,
                implemented_at, measured_at, verified_by_user_id, verified_at, close_reason, closed_at,
                created_at, created_by_user_id, updated_at`,
    ]);
    return toCase((rows as Row[])[0]!);
  }

  async getCase(id: string, organisationId: string): Promise<SavingsCase | null> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select id, organisation_id, title, category, state, baseline_id, intervention_id, source_entity_type,
                source_entity_id, post_minutes, post_amount_cents, post_measured_at, measured_minutes_released,
                measured_amount_cents, annualised_minutes_released, annualised_amount_cents,
                labour_rate_cents_per_hour, approved_by_user_id, approved_at, implemented_by_user_id,
                implemented_at, measured_at, verified_by_user_id, verified_at, close_reason, closed_at,
                created_at, created_by_user_id, updated_at from savings_cases where id = ${id} and organisation_id = ${organisationId}`,
    ]);
    const r = (rows as Row[])[0];
    return r ? toCase(r) : null;
  }

  /**
   * Targeted UPDATEs rather than one dynamic SQL string, same approach as
   * NeonWorkItemStore.updateWorkItem. The measured figures move as one
   * group because they are one calculation result — writing part of a
   * calculation would leave a case claiming a figure its own annualised
   * counterpart disagrees with.
   */
  async updateCase(id: string, organisationId: string, patch: SavingsCasePatch): Promise<SavingsCase> {
    if (patch.state !== undefined) {
      await this.runUpdate(
        organisationId,
        (tx) => tx`update savings_cases set state = ${patch.state}, updated_at = now()
                   where id = ${id} and organisation_id = ${organisationId}`,
      );
    }
    if (patch.approvedAt !== undefined) {
      await this.runUpdate(
        organisationId,
        (tx) => tx`update savings_cases set approved_at = ${patch.approvedAt?.toISOString() ?? null},
                     approved_by_user_id = ${patch.approvedByUserId ?? null}, updated_at = now()
                   where id = ${id} and organisation_id = ${organisationId}`,
      );
    }
    if (patch.implementedAt !== undefined) {
      await this.runUpdate(
        organisationId,
        (tx) => tx`update savings_cases set implemented_at = ${patch.implementedAt?.toISOString() ?? null},
                     implemented_by_user_id = ${patch.implementedByUserId ?? null}, updated_at = now()
                   where id = ${id} and organisation_id = ${organisationId}`,
      );
    }
    if (patch.measuredAt !== undefined) {
      await this.runUpdate(
        organisationId,
        (tx) => tx`update savings_cases set
                     post_minutes = ${patch.postMinutes ?? null},
                     post_amount_cents = ${patch.postAmountCents ?? null},
                     post_measured_at = ${patch.postMeasuredAt?.toISOString() ?? null},
                     measured_at = ${patch.measuredAt?.toISOString() ?? null},
                     measured_minutes_released = ${patch.measuredMinutesReleased ?? null},
                     measured_amount_cents = ${patch.measuredAmountCents ?? null},
                     annualised_minutes_released = ${patch.annualisedMinutesReleased ?? null},
                     annualised_amount_cents = ${patch.annualisedAmountCents ?? null},
                     labour_rate_cents_per_hour = ${patch.labourRateCentsPerHour ?? null},
                     updated_at = now()
                   where id = ${id} and organisation_id = ${organisationId}`,
      );
    }
    if (patch.verifiedAt !== undefined) {
      await this.runUpdate(
        organisationId,
        (tx) => tx`update savings_cases set verified_at = ${patch.verifiedAt?.toISOString() ?? null},
                     verified_by_user_id = ${patch.verifiedByUserId ?? null}, updated_at = now()
                   where id = ${id} and organisation_id = ${organisationId}`,
      );
    }
    if (patch.closedAt !== undefined) {
      await this.runUpdate(
        organisationId,
        (tx) => tx`update savings_cases set closed_at = ${patch.closedAt?.toISOString() ?? null},
                     close_reason = ${patch.closeReason ?? null}, updated_at = now()
                   where id = ${id} and organisation_id = ${organisationId}`,
      );
    }

    const updated = await this.getCase(id, organisationId);
    if (!updated) throw new Error("savings case not found after update");
    return updated;
  }

  async listCases(organisationId: string, filters: SavingsCaseFilters): Promise<SavingsCase[]> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select id, organisation_id, title, category, state, baseline_id, intervention_id, source_entity_type,
                source_entity_id, post_minutes, post_amount_cents, post_measured_at, measured_minutes_released,
                measured_amount_cents, annualised_minutes_released, annualised_amount_cents,
                labour_rate_cents_per_hour, approved_by_user_id, approved_at, implemented_by_user_id,
                implemented_at, measured_at, verified_by_user_id, verified_at, close_reason, closed_at,
                created_at, created_by_user_id, updated_at from savings_cases
         where organisation_id = ${organisationId}
           and (${filters.includeClosed ?? false}::boolean is true or closed_at is null)
           and (${filters.state ?? null}::text is null or state = ${filters.state ?? null})
           and (${filters.category ?? null}::text is null or category = ${filters.category ?? null})
           and (${filters.interventionId ?? null}::uuid is null or intervention_id = ${filters.interventionId ?? null})
           and (${filters.sourceEntityType ?? null}::text is null or source_entity_type = ${filters.sourceEntityType ?? null})
           and (${filters.sourceEntityId ?? null}::uuid is null or source_entity_id = ${filters.sourceEntityId ?? null})
         order by created_at desc`,
    ]);
    return (rows as Row[]).map(toCase);
  }

  async recordStateChange(input: RecordStateChangeInput): Promise<void> {
    await this.runUpdate(
      input.organisationId,
      (tx) => tx`insert into savings_case_state_history (organisation_id, savings_case_id, changed_by_user_id,
                                                          from_state, to_state, reason)
                 values (${input.organisationId}, ${input.savingsCaseId}, ${input.changedByUserId},
                         ${input.fromState}, ${input.toState}, ${input.reason})`,
    );
  }

  async listStateHistory(savingsCaseId: string, organisationId: string): Promise<SavingsCaseStateChange[]> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select id, organisation_id, savings_case_id, changed_at, changed_by_user_id, from_state, to_state, reason
         from savings_case_state_history
         where savings_case_id = ${savingsCaseId} and organisation_id = ${organisationId}
         order by changed_at`,
    ]);
    return (rows as Row[]).map((r) => ({
      id: r.id,
      organisationId: r.organisation_id,
      savingsCaseId: r.savings_case_id,
      changedAt: new Date(r.changed_at),
      changedByUserId: r.changed_by_user_id,
      fromState: (r.from_state as SavingsState | null) ?? null,
      toState: r.to_state as SavingsState,
      reason: r.reason,
    }));
  }

  async addEvidence(input: AddEvidenceInput): Promise<SavingsEvidence> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${input.organisationId}, true)`,
      tx`insert into savings_evidence (organisation_id, savings_case_id, evidence_type, reference, note, created_by_user_id)
         values (${input.organisationId}, ${input.savingsCaseId}, ${input.evidenceType}, ${input.reference},
                 ${input.note}, ${input.createdByUserId})
         returning id, organisation_id, savings_case_id, evidence_type, reference, note, created_at, created_by_user_id`,
    ]);
    return toEvidence((rows as Row[])[0]!);
  }

  async listEvidence(savingsCaseId: string, organisationId: string): Promise<SavingsEvidence[]> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select id, organisation_id, savings_case_id, evidence_type, reference, note, created_at, created_by_user_id
         from savings_evidence
         where savings_case_id = ${savingsCaseId} and organisation_id = ${organisationId}
         order by created_at`,
    ]);
    return (rows as Row[]).map(toEvidence);
  }

  private async runUpdate(
    organisationId: string,
    query: (tx: NeonQueryFunctionInTransaction<false, false>) => NeonQueryInTransaction,
  ) {
    await this.sql.transaction((tx) => [tx`select set_config('app.current_org_id', ${organisationId}, true)`, query(tx)]);
  }
}

function toBaseline(r: Row): SavingsBaseline {
  return {
    id: r.id,
    organisationId: r.organisation_id,
    category: r.category as SavingsCategory,
    method: r.method,
    baselineMinutes: r.baseline_minutes,
    baselineAmountCents: r.baseline_amount_cents,
    recurrence: r.recurrence as Recurrence,
    measuredFrom: new Date(r.measured_from),
    measuredTo: new Date(r.measured_to),
    sourceReference: r.source_reference,
    createdAt: new Date(r.created_at),
    createdByUserId: r.created_by_user_id,
  };
}

function toCase(r: Row): SavingsCase {
  return {
    id: r.id,
    organisationId: r.organisation_id,
    title: r.title,
    category: r.category as SavingsCategory,
    state: r.state as SavingsState,
    baselineId: r.baseline_id,
    interventionId: r.intervention_id,
    sourceEntityType: r.source_entity_type,
    sourceEntityId: r.source_entity_id,
    postMinutes: r.post_minutes,
    postAmountCents: r.post_amount_cents,
    postMeasuredAt: r.post_measured_at ? new Date(r.post_measured_at) : null,
    measuredMinutesReleased: r.measured_minutes_released,
    measuredAmountCents: r.measured_amount_cents,
    annualisedMinutesReleased: r.annualised_minutes_released,
    annualisedAmountCents: r.annualised_amount_cents,
    labourRateCentsPerHour: r.labour_rate_cents_per_hour,
    approvedByUserId: r.approved_by_user_id,
    approvedAt: r.approved_at ? new Date(r.approved_at) : null,
    implementedByUserId: r.implemented_by_user_id,
    implementedAt: r.implemented_at ? new Date(r.implemented_at) : null,
    measuredAt: r.measured_at ? new Date(r.measured_at) : null,
    verifiedByUserId: r.verified_by_user_id,
    verifiedAt: r.verified_at ? new Date(r.verified_at) : null,
    closeReason: r.close_reason,
    closedAt: r.closed_at ? new Date(r.closed_at) : null,
    createdAt: new Date(r.created_at),
    createdByUserId: r.created_by_user_id,
    updatedAt: new Date(r.updated_at),
  };
}

function toEvidence(r: Row): SavingsEvidence {
  return {
    id: r.id,
    organisationId: r.organisation_id,
    savingsCaseId: r.savings_case_id,
    evidenceType: r.evidence_type as EvidenceType,
    reference: r.reference,
    note: r.note,
    createdAt: new Date(r.created_at),
    createdByUserId: r.created_by_user_id,
  };
}
