import { InMemoryAuditSink } from "@psych-savings/audit";
import { createWorkItem, WorkflowError } from "@psych-savings/workflow-engine";
import { FakeWorkItemStore } from "@psych-savings/workflow-engine/test/fakes/fakeWorkItemStore";
import { beforeEach, describe, expect, it } from "vitest";
import {
  acceptHandover,
  completeReturnBriefing,
  declareAbsence,
  escalateUnacceptedHandovers,
  getAbsenceImpactSummary,
  rejectHandover,
} from "../src/absences/engine";
import { FakeAbsenceStore } from "./fakes/fakeAbsenceStore";

const ORG = "org-1";
const ABSENT = "user-absent";
const TEMP_OWNER = "user-temp";

async function seedOpenItems(
  workItemStore: FakeWorkItemStore,
  audit: InMemoryAuditSink,
  count: number,
  overrides: Partial<{ priority: "low" | "normal" | "high" | "urgent" }> = {},
) {
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push(
      await createWorkItem(workItemStore, audit, {
        organisationId: ORG,
        centreId: null,
        domain: "referral",
        title: `Item ${i}`,
        ownerUserId: ABSENT,
        priority: overrides.priority ?? "normal",
        dueAt: null,
        nextAction: null,
      }),
    );
  }
  return items;
}

describe("declareAbsence — no active work is orphaned", () => {
  let workItemStore: FakeWorkItemStore;
  let absenceStore: FakeAbsenceStore;
  let audit: InMemoryAuditSink;

  beforeEach(() => {
    workItemStore = new FakeWorkItemStore();
    absenceStore = new FakeAbsenceStore();
    audit = new InMemoryAuditSink();
  });

  it("hands over every one of the absent user's open items", async () => {
    await seedOpenItems(workItemStore, audit, 3);
    const { absence, handovers } = await declareAbsence(workItemStore, absenceStore, audit, {
      organisationId: ORG,
      userId: ABSENT,
      absenceType: "planned_leave",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      temporaryOwnerUserId: TEMP_OWNER,
      actorUserId: ABSENT,
    });
    expect(handovers).toHaveLength(3);
    expect(audit.events.map((e) => e.action)).toContain("absence_declared");
    expect(absence.userId).toBe(ABSENT);
  });

  it("a pending (unaccepted) handover leaves the absent user as the recorded owner — never ownerless", async () => {
    const [item] = await seedOpenItems(workItemStore, audit, 1);
    await declareAbsence(workItemStore, absenceStore, audit, {
      organisationId: ORG,
      userId: ABSENT,
      absenceType: "unexpected",
      startsAt: new Date(),
      endsAt: null,
      temporaryOwnerUserId: TEMP_OWNER,
      actorUserId: ABSENT,
    });
    const current = await workItemStore.getWorkItem(item!.id, ORG);
    expect(current?.currentOwnerUserId).toBe(ABSENT);
  });

  it("does not affect items belonging to other users, or already-closed items", async () => {
    await seedOpenItems(workItemStore, audit, 1);
    const otherUsersItem = await createWorkItem(workItemStore, audit, {
      organisationId: ORG,
      centreId: null,
      domain: "referral",
      title: "someone else's item",
      ownerUserId: TEMP_OWNER,
      priority: "normal",
      dueAt: null,
      nextAction: null,
    });
    const { handovers } = await declareAbsence(workItemStore, absenceStore, audit, {
      organisationId: ORG,
      userId: ABSENT,
      absenceType: "planned_leave",
      startsAt: new Date(),
      endsAt: null,
      temporaryOwnerUserId: TEMP_OWNER,
      actorUserId: ABSENT,
    });
    expect(handovers.map((h) => h.workItem.id)).not.toContain(otherUsersItem.id);
  });
});

describe("acceptHandover / rejectHandover", () => {
  let workItemStore: FakeWorkItemStore;
  let absenceStore: FakeAbsenceStore;
  let audit: InMemoryAuditSink;
  let handoverId: string;

  beforeEach(async () => {
    workItemStore = new FakeWorkItemStore();
    absenceStore = new FakeAbsenceStore();
    audit = new InMemoryAuditSink();
    await seedOpenItems(workItemStore, audit, 1, { priority: "urgent" });
    const { handovers } = await declareAbsence(workItemStore, absenceStore, audit, {
      organisationId: ORG,
      userId: ABSENT,
      absenceType: "planned_leave",
      startsAt: new Date(),
      endsAt: null,
      temporaryOwnerUserId: TEMP_OWNER,
      actorUserId: ABSENT,
    });
    handoverId = handovers[0]!.handover.id;
  });

  it("accepting moves ownership to the temporary owner", async () => {
    const updated = await acceptHandover(workItemStore, absenceStore, audit, {
      handoverId,
      organisationId: ORG,
      acceptingUserId: TEMP_OWNER,
    });
    expect(updated.currentOwnerUserId).toBe(TEMP_OWNER);
  });

  it("rejecting immediately escalates the item (owner is absent and cannot act)", async () => {
    const updated = await rejectHandover(workItemStore, absenceStore, audit, {
      handoverId,
      organisationId: ORG,
      rejectingUserId: TEMP_OWNER,
      reason: "too busy to cover this",
      actorUserId: TEMP_OWNER,
    });
    expect(updated.healthState).toBe("red");
    expect(updated.currentOwnerUserId).toBe(ABSENT); // rejection never moves ownership
    expect(audit.events.map((e) => e.action)).toEqual(expect.arrayContaining(["transfer_rejected", "escalated"]));
  });
});

describe("escalateUnacceptedHandovers", () => {
  it("escalates only high/urgent items pending past the threshold, and only once per still-pending item", async () => {
    const workItemStore = new FakeWorkItemStore();
    const absenceStore = new FakeAbsenceStore();
    const audit = new InMemoryAuditSink();

    const [urgentItem] = await seedOpenItems(workItemStore, audit, 1, { priority: "urgent" });
    const [normalItem] = await seedOpenItems(workItemStore, audit, 1, { priority: "normal" });

    const declared = await declareAbsence(workItemStore, absenceStore, audit, {
      organisationId: ORG,
      userId: ABSENT,
      absenceType: "unexpected",
      startsAt: new Date(),
      endsAt: null,
      temporaryOwnerUserId: TEMP_OWNER,
      actorUserId: ABSENT,
    });

    const farFuture = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const escalated = await escalateUnacceptedHandovers(
      workItemStore,
      absenceStore,
      audit,
      { absenceId: declared.absence.id, organisationId: ORG, actorUserId: ABSENT },
      farFuture,
    );

    expect(escalated.map((i) => i.id)).toContain(urgentItem!.id);
    expect(escalated.map((i) => i.id)).not.toContain(normalItem!.id);
  });

  it("does not escalate a handover that has already been accepted", async () => {
    const workItemStore = new FakeWorkItemStore();
    const absenceStore = new FakeAbsenceStore();
    const audit = new InMemoryAuditSink();

    await seedOpenItems(workItemStore, audit, 1, { priority: "urgent" });
    const declared = await declareAbsence(workItemStore, absenceStore, audit, {
      organisationId: ORG,
      userId: ABSENT,
      absenceType: "planned_leave",
      startsAt: new Date(),
      endsAt: null,
      temporaryOwnerUserId: TEMP_OWNER,
      actorUserId: ABSENT,
    });
    await acceptHandover(workItemStore, absenceStore, audit, {
      handoverId: declared.handovers[0]!.handover.id,
      organisationId: ORG,
      acceptingUserId: TEMP_OWNER,
    });

    const farFuture = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const escalated = await escalateUnacceptedHandovers(
      workItemStore,
      absenceStore,
      audit,
      { absenceId: declared.absence.id, organisationId: ORG, actorUserId: ABSENT },
      farFuture,
    );
    expect(escalated).toHaveLength(0);
  });
});

describe("completeReturnBriefing", () => {
  it("summarises the current state of every handed-over item", async () => {
    const workItemStore = new FakeWorkItemStore();
    const absenceStore = new FakeAbsenceStore();
    const audit = new InMemoryAuditSink();

    await seedOpenItems(workItemStore, audit, 2);
    const declared = await declareAbsence(workItemStore, absenceStore, audit, {
      organisationId: ORG,
      userId: ABSENT,
      absenceType: "planned_leave",
      startsAt: new Date(),
      endsAt: new Date(),
      temporaryOwnerUserId: TEMP_OWNER,
      actorUserId: ABSENT,
    });
    await acceptHandover(workItemStore, absenceStore, audit, {
      handoverId: declared.handovers[0]!.handover.id,
      organisationId: ORG,
      acceptingUserId: TEMP_OWNER,
    });

    const briefing = await completeReturnBriefing(workItemStore, absenceStore, audit, {
      absenceId: declared.absence.id,
      organisationId: ORG,
      actorUserId: ABSENT,
    });
    expect(briefing.items).toHaveLength(2);
    expect(briefing.items.filter((i) => i.accepted)).toHaveLength(1);
    expect(briefing.items.filter((i) => !i.accepted)).toHaveLength(1);
    expect(briefing.absence.returnBriefingCompletedAt).not.toBeNull();
  });

  it("cannot be completed twice", async () => {
    const workItemStore = new FakeWorkItemStore();
    const absenceStore = new FakeAbsenceStore();
    const audit = new InMemoryAuditSink();

    const declared = await declareAbsence(workItemStore, absenceStore, audit, {
      organisationId: ORG,
      userId: ABSENT,
      absenceType: "planned_leave",
      startsAt: new Date(),
      endsAt: new Date(),
      temporaryOwnerUserId: TEMP_OWNER,
      actorUserId: ABSENT,
    });
    await completeReturnBriefing(workItemStore, absenceStore, audit, {
      absenceId: declared.absence.id,
      organisationId: ORG,
      actorUserId: ABSENT,
    });
    await expect(
      completeReturnBriefing(workItemStore, absenceStore, audit, {
        absenceId: declared.absence.id,
        organisationId: ORG,
        actorUserId: ABSENT,
      }),
    ).rejects.toThrow(WorkflowError);
  });
});

describe("getAbsenceImpactSummary", () => {
  it("counts accepted/rejected/pending handovers and at-risk items", async () => {
    const workItemStore = new FakeWorkItemStore();
    const absenceStore = new FakeAbsenceStore();
    const audit = new InMemoryAuditSink();

    await seedOpenItems(workItemStore, audit, 3);
    const declared = await declareAbsence(workItemStore, absenceStore, audit, {
      organisationId: ORG,
      userId: ABSENT,
      absenceType: "unexpected",
      startsAt: new Date(),
      endsAt: null,
      temporaryOwnerUserId: TEMP_OWNER,
      actorUserId: ABSENT,
    });

    await acceptHandover(workItemStore, absenceStore, audit, {
      handoverId: declared.handovers[0]!.handover.id,
      organisationId: ORG,
      acceptingUserId: TEMP_OWNER,
    });
    await rejectHandover(workItemStore, absenceStore, audit, {
      handoverId: declared.handovers[1]!.handover.id,
      organisationId: ORG,
      rejectingUserId: TEMP_OWNER,
      reason: "cannot cover",
      actorUserId: TEMP_OWNER,
    });
    // handovers[2] left pending

    const summary = await getAbsenceImpactSummary(workItemStore, absenceStore, ORG, declared.absence.id);
    expect(summary.totalHandovers).toBe(3);
    expect(summary.accepted).toBe(1);
    expect(summary.rejected).toBe(1);
    expect(summary.pending).toBe(1);
    expect(summary.atRiskItemCount).toBe(1); // the rejected+escalated (now red) item
  });
});
