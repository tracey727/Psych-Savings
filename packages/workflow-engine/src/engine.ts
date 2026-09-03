import type { AuditSink } from "@psych-savings/audit";
import { buildAuditEvent } from "@psych-savings/audit";
import { recalculateWorkItemHealth } from "./health";
import type { CreateWorkItemInput, WorkItemStore } from "./store";
import type { Escalation, Transfer, WorkItem } from "./types";

export class WorkflowError extends Error {}

/**
 * Creates a work item WITH its owner in the same operation — the type
 * signature makes `ownerUserId` mandatory, so it is impossible to call
 * this engine in a way that produces an ownerless active item
 * (PRODUCT_CONTRACT.md §5.1, MODULE_REGISTER.md M04). This is the
 * concrete mechanism behind the Phase 7 GREEN gate: "An active item
 * cannot silently lose ownership."
 */
export async function createWorkItem(
  store: WorkItemStore,
  audit: AuditSink,
  input: CreateWorkItemInput,
  now: Date = new Date(),
): Promise<WorkItem> {
  const item = await store.createWorkItem(input);
  await store.recordOwnerAssigned(item.id, item.organisationId, input.ownerUserId, now);
  await store.recordStatusHistory({
    organisationId: item.organisationId,
    workItemId: item.id,
    changedByUserId: input.ownerUserId,
    fromHealthState: null,
    toHealthState: item.healthState,
    fromStatus: null,
    toStatus: item.status,
    reason: "created",
  });
  await audit.write(
    buildAuditEvent({
      organisationId: item.organisationId,
      actorUserId: input.ownerUserId,
      action: "work_item_created",
      entityType: "work_item",
      entityId: item.id,
      newState: { title: item.title, ownerUserId: input.ownerUserId, dueAt: item.dueAt },
      source: "api",
    }),
  );
  return recomputeHealth(store, item, now);
}

/** Ownership transfer is not complete until accepted (PRODUCT_CONTRACT.md §5.2) — this only records the request. */
export async function requestTransfer(
  store: WorkItemStore,
  audit: AuditSink,
  input: { workItemId: string; organisationId: string; requestedByUserId: string; toUserId: string; reason: string | null },
): Promise<Transfer> {
  const item = await store.getWorkItem(input.workItemId, input.organisationId);
  if (!item) throw new WorkflowError("work item not found");
  if (item.currentOwnerUserId !== input.requestedByUserId) {
    throw new WorkflowError("only the current owner can request a transfer");
  }
  if (item.status === "closed") throw new WorkflowError("cannot transfer a closed work item");

  const transfer = await store.createTransfer({
    organisationId: input.organisationId,
    workItemId: input.workItemId,
    fromUserId: input.requestedByUserId,
    toUserId: input.toUserId,
    reason: input.reason,
  });
  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.requestedByUserId,
      action: "transfer_requested",
      entityType: "work_item_transfer",
      entityId: transfer.id,
      newState: { workItemId: input.workItemId, toUserId: input.toUserId },
      reason: input.reason,
      source: "api",
    }),
  );
  return transfer;
}

export async function acceptTransfer(
  store: WorkItemStore,
  audit: AuditSink,
  input: { transferId: string; organisationId: string; acceptingUserId: string },
  now: Date = new Date(),
): Promise<WorkItem> {
  const transfer = await store.getTransfer(input.transferId, input.organisationId);
  if (!transfer) throw new WorkflowError("transfer not found");
  if (transfer.acceptedAt !== null || transfer.rejectedAt !== null) {
    throw new WorkflowError("transfer already resolved");
  }
  if (transfer.toUserId !== input.acceptingUserId) {
    throw new WorkflowError("only the intended recipient can accept this transfer");
  }

  await store.markTransferAccepted(transfer.id, input.organisationId, now);
  if (transfer.fromUserId) {
    await store.recordOwnerUnassigned(transfer.workItemId, input.organisationId, transfer.fromUserId, now);
  }
  await store.recordOwnerAssigned(transfer.workItemId, input.organisationId, transfer.toUserId, now);
  const item = await store.updateWorkItem(transfer.workItemId, input.organisationId, {
    currentOwnerUserId: transfer.toUserId,
  });

  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.acceptingUserId,
      action: "transfer_accepted",
      entityType: "work_item_transfer",
      entityId: transfer.id,
      priorState: { ownerUserId: transfer.fromUserId },
      newState: { ownerUserId: transfer.toUserId },
      source: "api",
    }),
  );

  return item;
}

/** A rejected transfer leaves ownership exactly where it was — never partially applied. */
export async function rejectTransfer(
  store: WorkItemStore,
  audit: AuditSink,
  input: { transferId: string; organisationId: string; rejectingUserId: string; reason: string },
  now: Date = new Date(),
): Promise<void> {
  const transfer = await store.getTransfer(input.transferId, input.organisationId);
  if (!transfer) throw new WorkflowError("transfer not found");
  if (transfer.acceptedAt !== null || transfer.rejectedAt !== null) {
    throw new WorkflowError("transfer already resolved");
  }
  if (transfer.toUserId !== input.rejectingUserId) {
    throw new WorkflowError("only the intended recipient can reject this transfer");
  }

  await store.markTransferRejected(transfer.id, input.organisationId, now);
  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.rejectingUserId,
      action: "transfer_rejected",
      entityType: "work_item_transfer",
      entityId: transfer.id,
      reason: input.reason,
      source: "api",
    }),
  );
}

export async function escalate(
  store: WorkItemStore,
  audit: AuditSink,
  input: { workItemId: string; organisationId: string; escalatedToUserId: string | null; reason: string; actorUserId: string | null },
  now: Date = new Date(),
): Promise<{ workItem: WorkItem; escalation: Escalation }> {
  const item = await store.getWorkItem(input.workItemId, input.organisationId);
  if (!item) throw new WorkflowError("work item not found");

  const escalation = await store.createEscalation({
    organisationId: input.organisationId,
    workItemId: input.workItemId,
    escalatedToUserId: input.escalatedToUserId,
    reason: input.reason,
  });

  const updated = await recomputeHealth(store, item, now, input.actorUserId, "escalated");
  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.actorUserId,
      action: "escalated",
      entityType: "escalation",
      entityId: escalation.id,
      reason: input.reason,
      source: "api",
    }),
  );

  return { workItem: updated, escalation };
}

export async function resolveEscalation(
  store: WorkItemStore,
  audit: AuditSink,
  input: { escalationId: string; workItemId: string; organisationId: string; actorUserId: string | null },
  now: Date = new Date(),
): Promise<WorkItem> {
  await store.resolveEscalation(input.escalationId, input.organisationId, now);
  const item = await store.getWorkItem(input.workItemId, input.organisationId);
  if (!item) throw new WorkflowError("work item not found");

  const updated = await recomputeHealth(store, item, now, input.actorUserId, "escalation_resolved");
  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.actorUserId,
      action: "escalation_resolved",
      entityType: "escalation",
      entityId: input.escalationId,
      source: "api",
    }),
  );
  return updated;
}

/** Recovery is a deliberate, person-initiated state — never inferred purely from time passing. */
export async function beginRecovery(
  store: WorkItemStore,
  audit: AuditSink,
  input: { workItemId: string; organisationId: string; actorUserId: string },
): Promise<WorkItem> {
  const item = await store.getWorkItem(input.workItemId, input.organisationId);
  if (!item) throw new WorkflowError("work item not found");
  if (item.healthState !== "red") throw new WorkflowError("recovery can only begin from a Red item");

  const updated = await store.updateWorkItem(item.id, input.organisationId, { healthState: "recovery" });
  await store.recordStatusHistory({
    organisationId: input.organisationId,
    workItemId: item.id,
    changedByUserId: input.actorUserId,
    fromHealthState: "red",
    toHealthState: "recovery",
    fromStatus: item.status,
    toStatus: item.status,
    reason: "recovery started",
  });
  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.actorUserId,
      action: "recovery_started",
      entityType: "work_item",
      entityId: item.id,
      source: "api",
    }),
  );
  return updated;
}

/** Closed work requires a reason (PRODUCT_CONTRACT.md §5.5); the DB CHECK constraint enforces this too, in depth. */
export async function closeWorkItem(
  store: WorkItemStore,
  audit: AuditSink,
  input: { workItemId: string; organisationId: string; actorUserId: string; reason: string },
  now: Date = new Date(),
): Promise<WorkItem> {
  if (!input.reason.trim()) throw new WorkflowError("a close reason is required");
  const item = await store.getWorkItem(input.workItemId, input.organisationId);
  if (!item) throw new WorkflowError("work item not found");
  if (item.status === "closed") throw new WorkflowError("work item is already closed");

  const updated = await store.updateWorkItem(item.id, input.organisationId, {
    status: "closed",
    closeReason: input.reason,
    closedAt: now,
  });
  await store.recordStatusHistory({
    organisationId: input.organisationId,
    workItemId: item.id,
    changedByUserId: input.actorUserId,
    fromHealthState: item.healthState,
    toHealthState: item.healthState,
    fromStatus: "open",
    toStatus: "closed",
    reason: input.reason,
  });
  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.actorUserId,
      action: "closed",
      entityType: "work_item",
      entityId: item.id,
      reason: input.reason,
      source: "api",
    }),
  );
  return updated;
}

/**
 * Updates due date/priority/next action on an open item and recomputes
 * health state accordingly (e.g. setting a near-term follow-up deadline
 * can turn a Green item Amber immediately). This is what domain modules
 * built on this engine (Phase 8+) call for things like "follow-up
 * deadline" rather than writing to the work_items table directly.
 */
export async function rescheduleWorkItem(
  store: WorkItemStore,
  audit: AuditSink,
  input: {
    workItemId: string;
    organisationId: string;
    actorUserId: string;
    dueAt?: Date | null;
    priority?: WorkItem["priority"];
    nextAction?: string | null;
    reason: string | null;
  },
  now: Date = new Date(),
): Promise<WorkItem> {
  const item = await store.getWorkItem(input.workItemId, input.organisationId);
  if (!item) throw new WorkflowError("work item not found");
  if (item.status === "closed") throw new WorkflowError("cannot reschedule a closed work item");

  const patch: Parameters<WorkItemStore["updateWorkItem"]>[2] = {};
  if (input.dueAt !== undefined) patch.dueAt = input.dueAt;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.nextAction !== undefined) patch.nextAction = input.nextAction;
  const updated = await store.updateWorkItem(item.id, input.organisationId, patch);

  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.actorUserId,
      action: "rescheduled",
      entityType: "work_item",
      entityId: item.id,
      priorState: { dueAt: item.dueAt, nextAction: item.nextAction },
      newState: { dueAt: updated.dueAt, nextAction: updated.nextAction },
      reason: input.reason,
      source: "api",
    }),
  );

  return recomputeHealth(store, updated, now, input.actorUserId, input.reason ?? "rescheduled");
}

export async function reopenWorkItem(
  store: WorkItemStore,
  audit: AuditSink,
  input: { workItemId: string; organisationId: string; actorUserId: string; reason: string },
  now: Date = new Date(),
): Promise<WorkItem> {
  if (!input.reason.trim()) throw new WorkflowError("a reopen reason is required");
  const item = await store.getWorkItem(input.workItemId, input.organisationId);
  if (!item) throw new WorkflowError("work item not found");
  if (item.status !== "closed") throw new WorkflowError("work item is not closed");

  await store.updateWorkItem(item.id, input.organisationId, {
    status: "open",
    closeReason: null,
    closedAt: null,
  });
  await store.recordStatusHistory({
    organisationId: input.organisationId,
    workItemId: item.id,
    changedByUserId: input.actorUserId,
    fromHealthState: item.healthState,
    toHealthState: item.healthState,
    fromStatus: "closed",
    toStatus: "open",
    reason: input.reason,
  });
  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.actorUserId,
      action: "reopened",
      entityType: "work_item",
      entityId: item.id,
      reason: input.reason,
      source: "api",
    }),
  );

  const refreshed = await store.getWorkItem(item.id, input.organisationId);
  return recomputeHealth(store, refreshed!, now, input.actorUserId, "reopened");
}

/** Recomputes and persists health state (health.ts is pure; this is the only place that writes the result). */
async function recomputeHealth(
  store: WorkItemStore,
  item: WorkItem,
  now: Date,
  actorUserId: string | null = null,
  reason: string | null = null,
): Promise<WorkItem> {
  const openEscalationCount = await store.getOpenEscalationCount(item.id, item.organisationId);
  const nextState = recalculateWorkItemHealth(item, now, openEscalationCount);
  if (nextState === item.healthState) return item;

  const updated = await store.updateWorkItem(item.id, item.organisationId, { healthState: nextState });
  await store.recordStatusHistory({
    organisationId: item.organisationId,
    workItemId: item.id,
    changedByUserId: actorUserId,
    fromHealthState: item.healthState,
    toHealthState: nextState,
    fromStatus: item.status,
    toStatus: item.status,
    reason,
  });
  return updated;
}
