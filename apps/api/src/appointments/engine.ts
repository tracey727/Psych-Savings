import type { AuditSink } from "@psych-savings/audit";
import { buildAuditEvent } from "@psych-savings/audit";
import { closeWorkItem, createWorkItem, WorkflowError, type WorkItem, type WorkItemStore } from "@psych-savings/workflow-engine";
import type { AppointmentVacancyStore, VacancyPatch } from "./store";
import type { AppointmentVacancy, RefillOutcome } from "./types";

export { WorkflowError };

const OUTREACH_EVIDENCE_TYPE = "outreach_attempt";

export interface CaptureVacancyInput {
  organisationId: string;
  centreId: string | null;
  ownerUserId: string;
  cancellationReason: string;
  originalValueCents: number | null;
  slotTime: Date | null;
  refillWindowDueAt: Date;
  title?: string;
}

/**
 * Captures a cancellation/no-show and opens its refill window in one
 * operation (MODULE_REGISTER.md M03: "cancellation capture", "vacancy
 * window"). The vacancy IS a work item (domain = 'appointment_vacancy')
 * — ownership, the refill deadline and escalation are the Phase 7
 * engine, reused rather than duplicated.
 */
export async function captureVacancy(
  workItemStore: WorkItemStore,
  vacancyStore: AppointmentVacancyStore,
  audit: AuditSink,
  input: CaptureVacancyInput,
): Promise<{ workItem: WorkItem; vacancy: AppointmentVacancy }> {
  const workItem = await createWorkItem(workItemStore, audit, {
    organisationId: input.organisationId,
    centreId: input.centreId,
    domain: "appointment_vacancy",
    title: input.title ?? `Vacancy — ${input.cancellationReason}`,
    ownerUserId: input.ownerUserId,
    priority: "normal",
    dueAt: input.refillWindowDueAt,
    nextAction: "Contact waitlist candidates",
  });

  const vacancy = await vacancyStore.createVacancy({
    organisationId: input.organisationId,
    workItemId: workItem.id,
    cancellationReason: input.cancellationReason,
    originalValueCents: input.originalValueCents,
    slotTime: input.slotTime,
  });

  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.ownerUserId,
      action: "vacancy_captured",
      entityType: "appointment_vacancy",
      entityId: vacancy.id,
      newState: { cancellationReason: input.cancellationReason, originalValueCents: input.originalValueCents },
      source: "api",
    }),
  );

  return { workItem, vacancy };
}

export interface RecordOutreachAttemptInput {
  workItemId: string;
  organisationId: string;
  actorUserId: string;
  outcome: string;
  notes: string | null;
}

/** Outreach attempts (MODULE_REGISTER.md M03) — same action_evidence mechanism Phase 9 used, a different evidence_type. */
export async function recordOutreachAttempt(
  workItemStore: WorkItemStore,
  audit: AuditSink,
  input: RecordOutreachAttemptInput,
) {
  const evidence = await workItemStore.recordEvidence({
    organisationId: input.organisationId,
    workItemId: input.workItemId,
    evidenceType: OUTREACH_EVIDENCE_TYPE,
    reference: input.outcome,
    note: input.notes,
    createdByUserId: input.actorUserId,
  });
  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.actorUserId,
      action: "outreach_attempt_recorded",
      entityType: "work_item",
      entityId: input.workItemId,
      newState: { outcome: input.outcome },
      source: "api",
    }),
  );
  return evidence;
}

export async function getOutreachHistory(workItemStore: WorkItemStore, workItemId: string, organisationId: string) {
  const all = await workItemStore.listEvidence(workItemId, organisationId);
  return all.filter((e) => e.evidenceType === OUTREACH_EVIDENCE_TYPE);
}

export interface SetRefillOutcomeInput {
  vacancyId: string;
  workItemId: string;
  organisationId: string;
  actorUserId: string;
  outcome: RefillOutcome;
  recoveredValueCents?: number;
}

/**
 * Sets the refill result (MODULE_REGISTER.md M03: "refill result",
 * "recovered appointment value"). Recovered value is only ever the
 * verified replacement value actually achieved
 * (docs/product/SAVINGS_MEASUREMENT_CONTRACT.md Category A) — never
 * counted merely because a candidate was contacted, so "refilled"
 * requires a positive recovered value, checked here ahead of the
 * database's own CHECK constraint (same defense-in-depth pattern used
 * throughout this codebase). Either outcome closes the underlying work
 * item — the vacancy window is over either way.
 */
export async function setRefillOutcome(
  workItemStore: WorkItemStore,
  vacancyStore: AppointmentVacancyStore,
  audit: AuditSink,
  input: SetRefillOutcomeInput,
): Promise<{ vacancy: AppointmentVacancy; workItem: WorkItem }> {
  if (input.outcome === "refilled" && !(input.recoveredValueCents && input.recoveredValueCents > 0)) {
    throw new WorkflowError("a positive recoveredValueCents is required when outcome is refilled");
  }

  const patch: VacancyPatch = { refillOutcome: input.outcome };
  if (input.outcome === "refilled") patch.recoveredValueCents = input.recoveredValueCents ?? null;
  const vacancy = await vacancyStore.updateVacancy(input.vacancyId, input.organisationId, patch);

  const reason =
    input.outcome === "refilled"
      ? `appointment refilled — recovered value ${(input.recoveredValueCents! / 100).toFixed(2)}`
      : "vacancy window closed, not refilled";
  const workItem = await closeWorkItem(workItemStore, audit, {
    workItemId: input.workItemId,
    organisationId: input.organisationId,
    actorUserId: input.actorUserId,
    reason,
  });

  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.actorUserId,
      action: "refill_outcome_set",
      entityType: "appointment_vacancy",
      entityId: vacancy.id,
      newState: { outcome: input.outcome, recoveredValueCents: input.recoveredValueCents ?? null },
      source: "api",
    }),
  );

  return { vacancy, workItem };
}

export async function getLeakagePatternReport(vacancyStore: AppointmentVacancyStore, organisationId: string) {
  const counts = await vacancyStore.getLeakagePatternCounts(organisationId);
  return [...counts].sort((a, b) => b.count - a.count);
}

export async function getVacancySummary(vacancyStore: AppointmentVacancyStore, organisationId: string) {
  return vacancyStore.getVacancySummary(organisationId);
}
