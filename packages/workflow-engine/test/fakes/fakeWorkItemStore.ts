import type {
  CreateEscalationInput,
  CreateTransferInput,
  CreateWorkItemInput,
  StatusHistoryInput,
  WorkItemPatch,
  WorkItemStore,
} from "../../src/store";
import type { Escalation, Transfer, WorkItem } from "../../src/types";

export class FakeWorkItemStore implements WorkItemStore {
  workItems = new Map<string, WorkItem>();
  transfers = new Map<string, Transfer>();
  escalations = new Map<string, Escalation>();
  ownerHistory: { workItemId: string; userId: string; assignedAt: Date; unassignedAt: Date | null }[] = [];
  statusHistory: StatusHistoryInput[] = [];
  private counter = 0;
  private nextId() {
    return `id-${++this.counter}`;
  }

  async createWorkItem(input: CreateWorkItemInput): Promise<WorkItem> {
    const now = new Date();
    const item: WorkItem = {
      id: this.nextId(),
      organisationId: input.organisationId,
      centreId: input.centreId,
      domain: input.domain,
      title: input.title,
      currentOwnerUserId: input.ownerUserId,
      priority: input.priority,
      dueAt: input.dueAt,
      nextAction: input.nextAction,
      healthState: "green",
      status: "open",
      closeReason: null,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    };
    this.workItems.set(item.id, item);
    return item;
  }

  async getWorkItem(id: string, organisationId: string): Promise<WorkItem | null> {
    const item = this.workItems.get(id);
    return item && item.organisationId === organisationId ? item : null;
  }

  async updateWorkItem(id: string, organisationId: string, patch: WorkItemPatch): Promise<WorkItem> {
    const item = await this.getWorkItem(id, organisationId);
    if (!item) throw new Error("not found");
    Object.assign(item, patch, { updatedAt: new Date() });
    return item;
  }

  async recordOwnerAssigned(workItemId: string, _organisationId: string, userId: string, assignedAt: Date): Promise<void> {
    this.ownerHistory.push({ workItemId, userId, assignedAt, unassignedAt: null });
  }

  async recordOwnerUnassigned(workItemId: string, _organisationId: string, userId: string, unassignedAt: Date): Promise<void> {
    const entry = [...this.ownerHistory].reverse().find((h) => h.workItemId === workItemId && h.userId === userId && h.unassignedAt === null);
    if (entry) entry.unassignedAt = unassignedAt;
  }

  async createTransfer(input: CreateTransferInput): Promise<Transfer> {
    const transfer: Transfer = {
      id: this.nextId(),
      organisationId: input.organisationId,
      workItemId: input.workItemId,
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      requestedAt: new Date(),
      acceptedAt: null,
      rejectedAt: null,
      reason: input.reason,
    };
    this.transfers.set(transfer.id, transfer);
    return transfer;
  }

  async getTransfer(id: string, organisationId: string): Promise<Transfer | null> {
    const t = this.transfers.get(id);
    return t && t.organisationId === organisationId ? t : null;
  }

  async markTransferAccepted(id: string, _organisationId: string, acceptedAt: Date): Promise<void> {
    const t = this.transfers.get(id);
    if (t) t.acceptedAt = acceptedAt;
  }

  async markTransferRejected(id: string, _organisationId: string, rejectedAt: Date): Promise<void> {
    const t = this.transfers.get(id);
    if (t) t.rejectedAt = rejectedAt;
  }

  async createEscalation(input: CreateEscalationInput): Promise<Escalation> {
    const escalation: Escalation = {
      id: this.nextId(),
      organisationId: input.organisationId,
      workItemId: input.workItemId,
      escalatedAt: new Date(),
      escalatedToUserId: input.escalatedToUserId,
      reason: input.reason,
      resolvedAt: null,
    };
    this.escalations.set(escalation.id, escalation);
    return escalation;
  }

  async getOpenEscalationCount(workItemId: string, organisationId: string): Promise<number> {
    return [...this.escalations.values()].filter(
      (e) => e.workItemId === workItemId && e.organisationId === organisationId && e.resolvedAt === null,
    ).length;
  }

  async resolveEscalation(id: string, _organisationId: string, resolvedAt: Date): Promise<void> {
    const e = this.escalations.get(id);
    if (e) e.resolvedAt = resolvedAt;
  }

  async recordStatusHistory(input: StatusHistoryInput): Promise<void> {
    this.statusHistory.push(input);
  }
}
