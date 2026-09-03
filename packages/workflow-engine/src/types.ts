import type { HealthState } from "@psych-savings/shared-types";

export type Priority = "low" | "normal" | "high" | "urgent";
export type WorkItemStatus = "open" | "closed";

export interface WorkItem {
  id: string;
  organisationId: string;
  centreId: string | null;
  domain: string;
  title: string;
  currentOwnerUserId: string;
  priority: Priority;
  dueAt: Date | null;
  nextAction: string | null;
  healthState: HealthState;
  status: WorkItemStatus;
  closeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
}

export interface Transfer {
  id: string;
  organisationId: string;
  workItemId: string;
  fromUserId: string | null;
  toUserId: string;
  requestedAt: Date;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  reason: string | null;
}

export interface Escalation {
  id: string;
  organisationId: string;
  workItemId: string;
  escalatedAt: Date;
  escalatedToUserId: string | null;
  reason: string;
  resolvedAt: Date | null;
}
