import { InMemoryAuditSink } from "@psych-savings/audit";
import { beforeEach, describe, expect, it } from "vitest";
import {
  acceptTransfer,
  beginRecovery,
  closeWorkItem,
  createWorkItem,
  escalate,
  rejectTransfer,
  reopenWorkItem,
  requestTransfer,
  rescheduleWorkItem,
  resolveEscalation,
  WorkflowError,
} from "../src/engine";
import { FakeWorkItemStore } from "./fakes/fakeWorkItemStore";

const ORG = "org-1";
const OWNER = "user-owner";
const RECIPIENT = "user-recipient";

describe("createWorkItem — ownership is mandatory", () => {
  let store: FakeWorkItemStore;
  let audit: InMemoryAuditSink;

  beforeEach(() => {
    store = new FakeWorkItemStore();
    audit = new InMemoryAuditSink();
  });

  it("creates an item with a current owner and a green health state by default", async () => {
    const item = await createWorkItem(store, audit, {
      organisationId: ORG,
      centreId: null,
      domain: "referral",
      title: "Test referral",
      ownerUserId: OWNER,
      priority: "normal",
      dueAt: null,
      nextAction: "call back",
    });
    expect(item.currentOwnerUserId).toBe(OWNER);
    expect(item.healthState).toBe("green");
    expect(item.status).toBe("open");
    expect(audit.events.map((e) => e.action)).toContain("work_item_created");
  });

  it("records an owner-assignment history row on creation", async () => {
    const item = await createWorkItem(store, audit, {
      organisationId: ORG,
      centreId: null,
      domain: "referral",
      title: "Test referral",
      ownerUserId: OWNER,
      priority: "normal",
      dueAt: null,
      nextAction: null,
    });
    expect(store.ownerHistory).toEqual([
      expect.objectContaining({ workItemId: item.id, userId: OWNER, unassignedAt: null }),
    ]);
  });

  it("an item created with a near-future due date is immediately amber, not green", async () => {
    const dueSoon = new Date(Date.now() + 60_000);
    const item = await createWorkItem(store, audit, {
      organisationId: ORG,
      centreId: null,
      domain: "referral",
      title: "Urgent",
      ownerUserId: OWNER,
      priority: "high",
      dueAt: dueSoon,
      nextAction: null,
    });
    expect(item.healthState).toBe("amber");
  });
});

describe("transfer flow — ownership never silently disappears", () => {
  let store: FakeWorkItemStore;
  let audit: InMemoryAuditSink;
  let workItemId: string;

  beforeEach(async () => {
    store = new FakeWorkItemStore();
    audit = new InMemoryAuditSink();
    const item = await createWorkItem(store, audit, {
      organisationId: ORG,
      centreId: null,
      domain: "referral",
      title: "Test referral",
      ownerUserId: OWNER,
      priority: "normal",
      dueAt: null,
      nextAction: null,
    });
    workItemId = item.id;
  });

  it("a requested-but-not-yet-accepted transfer leaves ownership unchanged", async () => {
    await requestTransfer(store, audit, {
      workItemId,
      organisationId: ORG,
      requestedByUserId: OWNER,
      toUserId: RECIPIENT,
      reason: "going on leave",
    });
    const item = await store.getWorkItem(workItemId, ORG);
    expect(item?.currentOwnerUserId).toBe(OWNER);
  });

  it("only the current owner may request a transfer", async () => {
    await expect(
      requestTransfer(store, audit, {
        workItemId,
        organisationId: ORG,
        requestedByUserId: RECIPIENT, // not the owner
        toUserId: "someone-else",
        reason: null,
      }),
    ).rejects.toThrow(WorkflowError);
  });

  it("accepting a transfer moves ownership to the recipient", async () => {
    const transfer = await requestTransfer(store, audit, {
      workItemId,
      organisationId: ORG,
      requestedByUserId: OWNER,
      toUserId: RECIPIENT,
      reason: "going on leave",
    });
    const updated = await acceptTransfer(store, audit, {
      transferId: transfer.id,
      organisationId: ORG,
      acceptingUserId: RECIPIENT,
    });
    expect(updated.currentOwnerUserId).toBe(RECIPIENT);
    expect(audit.events.map((e) => e.action)).toContain("transfer_accepted");
  });

  it("only the intended recipient may accept a transfer", async () => {
    const transfer = await requestTransfer(store, audit, {
      workItemId,
      organisationId: ORG,
      requestedByUserId: OWNER,
      toUserId: RECIPIENT,
      reason: null,
    });
    await expect(
      acceptTransfer(store, audit, { transferId: transfer.id, organisationId: ORG, acceptingUserId: "some-imposter" }),
    ).rejects.toThrow(WorkflowError);
    const item = await store.getWorkItem(workItemId, ORG);
    expect(item?.currentOwnerUserId).toBe(OWNER); // unchanged
  });

  it("a rejected transfer leaves the original owner exactly where they were", async () => {
    const transfer = await requestTransfer(store, audit, {
      workItemId,
      organisationId: ORG,
      requestedByUserId: OWNER,
      toUserId: RECIPIENT,
      reason: null,
    });
    await rejectTransfer(store, audit, {
      transferId: transfer.id,
      organisationId: ORG,
      rejectingUserId: RECIPIENT,
      reason: "too busy",
    });
    const item = await store.getWorkItem(workItemId, ORG);
    expect(item?.currentOwnerUserId).toBe(OWNER);
    expect(audit.events.map((e) => e.action)).toContain("transfer_rejected");
  });

  it("a transfer cannot be accepted twice", async () => {
    const transfer = await requestTransfer(store, audit, {
      workItemId,
      organisationId: ORG,
      requestedByUserId: OWNER,
      toUserId: RECIPIENT,
      reason: null,
    });
    await acceptTransfer(store, audit, { transferId: transfer.id, organisationId: ORG, acceptingUserId: RECIPIENT });
    await expect(
      acceptTransfer(store, audit, { transferId: transfer.id, organisationId: ORG, acceptingUserId: RECIPIENT }),
    ).rejects.toThrow(WorkflowError);
  });
});

describe("escalation and recovery", () => {
  let store: FakeWorkItemStore;
  let audit: InMemoryAuditSink;
  let workItemId: string;

  beforeEach(async () => {
    store = new FakeWorkItemStore();
    audit = new InMemoryAuditSink();
    const item = await createWorkItem(store, audit, {
      organisationId: ORG,
      centreId: null,
      domain: "referral",
      title: "Test referral",
      ownerUserId: OWNER,
      priority: "normal",
      dueAt: null,
      nextAction: null,
    });
    workItemId = item.id;
  });

  it("escalating a green item turns it red", async () => {
    const { workItem } = await escalate(store, audit, {
      workItemId,
      organisationId: ORG,
      escalatedToUserId: "manager-1",
      reason: "no contact after 3 attempts",
      actorUserId: OWNER,
    });
    expect(workItem.healthState).toBe("red");
    expect(audit.events.map((e) => e.action)).toContain("escalated");
  });

  it("resolving the only open escalation returns the item to green", async () => {
    const { escalation } = await escalate(store, audit, {
      workItemId,
      organisationId: ORG,
      escalatedToUserId: "manager-1",
      reason: "no contact",
      actorUserId: OWNER,
    });
    const resolved = await resolveEscalation(store, audit, {
      escalationId: escalation.id,
      workItemId,
      organisationId: ORG,
      actorUserId: "manager-1",
    });
    expect(resolved.healthState).toBe("green");
  });

  it("resolving one of two open escalations keeps the item red", async () => {
    await escalate(store, audit, { workItemId, organisationId: ORG, escalatedToUserId: null, reason: "a", actorUserId: OWNER });
    const { escalation: second } = await escalate(store, audit, {
      workItemId,
      organisationId: ORG,
      escalatedToUserId: null,
      reason: "b",
      actorUserId: OWNER,
    });
    const afterOneResolved = await resolveEscalation(store, audit, {
      escalationId: second.id,
      workItemId,
      organisationId: ORG,
      actorUserId: OWNER,
    });
    expect(afterOneResolved.healthState).toBe("red");
  });

  it("recovery can only begin from a Red item", async () => {
    await expect(
      beginRecovery(store, audit, { workItemId, organisationId: ORG, actorUserId: OWNER }),
    ).rejects.toThrow(WorkflowError);
  });

  it("full lifecycle: escalate -> red -> beginRecovery -> recovery -> resolve -> green", async () => {
    const { escalation } = await escalate(store, audit, {
      workItemId,
      organisationId: ORG,
      escalatedToUserId: "manager-1",
      reason: "no contact",
      actorUserId: OWNER,
    });
    const inRecovery = await beginRecovery(store, audit, { workItemId, organisationId: ORG, actorUserId: "manager-1" });
    expect(inRecovery.healthState).toBe("recovery");

    // Resolving the escalation while still marked Recovery should clear it to green.
    const resolved = await resolveEscalation(store, audit, {
      escalationId: escalation.id,
      workItemId,
      organisationId: ORG,
      actorUserId: "manager-1",
    });
    expect(resolved.healthState).toBe("green");
    expect(audit.events.map((e) => e.action)).toEqual(
      expect.arrayContaining(["escalated", "recovery_started", "escalation_resolved"]),
    );
  });
});

describe("close and reopen", () => {
  let store: FakeWorkItemStore;
  let audit: InMemoryAuditSink;
  let workItemId: string;

  beforeEach(async () => {
    store = new FakeWorkItemStore();
    audit = new InMemoryAuditSink();
    const item = await createWorkItem(store, audit, {
      organisationId: ORG,
      centreId: null,
      domain: "referral",
      title: "Test referral",
      ownerUserId: OWNER,
      priority: "normal",
      dueAt: null,
      nextAction: null,
    });
    workItemId = item.id;
  });

  it("requires a non-empty reason to close", async () => {
    await expect(
      closeWorkItem(store, audit, { workItemId, organisationId: ORG, actorUserId: OWNER, reason: "" }),
    ).rejects.toThrow(WorkflowError);
    await expect(
      closeWorkItem(store, audit, { workItemId, organisationId: ORG, actorUserId: OWNER, reason: "   " }),
    ).rejects.toThrow(WorkflowError);
  });

  it("closes with a reason and records closedAt", async () => {
    const closed = await closeWorkItem(store, audit, {
      workItemId,
      organisationId: ORG,
      actorUserId: OWNER,
      reason: "client declined",
    });
    expect(closed.status).toBe("closed");
    expect(closed.closeReason).toBe("client declined");
    expect(closed.closedAt).not.toBeNull();
  });

  it("cannot close an already-closed item", async () => {
    await closeWorkItem(store, audit, { workItemId, organisationId: ORG, actorUserId: OWNER, reason: "done" });
    await expect(
      closeWorkItem(store, audit, { workItemId, organisationId: ORG, actorUserId: OWNER, reason: "done again" }),
    ).rejects.toThrow(WorkflowError);
  });

  it("reopening restores open status, still with the same owner, and requires a reason", async () => {
    await closeWorkItem(store, audit, { workItemId, organisationId: ORG, actorUserId: OWNER, reason: "done" });
    await expect(
      reopenWorkItem(store, audit, { workItemId, organisationId: ORG, actorUserId: OWNER, reason: "" }),
    ).rejects.toThrow(WorkflowError);

    const reopened = await reopenWorkItem(store, audit, {
      workItemId,
      organisationId: ORG,
      actorUserId: OWNER,
      reason: "client called back after all",
    });
    expect(reopened.status).toBe("open");
    expect(reopened.closeReason).toBeNull();
    expect(reopened.currentOwnerUserId).toBe(OWNER); // ownership survives close/reopen
  });

  it("cannot reopen an item that is not closed", async () => {
    await expect(
      reopenWorkItem(store, audit, { workItemId, organisationId: ORG, actorUserId: OWNER, reason: "why not" }),
    ).rejects.toThrow(WorkflowError);
  });

  it("closed/reopened transitions are recorded in status history", async () => {
    await closeWorkItem(store, audit, { workItemId, organisationId: ORG, actorUserId: OWNER, reason: "done" });
    await reopenWorkItem(store, audit, { workItemId, organisationId: ORG, actorUserId: OWNER, reason: "reopening" });
    const statuses = store.statusHistory.map((h) => [h.fromStatus, h.toStatus]);
    expect(statuses).toEqual(
      expect.arrayContaining([
        ["open", "closed"],
        ["closed", "open"],
      ]),
    );
  });
});

describe("rescheduleWorkItem", () => {
  let store: FakeWorkItemStore;
  let audit: InMemoryAuditSink;
  let workItemId: string;

  beforeEach(async () => {
    store = new FakeWorkItemStore();
    audit = new InMemoryAuditSink();
    const item = await createWorkItem(store, audit, {
      organisationId: ORG,
      centreId: null,
      domain: "referral",
      title: "Test referral",
      ownerUserId: OWNER,
      priority: "normal",
      dueAt: null,
      nextAction: null,
    });
    workItemId = item.id;
  });

  it("updates the due date and recomputes health state (green -> amber)", async () => {
    const soon = new Date(Date.now() + 60_000);
    const updated = await rescheduleWorkItem(store, audit, {
      workItemId,
      organisationId: ORG,
      actorUserId: OWNER,
      dueAt: soon,
      nextAction: "follow up call",
      reason: "follow-up deadline set",
    });
    expect(updated.dueAt?.getTime()).toBe(soon.getTime());
    expect(updated.nextAction).toBe("follow up call");
    expect(updated.healthState).toBe("amber");
    expect(audit.events.map((e) => e.action)).toContain("rescheduled");
  });

  it("updates the due date and recomputes health state (green -> red when overdue)", async () => {
    const past = new Date(Date.now() - 60_000);
    const updated = await rescheduleWorkItem(store, audit, {
      workItemId,
      organisationId: ORG,
      actorUserId: OWNER,
      dueAt: past,
      reason: null,
    });
    expect(updated.healthState).toBe("red");
  });

  it("cannot reschedule a closed work item", async () => {
    await closeWorkItem(store, audit, { workItemId, organisationId: ORG, actorUserId: OWNER, reason: "done" });
    await expect(
      rescheduleWorkItem(store, audit, { workItemId, organisationId: ORG, actorUserId: OWNER, dueAt: new Date(), reason: null }),
    ).rejects.toThrow(WorkflowError);
  });
});
