import type { AuditSink } from "@psych-savings/audit";
import { buildAuditEvent } from "@psych-savings/audit";
import {
  createWorkItem,
  closeWorkItem,
  rescheduleWorkItem,
  WorkflowError,
  type WorkItem,
  type WorkItemStore,
} from "@psych-savings/workflow-engine";
import type { ReferralPatch, ReferralStore } from "./store";
import { LOST_OUTCOMES, type Referral, type ReferralOutcome } from "./types";

export { WorkflowError };

export interface IntakeReferralInput {
  organisationId: string;
  centreId: string | null;
  ownerUserId: string;
  source: string;
  valueEstimateCents: number | null;
  firstContactDueAt: Date;
  title?: string;
}

/**
 * Registers a referral and assigns its owner in the same operation
 * (MODULE_REGISTER.md M01: "register each referral", "assign owner
 * immediately"). The referral IS a work item (domain = 'referral') —
 * ownership, the first-contact deadline, escalation and closure are all
 * the Phase 7 engine, reused rather than reimplemented; only `source`,
 * contact progress and outcome are referral-specific.
 */
export async function intakeReferral(
  workItemStore: WorkItemStore,
  referralStore: ReferralStore,
  audit: AuditSink,
  input: IntakeReferralInput,
): Promise<{ workItem: WorkItem; referral: Referral }> {
  const workItem = await createWorkItem(workItemStore, audit, {
    organisationId: input.organisationId,
    centreId: input.centreId,
    domain: "referral",
    title: input.title ?? `Referral — ${input.source}`,
    ownerUserId: input.ownerUserId,
    priority: "normal",
    dueAt: input.firstContactDueAt,
    nextAction: "First contact attempt",
  });

  const referral = await referralStore.createReferral({
    organisationId: input.organisationId,
    workItemId: workItem.id,
    source: input.source,
    valueEstimateCents: input.valueEstimateCents,
  });

  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.ownerUserId,
      action: "referral_intake",
      entityType: "referral",
      entityId: referral.id,
      newState: { source: input.source, valueEstimateCents: input.valueEstimateCents },
      source: "api",
    }),
  );

  return { workItem, referral };
}

export interface RecordContactAttemptInput {
  referralId: string;
  organisationId: string;
  actorUserId: string;
  method: string;
  outcome: string;
  notes: string | null;
  reachedClient: boolean;
  nextFollowUpDueAt?: Date | null;
  nextAction?: string | null;
}

/** Records one contact attempt and, when it results in real client contact, moves contact_status forward. */
export async function recordContactAttempt(
  workItemStore: WorkItemStore,
  referralStore: ReferralStore,
  audit: AuditSink,
  input: RecordContactAttemptInput,
): Promise<Referral> {
  const referral = await referralStore.getReferral(input.referralId, input.organisationId);
  if (!referral) throw new WorkflowError("referral not found");

  await referralStore.recordContactAttempt({
    organisationId: input.organisationId,
    referralId: referral.id,
    method: input.method,
    outcome: input.outcome,
    notes: input.notes,
    createdByUserId: input.actorUserId,
  });

  const nextContactStatus = input.reachedClient
    ? "contacted"
    : referral.contactStatus === "not_yet_contacted"
      ? "attempting"
      : referral.contactStatus;
  const updated = await referralStore.updateReferral(referral.id, input.organisationId, {
    contactStatus: nextContactStatus,
  });

  if (input.nextFollowUpDueAt !== undefined || input.nextAction !== undefined) {
    await rescheduleWorkItem(workItemStore, audit, {
      workItemId: referral.workItemId,
      organisationId: input.organisationId,
      actorUserId: input.actorUserId,
      ...(input.nextFollowUpDueAt !== undefined ? { dueAt: input.nextFollowUpDueAt } : {}),
      ...(input.nextAction !== undefined ? { nextAction: input.nextAction } : {}),
      reason: "follow-up scheduled after contact attempt",
    });
  }

  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.actorUserId,
      action: "referral_contact_attempt",
      entityType: "referral",
      entityId: referral.id,
      newState: { method: input.method, outcome: input.outcome, reachedClient: input.reachedClient },
      source: "api",
    }),
  );

  return updated;
}

export interface SetOutcomeInput {
  referralId: string;
  organisationId: string;
  actorUserId: string;
  outcome: ReferralOutcome;
  lostReason?: string | null;
}

/**
 * Sets the referral's final result (MODULE_REGISTER.md M01: "waiting/
 * booked/declined/not-suitable status", "lost-referral reason capture").
 * A lost outcome (declined/not_suitable) requires a reason — checked
 * here ahead of the database's own CHECK constraint, same defense-in-
 * depth pattern as Phase 7's close reason. Any outcome other than
 * "waiting" closes the underlying work item; "waiting" leaves it open
 * and still subject to the ordinary overdue/escalation rules.
 */
export async function setReferralOutcome(
  workItemStore: WorkItemStore,
  referralStore: ReferralStore,
  audit: AuditSink,
  input: SetOutcomeInput,
): Promise<{ referral: Referral; workItem: WorkItem | null }> {
  const referral = await referralStore.getReferral(input.referralId, input.organisationId);
  if (!referral) throw new WorkflowError("referral not found");

  const isLost = LOST_OUTCOMES.includes(input.outcome);
  if (isLost && !input.lostReason?.trim()) {
    throw new WorkflowError("a lost reason is required for a declined or not_suitable outcome");
  }

  const patch: ReferralPatch = { outcome: input.outcome };
  if (isLost) patch.lostReason = input.lostReason ?? null;
  const updatedReferral = await referralStore.updateReferral(referral.id, input.organisationId, patch);

  let workItem: WorkItem | null = null;
  if (input.outcome !== "waiting") {
    const reason = isLost ? `referral lost: ${input.lostReason}` : `referral outcome: ${input.outcome}`;
    workItem = await closeWorkItem(workItemStore, audit, {
      workItemId: referral.workItemId,
      organisationId: input.organisationId,
      actorUserId: input.actorUserId,
      reason,
    });
  }

  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.actorUserId,
      action: "referral_outcome_set",
      entityType: "referral",
      entityId: referral.id,
      priorState: { outcome: referral.outcome },
      newState: { outcome: input.outcome, lostReason: input.lostReason ?? null },
      source: "api",
    }),
  );

  return { referral: updatedReferral, workItem };
}

export interface ConversionStats {
  totalFinalized: number;
  booked: number;
  lost: number;
  waiting: number;
  undecided: number;
  conversionRate: number;
}

/** Conversion reporting (MODULE_REGISTER.md M01). Pure calculation over store-provided counts, so it is trivially testable. */
export function calculateConversionStats(counts: {
  waiting: number;
  booked: number;
  declined: number;
  not_suitable: number;
  undecided: number;
}): ConversionStats {
  const lost = counts.declined + counts.not_suitable;
  const totalFinalized = counts.booked + lost;
  const conversionRate = totalFinalized > 0 ? counts.booked / totalFinalized : 0;
  return {
    totalFinalized,
    booked: counts.booked,
    lost,
    waiting: counts.waiting,
    undecided: counts.undecided,
    conversionRate,
  };
}

export async function getConversionStats(referralStore: ReferralStore, organisationId: string): Promise<ConversionStats> {
  const counts = await referralStore.getOutcomeCounts(organisationId);
  return calculateConversionStats(counts);
}
