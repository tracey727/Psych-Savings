import type { HealthState } from "@psych-savings/shared-types";
import type { ActionEvidence, Escalation, Priority, Transfer, WorkItem, WorkItemStatus, WorkloadEntry } from "./types";

export interface CreateWorkItemInput {
  organisationId: string;
  centreId: string | null;
  domain: string;
  title: string;
  ownerUserId: string;
  priority: Priority;
  dueAt: Date | null;
  nextAction: string | null;
}

export interface WorkItemPatch {
  currentOwnerUserId?: string;
  priority?: Priority;
  dueAt?: Date | null;
  nextAction?: string | null;
  healthState?: HealthState;
  status?: WorkItemStatus;
  closeReason?: string | null;
  closedAt?: Date | null;
}

export interface CreateTransferInput {
  organisationId: string;
  workItemId: string;
  fromUserId: string | null;
  toUserId: string;
  reason: string | null;
}

export interface CreateEscalationInput {
  organisationId: string;
  workItemId: string;
  escalatedToUserId: string | null;
  reason: string;
}

export interface StatusHistoryInput {
  organisationId: string;
  workItemId: string;
  changedByUserId: string | null;
  fromHealthState: HealthState | null;
  toHealthState: HealthState | null;
  fromStatus: WorkItemStatus | null;
  toStatus: WorkItemStatus | null;
  reason: string | null;
}

export interface WorkItemQueueFilters {
  domain?: string;
  status?: WorkItemStatus;
  ownerUserId?: string;
  centreId?: string;
}

export interface RecordEvidenceInput {
  organisationId: string;
  workItemId: string;
  evidenceType: string;
  reference: string | null;
  note: string | null;
  createdByUserId: string | null;
}

/**
 * Everything the work-ownership engine needs from the database, as an
 * interface — same pattern as apps/api/src/auth/store.ts. The engine
 * logic in engine.ts is unit-tested against an in-memory fake
 * (test/fakes/fakeWorkItemStore.ts); a real Neon-backed implementation
 * lives in apps/api and reuses the RLS/transaction pattern proven live
 * in Phase 5-6.
 */
export interface WorkItemStore {
  createWorkItem(input: CreateWorkItemInput): Promise<WorkItem>;
  getWorkItem(id: string, organisationId: string): Promise<WorkItem | null>;
  updateWorkItem(id: string, organisationId: string, patch: WorkItemPatch): Promise<WorkItem>;

  recordOwnerAssigned(workItemId: string, organisationId: string, userId: string, assignedAt: Date): Promise<void>;
  recordOwnerUnassigned(workItemId: string, organisationId: string, userId: string, unassignedAt: Date): Promise<void>;

  createTransfer(input: CreateTransferInput): Promise<Transfer>;
  getTransfer(id: string, organisationId: string): Promise<Transfer | null>;
  markTransferAccepted(id: string, organisationId: string, acceptedAt: Date): Promise<void>;
  markTransferRejected(id: string, organisationId: string, rejectedAt: Date): Promise<void>;

  createEscalation(input: CreateEscalationInput): Promise<Escalation>;
  getOpenEscalationCount(workItemId: string, organisationId: string): Promise<number>;
  resolveEscalation(id: string, organisationId: string, resolvedAt: Date): Promise<void>;

  recordStatusHistory(input: StatusHistoryInput): Promise<void>;

  /** Phase 9: the reception/callback queue is a filtered, sorted view over this — not a separate table. */
  listWorkItems(organisationId: string, filters: WorkItemQueueFilters): Promise<WorkItem[]>;
  recordEvidence(input: RecordEvidenceInput): Promise<ActionEvidence>;
  listEvidence(workItemId: string, organisationId: string): Promise<ActionEvidence[]>;
  /** Aggregate counts only — no titles or details — per MODULE_REGISTER.md M02 "without exposing unnecessary sensitive content". */
  getWorkloadSummary(organisationId: string, centreId: string | null): Promise<WorkloadEntry[]>;
}
