import type { AuditSink } from "@psych-savings/audit";
import { buildAuditEvent } from "@psych-savings/audit";
import type { HealthState } from "@psych-savings/shared-types";
import type { RecordEvidenceInput, WorkItemQueueFilters, WorkItemStore } from "./store";
import type { ActionEvidence, WorkItem, WorkloadEntry } from "./types";

/**
 * Standard contact-attempt outcomes (MODULE_REGISTER.md M02 "standard
 * status codes"). Not DB-enforced (action_evidence.evidence_type is
 * plain text, matching Phase 5's data-minimisation approach of not
 * over-constraining free-text fields) — this is the canonical list the
 * API/UI present, kept in one place so it doesn't drift.
 */
export const STANDARD_CONTACT_OUTCOMES = [
  "spoke_to_client",
  "left_message",
  "no_answer",
  "wrong_number",
  "client_called_back",
  "other",
] as const;
export type StandardContactOutcome = (typeof STANDARD_CONTACT_OUTCOMES)[number];

const HEALTH_SEVERITY: Record<HealthState, number> = { red: 0, recovery: 1, amber: 2, green: 3 };
const PRIORITY_WEIGHT: Record<WorkItem["priority"], number> = { urgent: 0, high: 1, normal: 2, low: 3 };

/**
 * The one authoritative order reception works a queue in
 * (CHRONOLOGICAL_BUILD_PLAN.md Phase 9 item 4: "Show due, overdue and
 * priority items"): most severe health state first, then soonest due
 * date, then priority. Pure and stable, so "no synthetic callback
 * disappears" is something a test can actually assert — nothing here
 * depends on when the query happened to run.
 */
export function sortQueue(items: readonly WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => {
    const severity = HEALTH_SEVERITY[a.healthState]! - HEALTH_SEVERITY[b.healthState]!;
    if (severity !== 0) return severity;

    const aDue = a.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bDue = b.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;

    return PRIORITY_WEIGHT[a.priority]! - PRIORITY_WEIGHT[b.priority]!;
  });
}

/** The reception/callback queue: open items, optionally scoped to a domain/owner/centre, in queue order. */
export async function getQueue(
  store: WorkItemStore,
  organisationId: string,
  filters: WorkItemQueueFilters = {},
): Promise<WorkItem[]> {
  const items = await store.listWorkItems(organisationId, { ...filters, status: "open" });
  return sortQueue(items);
}

export interface RecordContactAttemptInput {
  workItemId: string;
  organisationId: string;
  actorUserId: string;
  outcome: StandardContactOutcome | (string & {});
  notes: string | null;
}

/** Contact-attempt history (MODULE_REGISTER.md M02), stored as action_evidence rather than a bespoke table. */
export async function recordContactAttempt(
  store: WorkItemStore,
  audit: AuditSink,
  input: RecordContactAttemptInput,
): Promise<ActionEvidence> {
  const evidenceInput: RecordEvidenceInput = {
    organisationId: input.organisationId,
    workItemId: input.workItemId,
    evidenceType: "contact_attempt",
    reference: input.outcome,
    note: input.notes,
    createdByUserId: input.actorUserId,
  };
  const evidence = await store.recordEvidence(evidenceInput);
  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.actorUserId,
      action: "contact_attempt_recorded",
      entityType: "work_item",
      entityId: input.workItemId,
      newState: { outcome: input.outcome },
      source: "api",
    }),
  );
  return evidence;
}

export async function getContactAttemptHistory(
  store: WorkItemStore,
  workItemId: string,
  organisationId: string,
): Promise<ActionEvidence[]> {
  const all = await store.listEvidence(workItemId, organisationId);
  return all.filter((e) => e.evidenceType === "contact_attempt");
}

/** Team-level workload visibility (MODULE_REGISTER.md M02) — counts only, never item content. */
export async function getTeamWorkload(
  store: WorkItemStore,
  organisationId: string,
  centreId: string | null = null,
): Promise<WorkloadEntry[]> {
  return store.getWorkloadSummary(organisationId, centreId);
}
