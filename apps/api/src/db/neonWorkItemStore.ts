import type { NeonQueryFunction, NeonQueryFunctionInTransaction, NeonQueryInTransaction } from "@neondatabase/serverless";
import type {
  ActionEvidence,
  CreateEscalationInput,
  CreateTransferInput,
  CreateWorkItemInput,
  Escalation,
  RecordEvidenceInput,
  StatusHistoryInput,
  Transfer,
  WorkItem,
  WorkItemPatch,
  WorkItemQueueFilters,
  WorkItemStore,
  WorkloadEntry,
} from "@psych-savings/workflow-engine";

type Sql = NeonQueryFunction<false, false>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/**
 * Real Neon-backed WorkItemStore. Same pattern as db/neonAuthStore.ts:
 * every query runs inside a transaction that sets `app.current_org_id`
 * first, so this is subject to the same RLS tenant isolation proven
 * live in Phase 5 — an ordinary least-privilege client, not a bypass.
 * Not exercised by the local test suite (see
 * docs/architecture/ENVIRONMENTS.md "Testing the database adapter");
 * the engine logic that calls it is fully tested against an in-memory
 * fake (packages/workflow-engine/test/fakes/fakeWorkItemStore.ts).
 */
export class NeonWorkItemStore implements WorkItemStore {
  constructor(private readonly sql: Sql) {}

  async createWorkItem(input: CreateWorkItemInput): Promise<WorkItem> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${input.organisationId}, true)`,
      tx`insert into work_items (organisation_id, centre_id, domain, title, current_owner_user_id, priority, due_at, next_action, health_state, status)
         values (${input.organisationId}, ${input.centreId}, ${input.domain}, ${input.title}, ${input.ownerUserId}, ${input.priority}, ${input.dueAt?.toISOString() ?? null}, ${input.nextAction}, 'green', 'open')
         returning id, organisation_id, centre_id, domain, title, current_owner_user_id, priority, due_at, next_action, health_state, status, close_reason, created_at, updated_at, closed_at`,
    ]);
    return toWorkItem((rows as Row[])[0]!);
  }

  async getWorkItem(id: string, organisationId: string): Promise<WorkItem | null> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select id, organisation_id, centre_id, domain, title, current_owner_user_id, priority, due_at, next_action, health_state, status, close_reason, created_at, updated_at, closed_at
         from work_items where id = ${id} and organisation_id = ${organisationId}`,
    ]);
    const r = (rows as Row[])[0];
    return r ? toWorkItem(r) : null;
  }

  async updateWorkItem(id: string, organisationId: string, patch: WorkItemPatch): Promise<WorkItem> {
    // Built as a small set of targeted UPDATEs rather than one dynamic
    // SQL string — the tagged-template driver does not support
    // interpolating column lists, and this keeps every write explicit
    // and reviewable.
    if (patch.currentOwnerUserId !== undefined) {
      await this.runUpdate(
        organisationId,
        (tx) => tx`update work_items set current_owner_user_id = ${patch.currentOwnerUserId} where id = ${id} and organisation_id = ${organisationId}`,
      );
    }
    if (patch.priority !== undefined) {
      await this.runUpdate(organisationId, (tx) => tx`update work_items set priority = ${patch.priority} where id = ${id} and organisation_id = ${organisationId}`);
    }
    if (patch.dueAt !== undefined) {
      await this.runUpdate(
        organisationId,
        (tx) => tx`update work_items set due_at = ${patch.dueAt?.toISOString() ?? null} where id = ${id} and organisation_id = ${organisationId}`,
      );
    }
    if (patch.nextAction !== undefined) {
      await this.runUpdate(organisationId, (tx) => tx`update work_items set next_action = ${patch.nextAction} where id = ${id} and organisation_id = ${organisationId}`);
    }
    if (patch.healthState !== undefined) {
      await this.runUpdate(organisationId, (tx) => tx`update work_items set health_state = ${patch.healthState} where id = ${id} and organisation_id = ${organisationId}`);
    }
    if (patch.status !== undefined) {
      await this.runUpdate(organisationId, (tx) => tx`update work_items set status = ${patch.status} where id = ${id} and organisation_id = ${organisationId}`);
    }
    if (patch.closeReason !== undefined) {
      await this.runUpdate(organisationId, (tx) => tx`update work_items set close_reason = ${patch.closeReason} where id = ${id} and organisation_id = ${organisationId}`);
    }
    if (patch.closedAt !== undefined) {
      await this.runUpdate(
        organisationId,
        (tx) => tx`update work_items set closed_at = ${patch.closedAt?.toISOString() ?? null} where id = ${id} and organisation_id = ${organisationId}`,
      );
    }
    await this.runUpdate(organisationId, (tx) => tx`update work_items set updated_at = now() where id = ${id} and organisation_id = ${organisationId}`);

    const updated = await this.getWorkItem(id, organisationId);
    if (!updated) throw new Error("work item not found after update");
    return updated;
  }

  private async runUpdate(
    organisationId: string,
    query: (tx: NeonQueryFunctionInTransaction<false, false>) => NeonQueryInTransaction,
  ) {
    await this.sql.transaction((tx) => [tx`select set_config('app.current_org_id', ${organisationId}, true)`, query(tx)]);
  }

  async recordOwnerAssigned(workItemId: string, organisationId: string, userId: string, assignedAt: Date): Promise<void> {
    await this.runUpdate(
      organisationId,
      (tx) =>
        tx`insert into work_item_owners (organisation_id, work_item_id, user_id, assigned_at)
           values (${organisationId}, ${workItemId}, ${userId}, ${assignedAt.toISOString()})`,
    );
  }

  async recordOwnerUnassigned(workItemId: string, organisationId: string, userId: string, unassignedAt: Date): Promise<void> {
    await this.runUpdate(
      organisationId,
      (tx) =>
        tx`update work_item_owners set unassigned_at = ${unassignedAt.toISOString()}
           where work_item_id = ${workItemId} and user_id = ${userId} and unassigned_at is null`,
    );
  }

  async createTransfer(input: CreateTransferInput): Promise<Transfer> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${input.organisationId}, true)`,
      tx`insert into work_item_transfers (organisation_id, work_item_id, from_user_id, to_user_id, reason)
         values (${input.organisationId}, ${input.workItemId}, ${input.fromUserId}, ${input.toUserId}, ${input.reason})
         returning id, organisation_id, work_item_id, from_user_id, to_user_id, requested_at, accepted_at, rejected_at, reason`,
    ]);
    return toTransfer((rows as Row[])[0]!);
  }

  async getTransfer(id: string, organisationId: string): Promise<Transfer | null> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select id, organisation_id, work_item_id, from_user_id, to_user_id, requested_at, accepted_at, rejected_at, reason
         from work_item_transfers where id = ${id} and organisation_id = ${organisationId}`,
    ]);
    const r = (rows as Row[])[0];
    return r ? toTransfer(r) : null;
  }

  async markTransferAccepted(id: string, organisationId: string, acceptedAt: Date): Promise<void> {
    await this.runUpdate(
      organisationId,
      (tx) => tx`update work_item_transfers set accepted_at = ${acceptedAt.toISOString()} where id = ${id} and organisation_id = ${organisationId}`,
    );
  }

  async markTransferRejected(id: string, organisationId: string, rejectedAt: Date): Promise<void> {
    await this.runUpdate(
      organisationId,
      (tx) => tx`update work_item_transfers set rejected_at = ${rejectedAt.toISOString()} where id = ${id} and organisation_id = ${organisationId}`,
    );
  }

  async createEscalation(input: CreateEscalationInput): Promise<Escalation> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${input.organisationId}, true)`,
      tx`insert into escalations (organisation_id, work_item_id, escalated_to_user_id, reason)
         values (${input.organisationId}, ${input.workItemId}, ${input.escalatedToUserId}, ${input.reason})
         returning id, organisation_id, work_item_id, escalated_at, escalated_to_user_id, reason, resolved_at`,
    ]);
    return toEscalation((rows as Row[])[0]!);
  }

  async getOpenEscalationCount(workItemId: string, organisationId: string): Promise<number> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select count(*)::int as n from escalations where work_item_id = ${workItemId} and organisation_id = ${organisationId} and resolved_at is null`,
    ]);
    return (rows as Row[])[0]?.n ?? 0;
  }

  async resolveEscalation(id: string, organisationId: string, resolvedAt: Date): Promise<void> {
    await this.runUpdate(
      organisationId,
      (tx) => tx`update escalations set resolved_at = ${resolvedAt.toISOString()} where id = ${id} and organisation_id = ${organisationId}`,
    );
  }

  async recordStatusHistory(input: StatusHistoryInput): Promise<void> {
    await this.runUpdate(
      input.organisationId,
      (tx) =>
        tx`insert into work_item_status_history (organisation_id, work_item_id, changed_by_user_id, from_health_state, to_health_state, from_status, to_status, reason)
           values (${input.organisationId}, ${input.workItemId}, ${input.changedByUserId}, ${input.fromHealthState}, ${input.toHealthState}, ${input.fromStatus}, ${input.toStatus}, ${input.reason})`,
    );
  }

  // A NULL parameter means "no filter on this column" — avoids building
  // SQL strings dynamically while still supporting optional filters in
  // one parameterized query.
  async listWorkItems(organisationId: string, filters: WorkItemQueueFilters): Promise<WorkItem[]> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select id, organisation_id, centre_id, domain, title, current_owner_user_id, priority, due_at, next_action, health_state, status, close_reason, created_at, updated_at, closed_at
         from work_items
         where organisation_id = ${organisationId}
           and (${filters.domain ?? null}::text is null or domain = ${filters.domain ?? null})
           and (${filters.status ?? null}::text is null or status = ${filters.status ?? null})
           and (${filters.ownerUserId ?? null}::uuid is null or current_owner_user_id = ${filters.ownerUserId ?? null})
           and (${filters.centreId ?? null}::uuid is null or centre_id = ${filters.centreId ?? null})`,
    ]);
    return (rows as Row[]).map(toWorkItem);
  }

  async recordEvidence(input: RecordEvidenceInput): Promise<ActionEvidence> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${input.organisationId}, true)`,
      tx`insert into action_evidence (organisation_id, work_item_id, evidence_type, reference, note, created_by_user_id)
         values (${input.organisationId}, ${input.workItemId}, ${input.evidenceType}, ${input.reference}, ${input.note}, ${input.createdByUserId})
         returning id, organisation_id, work_item_id, evidence_type, reference, note, created_at, created_by_user_id`,
    ]);
    return toActionEvidence((rows as Row[])[0]!);
  }

  async listEvidence(workItemId: string, organisationId: string): Promise<ActionEvidence[]> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select id, organisation_id, work_item_id, evidence_type, reference, note, created_at, created_by_user_id
         from action_evidence where work_item_id = ${workItemId} and organisation_id = ${organisationId}
         order by created_at asc`,
    ]);
    return (rows as Row[]).map(toActionEvidence);
  }

  async getWorkloadSummary(organisationId: string, centreId: string | null): Promise<WorkloadEntry[]> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select current_owner_user_id as user_id,
                count(*)::int as open_count,
                count(*) filter (where due_at is not null and due_at < now())::int as overdue_count
         from work_items
         where organisation_id = ${organisationId} and status = 'open'
           and (${centreId}::uuid is null or centre_id = ${centreId})
         group by current_owner_user_id`,
    ]);
    return (rows as Row[]).map((r) => ({
      userId: r.user_id,
      openCount: r.open_count,
      overdueCount: r.overdue_count,
    }));
  }
}

function toActionEvidence(r: Row): ActionEvidence {
  return {
    id: r.id,
    organisationId: r.organisation_id,
    workItemId: r.work_item_id,
    evidenceType: r.evidence_type,
    reference: r.reference,
    note: r.note,
    createdAt: new Date(r.created_at),
    createdByUserId: r.created_by_user_id,
  };
}

function toWorkItem(r: Row): WorkItem {
  return {
    id: r.id,
    organisationId: r.organisation_id,
    centreId: r.centre_id,
    domain: r.domain,
    title: r.title,
    currentOwnerUserId: r.current_owner_user_id,
    priority: r.priority,
    dueAt: r.due_at ? new Date(r.due_at) : null,
    nextAction: r.next_action,
    healthState: r.health_state,
    status: r.status,
    closeReason: r.close_reason,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
    closedAt: r.closed_at ? new Date(r.closed_at) : null,
  };
}

function toTransfer(r: Row): Transfer {
  return {
    id: r.id,
    organisationId: r.organisation_id,
    workItemId: r.work_item_id,
    fromUserId: r.from_user_id,
    toUserId: r.to_user_id,
    requestedAt: new Date(r.requested_at),
    acceptedAt: r.accepted_at ? new Date(r.accepted_at) : null,
    rejectedAt: r.rejected_at ? new Date(r.rejected_at) : null,
    reason: r.reason,
  };
}

function toEscalation(r: Row): Escalation {
  return {
    id: r.id,
    organisationId: r.organisation_id,
    workItemId: r.work_item_id,
    escalatedAt: new Date(r.escalated_at),
    escalatedToUserId: r.escalated_to_user_id,
    reason: r.reason,
    resolvedAt: r.resolved_at ? new Date(r.resolved_at) : null,
  };
}
