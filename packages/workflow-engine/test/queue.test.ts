import { InMemoryAuditSink } from "@psych-savings/audit";
import { beforeEach, describe, expect, it } from "vitest";
import { createWorkItem, escalate } from "../src/engine";
import {
  getContactAttemptHistory,
  getQueue,
  getTeamWorkload,
  recordContactAttempt,
  sortQueue,
} from "../src/queue";
import type { WorkItem } from "../src/types";
import { FakeWorkItemStore } from "./fakes/fakeWorkItemStore";

const ORG = "org-1";
const OWNER = "user-owner";

function makeItem(overrides: Partial<WorkItem>): WorkItem {
  const now = new Date();
  return {
    id: "id",
    organisationId: ORG,
    centreId: null,
    domain: "callback",
    title: "t",
    currentOwnerUserId: OWNER,
    priority: "normal",
    dueAt: null,
    nextAction: null,
    healthState: "green",
    status: "open",
    closeReason: null,
    createdAt: now,
    updatedAt: now,
    closedAt: null,
    ...overrides,
  };
}

describe("sortQueue", () => {
  it("sorts by health severity first: red, then recovery, then amber, then green", () => {
    const items = [
      makeItem({ id: "green", healthState: "green" }),
      makeItem({ id: "red", healthState: "red" }),
      makeItem({ id: "amber", healthState: "amber" }),
      makeItem({ id: "recovery", healthState: "recovery" }),
    ];
    expect(sortQueue(items).map((i) => i.id)).toEqual(["red", "recovery", "amber", "green"]);
  });

  it("within the same health state, sorts by soonest due date first", () => {
    const now = Date.now();
    const items = [
      makeItem({ id: "later", healthState: "amber", dueAt: new Date(now + 100_000) }),
      makeItem({ id: "sooner", healthState: "amber", dueAt: new Date(now + 10_000) }),
      makeItem({ id: "no-due-date", healthState: "amber", dueAt: null }),
    ];
    expect(sortQueue(items).map((i) => i.id)).toEqual(["sooner", "later", "no-due-date"]);
  });

  it("within the same health state and due date, sorts by priority: urgent > high > normal > low", () => {
    const items = [
      makeItem({ id: "low", priority: "low" }),
      makeItem({ id: "urgent", priority: "urgent" }),
      makeItem({ id: "normal", priority: "normal" }),
      makeItem({ id: "high", priority: "high" }),
    ];
    expect(sortQueue(items).map((i) => i.id)).toEqual(["urgent", "high", "normal", "low"]);
  });

  it("does not mutate the input array", () => {
    const items = [makeItem({ id: "a", healthState: "green" }), makeItem({ id: "b", healthState: "red" })];
    const original = [...items];
    sortQueue(items);
    expect(items).toEqual(original);
  });
});

describe("getQueue — no synthetic callback disappears", () => {
  let store: FakeWorkItemStore;
  let audit: InMemoryAuditSink;

  beforeEach(() => {
    store = new FakeWorkItemStore();
    audit = new InMemoryAuditSink();
  });

  it("returns every open item for the organisation, in queue order", async () => {
    for (let i = 0; i < 5; i++) {
      await createWorkItem(store, audit, {
        organisationId: ORG,
        centreId: null,
        domain: "callback",
        title: `Callback ${i}`,
        ownerUserId: OWNER,
        priority: "normal",
        dueAt: null,
        nextAction: null,
      });
    }
    const queue = await getQueue(store, ORG);
    expect(queue).toHaveLength(5);
  });

  it("an escalated item surfaces at the top of the queue", async () => {
    const a = await createWorkItem(store, audit, {
      organisationId: ORG,
      centreId: null,
      domain: "callback",
      title: "Ordinary callback",
      ownerUserId: OWNER,
      priority: "normal",
      dueAt: null,
      nextAction: null,
    });
    const b = await createWorkItem(store, audit, {
      organisationId: ORG,
      centreId: null,
      domain: "callback",
      title: "Escalated callback",
      ownerUserId: OWNER,
      priority: "normal",
      dueAt: null,
      nextAction: null,
    });
    await escalate(store, audit, {
      workItemId: b.id,
      organisationId: ORG,
      escalatedToUserId: null,
      reason: "no response after 3 attempts",
      actorUserId: OWNER,
    });
    const queue = await getQueue(store, ORG);
    expect(queue[0]?.id).toBe(b.id);
    expect(queue.map((i) => i.id)).toContain(a.id);
  });

  it("filters by domain", async () => {
    await createWorkItem(store, audit, {
      organisationId: ORG,
      centreId: null,
      domain: "callback",
      title: "A",
      ownerUserId: OWNER,
      priority: "normal",
      dueAt: null,
      nextAction: null,
    });
    await createWorkItem(store, audit, {
      organisationId: ORG,
      centreId: null,
      domain: "referral",
      title: "B",
      ownerUserId: OWNER,
      priority: "normal",
      dueAt: null,
      nextAction: null,
    });
    const queue = await getQueue(store, ORG, { domain: "callback" });
    expect(queue).toHaveLength(1);
    expect(queue[0]?.domain).toBe("callback");
  });

  it("a closed item does not appear in the queue", async () => {
    const item = await createWorkItem(store, audit, {
      organisationId: ORG,
      centreId: null,
      domain: "callback",
      title: "Resolved",
      ownerUserId: OWNER,
      priority: "normal",
      dueAt: null,
      nextAction: null,
    });
    await store.updateWorkItem(item.id, ORG, { status: "closed", closeReason: "done", closedAt: new Date() });
    const queue = await getQueue(store, ORG);
    expect(queue.map((i) => i.id)).not.toContain(item.id);
  });
});

describe("recordContactAttempt / getContactAttemptHistory", () => {
  let store: FakeWorkItemStore;
  let audit: InMemoryAuditSink;
  let workItemId: string;

  beforeEach(async () => {
    store = new FakeWorkItemStore();
    audit = new InMemoryAuditSink();
    const item = await createWorkItem(store, audit, {
      organisationId: ORG,
      centreId: null,
      domain: "callback",
      title: "Callback",
      ownerUserId: OWNER,
      priority: "normal",
      dueAt: null,
      nextAction: null,
    });
    workItemId = item.id;
  });

  it("records an attempt and it shows up in history", async () => {
    await recordContactAttempt(store, audit, {
      workItemId,
      organisationId: ORG,
      actorUserId: OWNER,
      outcome: "no_answer",
      notes: "tried at 2pm",
    });
    const history = await getContactAttemptHistory(store, workItemId, ORG);
    expect(history).toHaveLength(1);
    expect(history[0]?.reference).toBe("no_answer");
    expect(audit.events.map((e) => e.action)).toContain("contact_attempt_recorded");
  });

  it("history only includes contact attempts, not other evidence types", async () => {
    await store.recordEvidence({
      organisationId: ORG,
      workItemId,
      evidenceType: "something_else",
      reference: null,
      note: null,
      createdByUserId: OWNER,
    });
    await recordContactAttempt(store, audit, {
      workItemId,
      organisationId: ORG,
      actorUserId: OWNER,
      outcome: "spoke_to_client",
      notes: null,
    });
    const history = await getContactAttemptHistory(store, workItemId, ORG);
    expect(history).toHaveLength(1);
    expect(history[0]?.reference).toBe("spoke_to_client");
  });
});

describe("getTeamWorkload — counts only, no item detail", () => {
  it("returns per-user open and overdue counts", async () => {
    const store = new FakeWorkItemStore();
    const audit = new InMemoryAuditSink();
    const OTHER = "user-other";

    await createWorkItem(store, audit, {
      organisationId: ORG,
      centreId: null,
      domain: "callback",
      title: "A",
      ownerUserId: OWNER,
      priority: "normal",
      dueAt: new Date(Date.now() - 60_000), // overdue
      nextAction: null,
    });
    await createWorkItem(store, audit, {
      organisationId: ORG,
      centreId: null,
      domain: "callback",
      title: "B",
      ownerUserId: OWNER,
      priority: "normal",
      dueAt: null,
      nextAction: null,
    });
    await createWorkItem(store, audit, {
      organisationId: ORG,
      centreId: null,
      domain: "callback",
      title: "C",
      ownerUserId: OTHER,
      priority: "normal",
      dueAt: null,
      nextAction: null,
    });

    const workload = await getTeamWorkload(store, ORG);
    const ownerEntry = workload.find((w) => w.userId === OWNER);
    const otherEntry = workload.find((w) => w.userId === OTHER);
    expect(ownerEntry).toEqual({ userId: OWNER, openCount: 2, overdueCount: 1 });
    expect(otherEntry).toEqual({ userId: OTHER, openCount: 1, overdueCount: 0 });

    // No title/content fields anywhere in the result — just counts.
    expect(Object.keys(ownerEntry!)).toEqual(["userId", "openCount", "overdueCount"]);
  });
});
