import type { NeonQueryFunction, NeonQueryFunctionInTransaction, NeonQueryInTransaction } from "@neondatabase/serverless";
import type { AbsenceStore, CreateAbsenceInput, CreateHandoverInput } from "../absences/store";
import type { Absence, AbsenceType, Handover } from "../absences/types";

type Sql = NeonQueryFunction<false, false>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/** Same pattern as every other Neon-backed store in this repo — see docs/architecture/ENVIRONMENTS.md "Testing the database adapter". */
export class NeonAbsenceStore implements AbsenceStore {
  constructor(private readonly sql: Sql) {}

  async createAbsence(input: CreateAbsenceInput): Promise<Absence> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${input.organisationId}, true)`,
      tx`insert into absences (organisation_id, user_id, absence_type, starts_at, ends_at)
         values (${input.organisationId}, ${input.userId}, ${input.absenceType}, ${input.startsAt.toISOString()}, ${input.endsAt?.toISOString() ?? null})
         returning id, organisation_id, user_id, absence_type, starts_at, ends_at, created_at, return_briefing_completed_at`,
    ]);
    return toAbsence((rows as Row[])[0]!);
  }

  async getAbsence(id: string, organisationId: string): Promise<Absence | null> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select id, organisation_id, user_id, absence_type, starts_at, ends_at, created_at, return_briefing_completed_at
         from absences where id = ${id} and organisation_id = ${organisationId}`,
    ]);
    const r = (rows as Row[])[0];
    return r ? toAbsence(r) : null;
  }

  async markReturnBriefingCompleted(id: string, organisationId: string, completedAt: Date): Promise<Absence> {
    await this.setConfigThenRun(
      organisationId,
      (tx) => tx`update absences set return_briefing_completed_at = ${completedAt.toISOString()} where id = ${id} and organisation_id = ${organisationId}`,
    );
    const updated = await this.getAbsence(id, organisationId);
    if (!updated) throw new Error("absence not found after update");
    return updated;
  }

  private async setConfigThenRun(
    organisationId: string,
    query: (tx: NeonQueryFunctionInTransaction<false, false>) => NeonQueryInTransaction,
  ) {
    await this.sql.transaction((tx) => [tx`select set_config('app.current_org_id', ${organisationId}, true)`, query(tx)]);
  }

  async createHandover(input: CreateHandoverInput): Promise<Handover> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${input.organisationId}, true)`,
      tx`insert into handovers (organisation_id, absence_id, work_item_id, transfer_id, temporary_owner_user_id)
         values (${input.organisationId}, ${input.absenceId}, ${input.workItemId}, ${input.transferId}, ${input.temporaryOwnerUserId})
         returning id, organisation_id, absence_id, work_item_id, transfer_id, temporary_owner_user_id, created_at`,
    ]);
    return toHandover((rows as Row[])[0]!);
  }

  async getHandover(id: string, organisationId: string): Promise<Handover | null> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select id, organisation_id, absence_id, work_item_id, transfer_id, temporary_owner_user_id, created_at
         from handovers where id = ${id} and organisation_id = ${organisationId}`,
    ]);
    const r = (rows as Row[])[0];
    return r ? toHandover(r) : null;
  }

  async listHandovers(absenceId: string, organisationId: string): Promise<Handover[]> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select id, organisation_id, absence_id, work_item_id, transfer_id, temporary_owner_user_id, created_at
         from handovers where absence_id = ${absenceId} and organisation_id = ${organisationId}`,
    ]);
    return (rows as Row[]).map(toHandover);
  }
}

function toAbsence(r: Row): Absence {
  return {
    id: r.id,
    organisationId: r.organisation_id,
    userId: r.user_id,
    absenceType: r.absence_type as AbsenceType,
    startsAt: new Date(r.starts_at),
    endsAt: r.ends_at ? new Date(r.ends_at) : null,
    createdAt: new Date(r.created_at),
    returnBriefingCompletedAt: r.return_briefing_completed_at ? new Date(r.return_briefing_completed_at) : null,
  };
}

function toHandover(r: Row): Handover {
  return {
    id: r.id,
    organisationId: r.organisation_id,
    absenceId: r.absence_id,
    workItemId: r.work_item_id,
    transferId: r.transfer_id,
    temporaryOwnerUserId: r.temporary_owner_user_id,
    createdAt: new Date(r.created_at),
  };
}
