import type { AuditSink } from "@psych-savings/audit";
import { buildAuditEvent } from "@psych-savings/audit";
import {
  createBaseline,
  implementSavingsCase,
  openSavingsCase,
  SavingsError,
  type SavingsCase,
  type SavingsStore,
} from "@psych-savings/savings-engine";
import type { Recurrence, RootCauseCategory, WasteCategory } from "@psych-savings/shared-types";
import {
  closeWorkItem,
  createWorkItem,
  WorkflowError,
  type WorkItem,
  type WorkItemStore,
} from "@psych-savings/workflow-engine";
import type { WasteStore } from "./store";
import type { ProcessIntervention, WasteEvent } from "./types";

export { WorkflowError, SavingsError };

/** The work-item domain an intervention occupies, so the Phase 9 queue view can filter on it. */
export const INTERVENTION_DOMAIN = "waste_intervention";

/** Source entity type used on savings cases raised from an intervention. */
export const INTERVENTION_SOURCE_TYPE = "process_intervention";
/** Source entity type used on a savings case raised from a single unattached waste event. */
export const WASTE_EVENT_SOURCE_TYPE = "waste_event";

export interface CaptureWasteEventInput {
  organisationId: string;
  centreId: string | null;
  reportedByUserId: string;
  category: WasteCategory;
  staffRole: string;
  description: string;
  estimatedMinutes: number;
  recurrence: Recurrence;
  occurredAt?: Date;
}

/**
 * Quick capture (CHRONOLOGICAL_BUILD_PLAN.md Phase 12 item 1). Everything
 * that is not needed to identify the waste — root cause, owner, an
 * intervention, a savings claim — is deliberately absent here and added
 * later. If logging waste costs more than the waste, nobody logs it.
 */
export async function captureWasteEvent(
  store: WasteStore,
  audit: AuditSink,
  input: CaptureWasteEventInput,
  now: Date = new Date(),
): Promise<WasteEvent> {
  if (!input.description.trim()) throw new WorkflowError("a waste event needs a description");
  if (!Number.isInteger(input.estimatedMinutes) || input.estimatedMinutes <= 0) {
    throw new WorkflowError("estimatedMinutes must be a positive whole number of minutes");
  }

  const event = await store.createWasteEvent({
    organisationId: input.organisationId,
    centreId: input.centreId,
    reportedByUserId: input.reportedByUserId,
    category: input.category,
    staffRole: input.staffRole,
    description: input.description,
    estimatedMinutes: input.estimatedMinutes,
    recurrence: input.recurrence,
    occurredAt: input.occurredAt ?? now,
  });

  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.reportedByUserId,
      action: "waste_event_captured",
      entityType: "waste_event",
      entityId: event.id,
      newState: {
        category: event.category,
        estimatedMinutes: event.estimatedMinutes,
        recurrence: event.recurrence,
        staffRole: event.staffRole,
      },
      source: "api",
    }),
  );
  return event;
}

export interface ReviewWasteEventInput {
  wasteEventId: string;
  organisationId: string;
  actorUserId: string;
  rootCauseCategory: RootCauseCategory;
  rootCauseNote: string | null;
}

/**
 * Root-cause review (Phase 12 item 4). Separate from capture on purpose:
 * the person who notices the waste is rarely the person who can say what
 * is causing it, and an event with a guessed cause is worse than one
 * with no cause, because the intervention gets aimed at the wrong thing.
 */
export async function reviewWasteEvent(
  store: WasteStore,
  audit: AuditSink,
  input: ReviewWasteEventInput,
  now: Date = new Date(),
): Promise<WasteEvent> {
  const existing = await store.getWasteEvent(input.wasteEventId, input.organisationId);
  if (!existing) throw new WorkflowError("waste event not found");

  const reviewed = await store.updateWasteEvent(input.wasteEventId, input.organisationId, {
    rootCauseCategory: input.rootCauseCategory,
    rootCauseNote: input.rootCauseNote,
    reviewedAt: now,
    reviewedByUserId: input.actorUserId,
  });

  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.actorUserId,
      action: "waste_event_reviewed",
      entityType: "waste_event",
      entityId: reviewed.id,
      priorState: { rootCauseCategory: existing.rootCauseCategory },
      newState: { rootCauseCategory: reviewed.rootCauseCategory },
      reason: input.rootCauseNote,
      source: "api",
    }),
  );
  return reviewed;
}

export interface OpenInterventionInput {
  organisationId: string;
  centreId: string | null;
  ownerUserId: string;
  title: string;
  description: string | null;
  rootCauseCategory: RootCauseCategory;
  dueAt: Date;
  nextAction: string;
  /** Reviewed waste events this intervention is meant to stop. */
  wasteEventIds: readonly string[];
}

/**
 * Intervention workflow (Phase 12 item 5). The intervention IS a work
 * item, so it inherits ownership, the deadline, escalation and
 * close-with-reason from the Phase 7 engine rather than reimplementing
 * any of it.
 *
 * Only reviewed events can be attached: an intervention aimed at events
 * nobody has diagnosed has no defensible "before" figure to be measured
 * against later.
 */
export async function openIntervention(
  workItemStore: WorkItemStore,
  wasteStore: WasteStore,
  audit: AuditSink,
  input: OpenInterventionInput,
): Promise<{ intervention: ProcessIntervention; workItem: WorkItem; attached: WasteEvent[] }> {
  if (input.wasteEventIds.length === 0) {
    throw new WorkflowError("an intervention must address at least one waste event");
  }

  const events: WasteEvent[] = [];
  for (const id of input.wasteEventIds) {
    const event = await wasteStore.getWasteEvent(id, input.organisationId);
    if (!event) throw new WorkflowError(`waste event ${id} not found`);
    if (event.reviewedAt === null) throw new WorkflowError(`waste event ${id} has not had a root-cause review`);
    if (event.interventionId !== null) {
      throw new WorkflowError(`waste event ${id} is already attached to an intervention`);
    }
    events.push(event);
  }

  const workItem = await createWorkItem(workItemStore, audit, {
    organisationId: input.organisationId,
    centreId: input.centreId,
    domain: INTERVENTION_DOMAIN,
    title: input.title,
    ownerUserId: input.ownerUserId,
    priority: "normal",
    dueAt: input.dueAt,
    nextAction: input.nextAction,
  });

  const intervention = await wasteStore.createIntervention({
    organisationId: input.organisationId,
    workItemId: workItem.id,
    title: input.title,
    description: input.description,
    rootCauseCategory: input.rootCauseCategory,
  });

  const attached: WasteEvent[] = [];
  for (const event of events) {
    attached.push(
      await wasteStore.updateWasteEvent(event.id, input.organisationId, { interventionId: intervention.id }),
    );
  }

  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.ownerUserId,
      action: "intervention_opened",
      entityType: "process_intervention",
      entityId: intervention.id,
      newState: {
        rootCauseCategory: intervention.rootCauseCategory,
        wasteEventCount: attached.length,
        workItemId: workItem.id,
      },
      source: "api",
    }),
  );

  return { intervention, workItem, attached };
}

export interface BaselineSuggestion {
  eventCount: number;
  totalEstimatedMinutes: number;
  /** Mean estimated minutes per occurrence across the attached events. */
  meanEstimatedMinutes: number;
  /** The recurrence recorded most often across the attached events. */
  mostCommonRecurrence: Recurrence;
}

/**
 * Summarises the attached events to help someone set a baseline — it is
 * explicitly NOT a baseline. These are the reporters' own estimates, near
 * the bottom of the contract's evidence hierarchy; a baseline that goes
 * on to back a verified saving needs a measured figure and a stated
 * method. Offering the estimate and requiring the measurement is the
 * whole point of keeping these two steps apart.
 */
export async function suggestBaselineFromIntervention(
  wasteStore: WasteStore,
  organisationId: string,
  interventionId: string,
): Promise<BaselineSuggestion> {
  const events = await wasteStore.listWasteEvents(organisationId, { interventionId });
  if (events.length === 0) throw new WorkflowError("intervention has no attached waste events");

  const totalEstimatedMinutes = events.reduce((sum, e) => sum + e.estimatedMinutes, 0);
  const counts = new Map<Recurrence, number>();
  for (const e of events) counts.set(e.recurrence, (counts.get(e.recurrence) ?? 0) + 1);
  const mostCommonRecurrence = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];

  return {
    eventCount: events.length,
    totalEstimatedMinutes,
    meanEstimatedMinutes: Math.round(totalEstimatedMinutes / events.length),
    mostCommonRecurrence,
  };
}

export interface OpenWasteSavingsCaseInput {
  organisationId: string;
  interventionId: string;
  actorUserId: string;
  title: string;
  /** The measured before-state, in minutes per occurrence. Not the reporters' estimate. */
  baselineMinutes: number;
  recurrence: Recurrence;
  /** How the baseline figure was actually measured. */
  method: string;
  measuredFrom: Date;
  measuredTo: Date;
  sourceReference: string | null;
}

/**
 * Raises the Category D savings case for an intervention.
 *
 * The case is sourced at the INTERVENTION, not at the individual waste
 * events, and any attached event that already backs its own open case
 * blocks it. Without that check, the same wasted minutes could be
 * claimed once per event and again for the intervention that fixed them
 * — exactly the re-count anti-double-counting rule 1 exists to stop.
 */
export async function openWasteSavingsCase(
  wasteStore: WasteStore,
  savingsStore: SavingsStore,
  audit: AuditSink,
  input: OpenWasteSavingsCaseInput,
): Promise<SavingsCase> {
  const intervention = await wasteStore.getIntervention(input.interventionId, input.organisationId);
  if (!intervention) throw new WorkflowError("intervention not found");

  const events = await wasteStore.listWasteEvents(input.organisationId, { interventionId: input.interventionId });
  if (events.length === 0) throw new WorkflowError("intervention has no attached waste events");

  for (const event of events) {
    const existing = await savingsStore.listCases(input.organisationId, {
      sourceEntityType: WASTE_EVENT_SOURCE_TYPE,
      sourceEntityId: event.id,
      category: "released_staff_time",
    });
    if (existing.length > 0) {
      throw new SavingsError(
        `waste event ${event.id} already backs its own open released_staff_time case; close it before claiming the same minutes here`,
      );
    }
  }

  const baseline = await createBaseline(savingsStore, audit, {
    organisationId: input.organisationId,
    category: "released_staff_time",
    method: input.method,
    baselineMinutes: input.baselineMinutes,
    baselineAmountCents: null,
    recurrence: input.recurrence,
    measuredFrom: input.measuredFrom,
    measuredTo: input.measuredTo,
    sourceReference: input.sourceReference,
    createdByUserId: input.actorUserId,
  });

  return openSavingsCase(savingsStore, audit, {
    organisationId: input.organisationId,
    title: input.title,
    baselineId: baseline.id,
    interventionId: intervention.id,
    sourceEntityType: INTERVENTION_SOURCE_TYPE,
    sourceEntityId: intervention.id,
    actorUserId: input.actorUserId,
  });
}

export interface ImplementInterventionInput {
  interventionId: string;
  organisationId: string;
  actorUserId: string;
  reason: string;
}

/**
 * Carrying the change out. Marking the intervention implemented and
 * moving its savings case to Implemented are the same real-world event,
 * so they happen together — otherwise the ledger drifts from what
 * actually happened on the floor.
 *
 * An intervention with no savings case can still be implemented: the
 * practice is allowed to fix something without claiming money for it.
 * But an intervention whose case exists and was never approved cannot,
 * because that is the approval gate the contract puts before the work.
 */
export async function implementIntervention(
  workItemStore: WorkItemStore,
  wasteStore: WasteStore,
  savingsStore: SavingsStore,
  audit: AuditSink,
  input: ImplementInterventionInput,
  now: Date = new Date(),
): Promise<{ intervention: ProcessIntervention; workItem: WorkItem; savingsCases: SavingsCase[] }> {
  if (!input.reason.trim()) throw new WorkflowError("implementing an intervention requires a reason");

  const intervention = await wasteStore.getIntervention(input.interventionId, input.organisationId);
  if (!intervention) throw new WorkflowError("intervention not found");
  if (intervention.implementedAt !== null) throw new WorkflowError("intervention is already implemented");

  const openCases = await savingsStore.listCases(input.organisationId, {
    sourceEntityType: INTERVENTION_SOURCE_TYPE,
    sourceEntityId: intervention.id,
  });
  const notApproved = openCases.filter((c) => c.state !== "approved");
  if (notApproved.length > 0) {
    throw new SavingsError("the savings case for this intervention has not been approved");
  }

  const updated = await wasteStore.updateIntervention(intervention.id, input.organisationId, {
    implementedAt: now,
    implementedByUserId: input.actorUserId,
  });

  const workItem = await closeWorkItem(workItemStore, audit, {
    workItemId: intervention.workItemId,
    organisationId: input.organisationId,
    actorUserId: input.actorUserId,
    reason: input.reason,
  });

  const savingsCases: SavingsCase[] = [];
  for (const openCase of openCases) {
    savingsCases.push(
      await implementSavingsCase(
        savingsStore,
        audit,
        {
          savingsCaseId: openCase.id,
          organisationId: input.organisationId,
          actorUserId: input.actorUserId,
          reason: input.reason,
        },
        now,
      ),
    );
  }

  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.actorUserId,
      action: "intervention_implemented",
      entityType: "process_intervention",
      entityId: intervention.id,
      newState: { savingsCaseCount: savingsCases.length },
      reason: input.reason,
      source: "api",
    }),
  );

  return { intervention: updated, workItem, savingsCases };
}

/** MODULE_REGISTER.md M05 reporting, and the raw input Phase 15 ranks systemic patterns from. */
export async function getWasteTotalsByCategory(wasteStore: WasteStore, organisationId: string) {
  const totals = await wasteStore.getWasteTotalsByCategory(organisationId);
  return [...totals].sort((a, b) => b.annualisedMinutes - a.annualisedMinutes);
}
