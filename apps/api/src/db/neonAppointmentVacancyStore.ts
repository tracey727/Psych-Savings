import type { NeonQueryFunction, NeonQueryFunctionInTransaction, NeonQueryInTransaction } from "@neondatabase/serverless";
import type {
  AppointmentVacancyStore,
  CreateVacancyInput,
  LeakagePatternEntry,
  VacancyPatch,
  VacancySummary,
} from "../appointments/store";
import type { AppointmentVacancy, RefillOutcome } from "../appointments/types";

type Sql = NeonQueryFunction<false, false>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/** Same pattern as every other Neon-backed store in this repo — see docs/architecture/ENVIRONMENTS.md "Testing the database adapter". */
export class NeonAppointmentVacancyStore implements AppointmentVacancyStore {
  constructor(private readonly sql: Sql) {}

  async createVacancy(input: CreateVacancyInput): Promise<AppointmentVacancy> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${input.organisationId}, true)`,
      tx`insert into appointment_vacancies (organisation_id, work_item_id, cancellation_reason, original_value_cents, slot_time)
         values (${input.organisationId}, ${input.workItemId}, ${input.cancellationReason}, ${input.originalValueCents}, ${input.slotTime?.toISOString() ?? null})
         returning id, organisation_id, work_item_id, cancellation_reason, original_value_cents, slot_time, refill_outcome, recovered_value_cents, created_at, updated_at`,
    ]);
    return toVacancy((rows as Row[])[0]!);
  }

  async getVacancy(id: string, organisationId: string): Promise<AppointmentVacancy | null> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select id, organisation_id, work_item_id, cancellation_reason, original_value_cents, slot_time, refill_outcome, recovered_value_cents, created_at, updated_at
         from appointment_vacancies where id = ${id} and organisation_id = ${organisationId}`,
    ]);
    const r = (rows as Row[])[0];
    return r ? toVacancy(r) : null;
  }

  async updateVacancy(id: string, organisationId: string, patch: VacancyPatch): Promise<AppointmentVacancy> {
    if (patch.refillOutcome !== undefined) {
      await this.setConfigThenRun(
        organisationId,
        (tx) => tx`update appointment_vacancies set refill_outcome = ${patch.refillOutcome} where id = ${id} and organisation_id = ${organisationId}`,
      );
    }
    if (patch.recoveredValueCents !== undefined) {
      await this.setConfigThenRun(
        organisationId,
        (tx) => tx`update appointment_vacancies set recovered_value_cents = ${patch.recoveredValueCents} where id = ${id} and organisation_id = ${organisationId}`,
      );
    }
    await this.setConfigThenRun(
      organisationId,
      (tx) => tx`update appointment_vacancies set updated_at = now() where id = ${id} and organisation_id = ${organisationId}`,
    );

    const updated = await this.getVacancy(id, organisationId);
    if (!updated) throw new Error("vacancy not found after update");
    return updated;
  }

  private async setConfigThenRun(
    organisationId: string,
    query: (tx: NeonQueryFunctionInTransaction<false, false>) => NeonQueryInTransaction,
  ) {
    await this.sql.transaction((tx) => [tx`select set_config('app.current_org_id', ${organisationId}, true)`, query(tx)]);
  }

  async getLeakagePatternCounts(organisationId: string): Promise<LeakagePatternEntry[]> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select cancellation_reason as reason, count(*)::int as count
         from appointment_vacancies where organisation_id = ${organisationId}
         group by cancellation_reason`,
    ]);
    return rows as LeakagePatternEntry[];
  }

  async getVacancySummary(organisationId: string): Promise<VacancySummary> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select
           count(*)::int as total_vacancies,
           count(*) filter (where refill_outcome = 'refilled')::int as refilled,
           count(*) filter (where refill_outcome = 'not_refilled')::int as not_refilled,
           count(*) filter (where refill_outcome is null)::int as pending,
           coalesce(sum(recovered_value_cents) filter (where refill_outcome = 'refilled'), 0)::int as total_recovered_value_cents
         from appointment_vacancies where organisation_id = ${organisationId}`,
    ]);
    const r = (rows as Row[])[0]!;
    return {
      totalVacancies: r.total_vacancies,
      refilled: r.refilled,
      notRefilled: r.not_refilled,
      pending: r.pending,
      totalRecoveredValueCents: r.total_recovered_value_cents,
    };
  }
}

function toVacancy(r: Row): AppointmentVacancy {
  return {
    id: r.id,
    organisationId: r.organisation_id,
    workItemId: r.work_item_id,
    cancellationReason: r.cancellation_reason,
    originalValueCents: r.original_value_cents,
    slotTime: r.slot_time ? new Date(r.slot_time) : null,
    refillOutcome: r.refill_outcome as RefillOutcome | null,
    recoveredValueCents: r.recovered_value_cents,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}
