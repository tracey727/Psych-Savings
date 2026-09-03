import type { AuditSink } from "@psych-savings/audit";
import { buildAuditEvent } from "@psych-savings/audit";
import {
  acceptTransfer,
  escalate,
  rejectTransfer,
  requestTransfer,
  WorkflowError,
  type WorkItem,
  type WorkItemStore,
} from "@psych-savings/workflow-engine";
import type { AbsenceStore } from "./store";
import type { Absence, AbsenceType, Handover } from "./types";

export { WorkflowError };

const DEFAULT_ESCALATION_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export interface DeclareAbsenceInput {
  organisationId: string;
  userId: string;
  absenceType: AbsenceType;
  startsAt: Date;
  endsAt: Date | null;
  temporaryOwnerUserId: string;
  actorUserId: string;
}

export interface HandoverWithContext {
  handover: Handover;
  workItem: WorkItem;
}

/**
 * Declares a planned leave or unexpected absence and immediately hands
 * over every one of that user's currently open work items
 * (MODULE_REGISTER.md M06: "pre-leave handover queue" / "unexpected
 * absence reassignment", "work requiring cover").
 *
 * Each handover is a work_item_transfer request — ownership does not
 * move until the temporary owner accepts (Phase 7). This is the whole
 * mechanism behind "no active priority work is orphaned": the absent
 * user remains the visible, recorded owner until someone explicitly
 * accepts, never silently unowned.
 */
export async function declareAbsence(
  workItemStore: WorkItemStore,
  absenceStore: AbsenceStore,
  audit: AuditSink,
  input: DeclareAbsenceInput,
): Promise<{ absence: Absence; handovers: HandoverWithContext[] }> {
  const absence = await absenceStore.createAbsence({
    organisationId: input.organisationId,
    userId: input.userId,
    absenceType: input.absenceType,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  });

  const affectedItems = await workItemStore.listWorkItems(input.organisationId, {
    ownerUserId: input.userId,
    status: "open",
  });

  const handovers: HandoverWithContext[] = [];
  for (const workItem of affectedItems) {
    const transfer = await requestTransfer(workItemStore, audit, {
      workItemId: workItem.id,
      organisationId: input.organisationId,
      requestedByUserId: input.userId,
      toUserId: input.temporaryOwnerUserId,
      reason: `handover for ${input.absenceType} absence`,
    });
    const handover = await absenceStore.createHandover({
      organisationId: input.organisationId,
      absenceId: absence.id,
      workItemId: workItem.id,
      transferId: transfer.id,
      temporaryOwnerUserId: input.temporaryOwnerUserId,
    });
    handovers.push({ handover, workItem });
  }

  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.actorUserId,
      action: "absence_declared",
      entityType: "absence",
      entityId: absence.id,
      newState: { absenceType: input.absenceType, userId: input.userId, handoverCount: handovers.length },
      source: "api",
    }),
  );

  return { absence, handovers };
}

export interface AcceptHandoverInput {
  handoverId: string;
  organisationId: string;
  acceptingUserId: string;
}

/** Temporary-owner acceptance (MODULE_REGISTER.md M06) — reuses Phase 7's acceptTransfer exactly. */
export async function acceptHandover(
  workItemStore: WorkItemStore,
  absenceStore: AbsenceStore,
  audit: AuditSink,
  input: AcceptHandoverInput,
): Promise<WorkItem> {
  const handover = await findHandover(absenceStore, input.handoverId, input.organisationId);
  return acceptTransfer(workItemStore, audit, {
    transferId: handover.transferId,
    organisationId: input.organisationId,
    acceptingUserId: input.acceptingUserId,
  });
}

export interface RejectHandoverInput {
  handoverId: string;
  organisationId: string;
  rejectingUserId: string;
  reason: string;
  actorUserId: string;
}

/**
 * A declined handover is inherently higher-risk than an ordinary
 * declined transfer — the original owner is, by definition, absent and
 * unable to act — so this immediately escalates the item rather than
 * leaving it to age out (MODULE_REGISTER.md M06 "unaccepted handover
 * escalation").
 */
export async function rejectHandover(
  workItemStore: WorkItemStore,
  absenceStore: AbsenceStore,
  audit: AuditSink,
  input: RejectHandoverInput,
): Promise<WorkItem> {
  const handover = await findHandover(absenceStore, input.handoverId, input.organisationId);
  await rejectTransfer(workItemStore, audit, {
    transferId: handover.transferId,
    organisationId: input.organisationId,
    rejectingUserId: input.rejectingUserId,
    reason: input.reason,
  });
  const { workItem } = await escalate(workItemStore, audit, {
    workItemId: handover.workItemId,
    organisationId: input.organisationId,
    escalatedToUserId: null,
    reason: `handover declined during absence: ${input.reason}`,
    actorUserId: input.actorUserId,
  });
  return workItem;
}

export interface EscalateUnacceptedHandoversInput {
  absenceId: string;
  organisationId: string;
  actorUserId: string;
  thresholdMs?: number;
}

/** MODULE_REGISTER.md M06 "unaccepted handover escalation" — only high/urgent items, past the pending threshold. */
export async function escalateUnacceptedHandovers(
  workItemStore: WorkItemStore,
  absenceStore: AbsenceStore,
  audit: AuditSink,
  input: EscalateUnacceptedHandoversInput,
  now: Date = new Date(),
): Promise<WorkItem[]> {
  const threshold = input.thresholdMs ?? DEFAULT_ESCALATION_THRESHOLD_MS;
  const handovers = await absenceStore.listHandovers(input.absenceId, input.organisationId);
  const escalated: WorkItem[] = [];

  for (const handover of handovers) {
    const transfer = await workItemStore.getTransfer(handover.transferId, input.organisationId);
    if (!transfer || transfer.acceptedAt !== null || transfer.rejectedAt !== null) continue;
    if (now.getTime() - transfer.requestedAt.getTime() < threshold) continue;

    const workItem = await workItemStore.getWorkItem(handover.workItemId, input.organisationId);
    if (!workItem || workItem.status === "closed") continue;
    if (workItem.priority !== "high" && workItem.priority !== "urgent") continue;

    const { workItem: updated } = await escalate(workItemStore, audit, {
      workItemId: workItem.id,
      organisationId: input.organisationId,
      escalatedToUserId: null,
      reason: "critical handover unaccepted past threshold",
      actorUserId: input.actorUserId,
    });
    escalated.push(updated);
  }

  return escalated;
}

export interface ReturnBriefingItem {
  workItem: WorkItem;
  accepted: boolean;
}

export interface CompleteReturnBriefingInput {
  absenceId: string;
  organisationId: string;
  actorUserId: string;
}

/** Return-from-leave briefing (MODULE_REGISTER.md M06): what happened to every handed-over item while the person was away. */
export async function completeReturnBriefing(
  workItemStore: WorkItemStore,
  absenceStore: AbsenceStore,
  audit: AuditSink,
  input: CompleteReturnBriefingInput,
  now: Date = new Date(),
): Promise<{ absence: Absence; items: ReturnBriefingItem[] }> {
  const existing = await absenceStore.getAbsence(input.absenceId, input.organisationId);
  if (!existing) throw new WorkflowError("absence not found");
  if (existing.returnBriefingCompletedAt !== null) {
    throw new WorkflowError("return briefing already completed for this absence");
  }

  const handovers = await absenceStore.listHandovers(input.absenceId, input.organisationId);
  const items: ReturnBriefingItem[] = [];
  for (const handover of handovers) {
    const [workItem, transfer] = await Promise.all([
      workItemStore.getWorkItem(handover.workItemId, input.organisationId),
      workItemStore.getTransfer(handover.transferId, input.organisationId),
    ]);
    if (!workItem) continue;
    items.push({ workItem, accepted: transfer?.acceptedAt != null });
  }

  const absence = await absenceStore.markReturnBriefingCompleted(input.absenceId, input.organisationId, now);
  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.actorUserId,
      action: "return_briefing_completed",
      entityType: "absence",
      entityId: absence.id,
      newState: { itemCount: items.length },
      source: "api",
    }),
  );

  return { absence, items };
}

export interface AbsenceImpactSummary {
  totalHandovers: number;
  accepted: number;
  rejected: number;
  pending: number;
  /** Handed-over items still open and Red/Amber — a proxy for work at risk of being dropped or repeated because of the absence. */
  atRiskItemCount: number;
}

/** MODULE_REGISTER.md M06 "measure repeated/recovered work caused by absence". */
export async function getAbsenceImpactSummary(
  workItemStore: WorkItemStore,
  absenceStore: AbsenceStore,
  organisationId: string,
  absenceId: string,
): Promise<AbsenceImpactSummary> {
  const handovers = await absenceStore.listHandovers(absenceId, organisationId);
  const summary: AbsenceImpactSummary = { totalHandovers: handovers.length, accepted: 0, rejected: 0, pending: 0, atRiskItemCount: 0 };

  for (const handover of handovers) {
    const [transfer, workItem] = await Promise.all([
      workItemStore.getTransfer(handover.transferId, organisationId),
      workItemStore.getWorkItem(handover.workItemId, organisationId),
    ]);
    if (transfer?.acceptedAt != null) summary.accepted++;
    else if (transfer?.rejectedAt != null) summary.rejected++;
    else summary.pending++;

    if (workItem && workItem.status === "open" && (workItem.healthState === "red" || workItem.healthState === "amber")) {
      summary.atRiskItemCount++;
    }
  }

  return summary;
}

async function findHandover(absenceStore: AbsenceStore, handoverId: string, organisationId: string): Promise<Handover> {
  const handover = await absenceStore.getHandover(handoverId, organisationId);
  if (!handover) throw new WorkflowError("handover not found");
  return handover;
}
