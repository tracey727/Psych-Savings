import type { NeonQueryFunction, NeonQueryFunctionInTransaction, NeonQueryInTransaction } from "@neondatabase/serverless";
import type { Recurrence, RootCauseCategory, WasteCategory } from "@psych-savings/shared-types";
import { OCCURRENCES_PER_YEAR } from "@psych-savings/shared-types";
import type {
  CreateInterventionInput,
  CreateWasteEventInput,
  InterventionPatch,
  WasteCategoryTotal,
  WasteEventFilters,
  WasteEventPatch,
  WasteStore,
} from "../waste/store";
import type { ProcessIntervention, WasteEvent } from "../waste/types";

type Sql = NeonQueryFunction<false, false>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/** Same pattern as every other Neon-backed store in this repo — see docs/architecture/ENVIRONMENTS.md "Testing the database adapter". */
export class NeonWasteStore implements WasteStore {
  constructor(private readonly sql: Sql) {}

  async createWasteEvent(input: CreateWasteEventInput): Promise<WasteEvent> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${input.organisationId}, true)`,
      tx`insert into waste_events (organisation_id, centre_id, reported_by_user_id, category, staff_role,
                                   description, estimated_minutes, recurrence, occurred_at)
         values (${input.organisationId}, ${input.centreId}, ${input.reportedByUserId}, ${input.category},
                 ${input.staffRole}, ${input.description}, ${input.estimatedMinutes}, ${input.recurrence},
                 ${input.occurredAt.toISOString()})
         returning id, organisation_id, centre_id, reported_by_user_id, category, staff_role, description,
                   estimated_minutes, recurrence, occurred_at, root_cause_category, root_cause_note,
                   reviewed_at, reviewed_by_user_id, intervention_id, created_at, updated_at`,
    ]);
    return toWasteEvent((rows as Row[])[0]!);
  }

  async getWasteEvent(id: string, organisationId: string): Promise<WasteEvent | null> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select id, organisation_id, centre_id, reported_by_user_id, category, staff_role, description,
                estimated_minutes, recurrence, occurred_at, root_cause_category, root_cause_note,
                reviewed_at, reviewed_by_user_id, intervention_id, created_at, updated_at
         from waste_events where id = ${id} and organisation_id = ${organisationId}`,
    ]);
    const r = (rows as Row[])[0];
    return r ? toWasteEvent(r) : null;
  }

  /**
   * Targeted UPDATEs rather than one dynamic SQL string — the
   * tagged-template driver does not support interpolating column lists,
   * and this keeps every write explicit and reviewable (same approach as
   * NeonWorkItemStore.updateWorkItem).
   *
   * The four review columns move together because the database's
   * `reviewed_has_actor_and_cause` CHECK requires them to: a review with
   * a timestamp but no cause, or a cause with nobody's name against it,
   * is not a review.
   */
  async updateWasteEvent(id: string, organisationId: string, patch: WasteEventPatch): Promise<WasteEvent> {
    if (patch.reviewedAt !== undefined) {
      await this.runUpdate(
        organisationId,
        (tx) => tx`update waste_events set
                     root_cause_category = ${patch.rootCauseCategory ?? null},
                     root_cause_note = ${patch.rootCauseNote ?? null},
                     reviewed_at = ${patch.reviewedAt?.toISOString() ?? null},
                     reviewed_by_user_id = ${patch.reviewedByUserId ?? null},
                     updated_at = now()
                   where id = ${id} and organisation_id = ${organisationId}`,
      );
    }
    if (patch.interventionId !== undefined) {
      await this.runUpdate(
        organisationId,
        (tx) => tx`update waste_events set intervention_id = ${patch.interventionId}, updated_at = now()
                   where id = ${id} and organisation_id = ${organisationId}`,
      );
    }

    const updated = await this.getWasteEvent(id, organisationId);
    if (!updated) throw new Error("waste event not found after update");
    return updated;
  }

  async listWasteEvents(organisationId: string, filters: WasteEventFilters): Promise<WasteEvent[]> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select id, organisation_id, centre_id, reported_by_user_id, category, staff_role, description,
                estimated_minutes, recurrence, occurred_at, root_cause_category, root_cause_note,
                reviewed_at, reviewed_by_user_id, intervention_id, created_at, updated_at
         from waste_events
         where organisation_id = ${organisationId}
           and (${filters.category ?? null}::text is null or category = ${filters.category ?? null})
           and (${filters.interventionId ?? null}::uuid is null or intervention_id = ${filters.interventionId ?? null})
           and (${filters.unreviewedOnly ?? false}::boolean is not true or reviewed_at is null)
           and (${filters.reviewedOnly ?? false}::boolean is not true or reviewed_at is not null)
         order by occurred_at desc`,
    ]);
    return (rows as Row[]).map(toWasteEvent);
  }

  async createIntervention(input: CreateInterventionInput): Promise<ProcessIntervention> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${input.organisationId}, true)`,
      tx`insert into process_interventions (organisation_id, work_item_id, title, description, root_cause_category)
         values (${input.organisationId}, ${input.workItemId}, ${input.title}, ${input.description}, ${input.rootCauseCategory})
         returning id, organisation_id, work_item_id, title, description, root_cause_category,
                   implemented_at, implemented_by_user_id, created_at, updated_at`,
    ]);
    return toIntervention((rows as Row[])[0]!);
  }

  async getIntervention(id: string, organisationId: string): Promise<ProcessIntervention | null> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select id, organisation_id, work_item_id, title, description, root_cause_category,
                implemented_at, implemented_by_user_id, created_at, updated_at
         from process_interventions where id = ${id} and organisation_id = ${organisationId}`,
    ]);
    const r = (rows as Row[])[0];
    return r ? toIntervention(r) : null;
  }

  /** Both implemented columns move together — the `implemented_has_actor` CHECK requires it. */
  async updateIntervention(id: string, organisationId: string, patch: InterventionPatch): Promise<ProcessIntervention> {
    if (patch.implementedAt !== undefined) {
      await this.runUpdate(
        organisationId,
        (tx) => tx`update process_interventions set
                     implemented_at = ${patch.implementedAt?.toISOString() ?? null},
                     implemented_by_user_id = ${patch.implementedByUserId ?? null},
                     updated_at = now()
                   where id = ${id} and organisation_id = ${organisationId}`,
      );
    }
    const updated = await this.getIntervention(id, organisationId);
    if (!updated) throw new Error("intervention not found after update");
    return updated;
  }

  /**
   * Counts and minutes come from the database; the annualised figure is
   * computed here from OCCURRENCES_PER_YEAR so the working-day constants
   * live in exactly one place (packages/shared-types) rather than being
   * duplicated into SQL.
   */
  async getWasteTotalsByCategory(organisationId: string): Promise<WasteCategoryTotal[]> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select category, recurrence, count(*)::int as event_count, sum(estimated_minutes)::int as total_minutes
         from waste_events
         where organisation_id = ${organisationId}
         group by category, recurrence`,
    ]);

    const totals = new Map<WasteCategory, WasteCategoryTotal>();
    for (const r of rows as Row[]) {
      const category = r.category as WasteCategory;
      const entry = totals.get(category) ?? {
        category,
        eventCount: 0,
        totalEstimatedMinutes: 0,
        annualisedMinutes: 0,
      };
      entry.eventCount += r.event_count;
      entry.totalEstimatedMinutes += r.total_minutes;
      entry.annualisedMinutes += r.total_minutes * OCCURRENCES_PER_YEAR[r.recurrence as Recurrence];
      totals.set(category, entry);
    }
    return [...totals.values()];
  }

  private async runUpdate(
    organisationId: string,
    query: (tx: NeonQueryFunctionInTransaction<false, false>) => NeonQueryInTransaction,
  ) {
    await this.sql.transaction((tx) => [tx`select set_config('app.current_org_id', ${organisationId}, true)`, query(tx)]);
  }
}

function toWasteEvent(r: Row): WasteEvent {
  return {
    id: r.id,
    organisationId: r.organisation_id,
    centreId: r.centre_id,
    reportedByUserId: r.reported_by_user_id,
    category: r.category as WasteCategory,
    staffRole: r.staff_role,
    description: r.description,
    estimatedMinutes: r.estimated_minutes,
    recurrence: r.recurrence as Recurrence,
    occurredAt: new Date(r.occurred_at),
    rootCauseCategory: (r.root_cause_category as RootCauseCategory | null) ?? null,
    rootCauseNote: r.root_cause_note,
    reviewedAt: r.reviewed_at ? new Date(r.reviewed_at) : null,
    reviewedByUserId: r.reviewed_by_user_id,
    interventionId: r.intervention_id,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

function toIntervention(r: Row): ProcessIntervention {
  return {
    id: r.id,
    organisationId: r.organisation_id,
    workItemId: r.work_item_id,
    title: r.title,
    description: r.description,
    rootCauseCategory: r.root_cause_category as RootCauseCategory,
    implementedAt: r.implemented_at ? new Date(r.implemented_at) : null,
    implementedByUserId: r.implemented_by_user_id,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}
