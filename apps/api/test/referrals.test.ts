import { InMemoryAuditSink } from "@psych-savings/audit";
import { WorkflowError } from "@psych-savings/workflow-engine";
import { FakeWorkItemStore } from "@psych-savings/workflow-engine/test/fakes/fakeWorkItemStore";
import { beforeEach, describe, expect, it } from "vitest";
import {
  calculateConversionStats,
  getConversionStats,
  intakeReferral,
  recordContactAttempt,
  setReferralOutcome,
} from "../src/referrals/engine";
import { FakeReferralStore } from "./fakes/fakeReferralStore";

const ORG = "org-1";
const OWNER = "user-owner";

describe("intakeReferral", () => {
  let workItemStore: FakeWorkItemStore;
  let referralStore: FakeReferralStore;
  let audit: InMemoryAuditSink;

  beforeEach(() => {
    workItemStore = new FakeWorkItemStore();
    referralStore = new FakeReferralStore();
    audit = new InMemoryAuditSink();
  });

  it("registers a referral with an immediate owner and a first-contact deadline", async () => {
    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const { workItem, referral } = await intakeReferral(workItemStore, referralStore, audit, {
      organisationId: ORG,
      centreId: null,
      ownerUserId: OWNER,
      source: "GP referral",
      valueEstimateCents: 18000,
      firstContactDueAt: dueAt,
    });
    expect(workItem.currentOwnerUserId).toBe(OWNER);
    expect(workItem.dueAt?.getTime()).toBe(dueAt.getTime());
    expect(referral.workItemId).toBe(workItem.id);
    expect(referral.contactStatus).toBe("not_yet_contacted");
    expect(referral.outcome).toBeNull();
    expect(audit.events.map((e) => e.action)).toEqual(expect.arrayContaining(["work_item_created", "referral_intake"]));
  });
});

describe("recordContactAttempt", () => {
  let workItemStore: FakeWorkItemStore;
  let referralStore: FakeReferralStore;
  let audit: InMemoryAuditSink;
  let referralId: string;
  let workItemId: string;

  beforeEach(async () => {
    workItemStore = new FakeWorkItemStore();
    referralStore = new FakeReferralStore();
    audit = new InMemoryAuditSink();
    const { workItem, referral } = await intakeReferral(workItemStore, referralStore, audit, {
      organisationId: ORG,
      centreId: null,
      ownerUserId: OWNER,
      source: "GP referral",
      valueEstimateCents: null,
      firstContactDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    referralId = referral.id;
    workItemId = workItem.id;
  });

  it("an unsuccessful attempt moves contact_status to attempting, not contacted", async () => {
    const updated = await recordContactAttempt(workItemStore, referralStore, audit, {
      referralId,
      organisationId: ORG,
      actorUserId: OWNER,
      method: "phone",
      outcome: "no_answer",
      notes: null,
      reachedClient: false,
    });
    expect(updated.contactStatus).toBe("attempting");
  });

  it("a successful attempt moves contact_status straight to contacted", async () => {
    const updated = await recordContactAttempt(workItemStore, referralStore, audit, {
      referralId,
      organisationId: ORG,
      actorUserId: OWNER,
      method: "phone",
      outcome: "spoke to client",
      notes: "booking a consult",
      reachedClient: true,
    });
    expect(updated.contactStatus).toBe("contacted");
  });

  it("records the attempt in history", async () => {
    await recordContactAttempt(workItemStore, referralStore, audit, {
      referralId,
      organisationId: ORG,
      actorUserId: OWNER,
      method: "email",
      outcome: "no_response",
      notes: null,
      reachedClient: false,
    });
    const attempts = await referralStore.listContactAttempts(referralId, ORG);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.method).toBe("email");
  });

  it("a follow-up deadline reschedules the underlying work item and recomputes health", async () => {
    const soon = new Date(Date.now() + 60_000);
    await recordContactAttempt(workItemStore, referralStore, audit, {
      referralId,
      organisationId: ORG,
      actorUserId: OWNER,
      method: "phone",
      outcome: "call back later",
      notes: null,
      reachedClient: true,
      nextFollowUpDueAt: soon,
      nextAction: "call back tomorrow",
    });
    const item = await workItemStore.getWorkItem(workItemId, ORG);
    expect(item?.dueAt?.getTime()).toBe(soon.getTime());
    expect(item?.nextAction).toBe("call back tomorrow");
    expect(item?.healthState).toBe("amber");
  });
});

describe("setReferralOutcome", () => {
  let workItemStore: FakeWorkItemStore;
  let referralStore: FakeReferralStore;
  let audit: InMemoryAuditSink;
  let referralId: string;
  let workItemId: string;

  beforeEach(async () => {
    workItemStore = new FakeWorkItemStore();
    referralStore = new FakeReferralStore();
    audit = new InMemoryAuditSink();
    const { workItem, referral } = await intakeReferral(workItemStore, referralStore, audit, {
      organisationId: ORG,
      centreId: null,
      ownerUserId: OWNER,
      source: "GP referral",
      valueEstimateCents: null,
      firstContactDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    referralId = referral.id;
    workItemId = workItem.id;
  });

  it("declined requires a lost reason", async () => {
    await expect(
      setReferralOutcome(workItemStore, referralStore, audit, {
        referralId,
        organisationId: ORG,
        actorUserId: OWNER,
        outcome: "declined",
      }),
    ).rejects.toThrow(WorkflowError);
  });

  it("not_suitable requires a lost reason", async () => {
    await expect(
      setReferralOutcome(workItemStore, referralStore, audit, {
        referralId,
        organisationId: ORG,
        actorUserId: OWNER,
        outcome: "not_suitable",
        lostReason: "   ", // blank/whitespace does not count
      }),
    ).rejects.toThrow(WorkflowError);
  });

  it("waiting requires no reason and leaves the work item open", async () => {
    const { referral, workItem } = await setReferralOutcome(workItemStore, referralStore, audit, {
      referralId,
      organisationId: ORG,
      actorUserId: OWNER,
      outcome: "waiting",
    });
    expect(referral.outcome).toBe("waiting");
    expect(workItem).toBeNull(); // not closed
    const item = await workItemStore.getWorkItem(workItemId, ORG);
    expect(item?.status).toBe("open");
  });

  it("booked closes the underlying work item with a reason", async () => {
    const { workItem } = await setReferralOutcome(workItemStore, referralStore, audit, {
      referralId,
      organisationId: ORG,
      actorUserId: OWNER,
      outcome: "booked",
    });
    expect(workItem?.status).toBe("closed");
    expect(workItem?.closeReason).toContain("booked");
  });

  it("declined with a reason closes the work item with the lost reason recorded", async () => {
    const { referral, workItem } = await setReferralOutcome(workItemStore, referralStore, audit, {
      referralId,
      organisationId: ORG,
      actorUserId: OWNER,
      outcome: "declined",
      lostReason: "client found another provider",
    });
    expect(referral.lostReason).toBe("client found another provider");
    expect(workItem?.status).toBe("closed");
    expect(workItem?.closeReason).toContain("client found another provider");
    expect(audit.events.map((e) => e.action)).toContain("referral_outcome_set");
  });
});

describe("conversion reporting", () => {
  it("calculateConversionStats: booked / (booked + lost), waiting/undecided excluded from the rate", () => {
    const stats = calculateConversionStats({ waiting: 5, booked: 3, declined: 1, not_suitable: 1, undecided: 2 });
    expect(stats.totalFinalized).toBe(5); // 3 booked + 2 lost
    expect(stats.lost).toBe(2);
    expect(stats.conversionRate).toBeCloseTo(3 / 5);
  });

  it("is 0, not NaN, when nothing has been finalized yet", () => {
    const stats = calculateConversionStats({ waiting: 4, booked: 0, declined: 0, not_suitable: 0, undecided: 1 });
    expect(stats.conversionRate).toBe(0);
  });

  it("getConversionStats reflects real referral outcomes end to end", async () => {
    const workItemStore = new FakeWorkItemStore();
    const referralStore = new FakeReferralStore();
    const audit = new InMemoryAuditSink();

    for (const outcome of ["booked", "booked", "declined", "waiting"] as const) {
      const { referral } = await intakeReferral(workItemStore, referralStore, audit, {
        organisationId: ORG,
        centreId: null,
        ownerUserId: OWNER,
        source: "test",
        valueEstimateCents: null,
        firstContactDueAt: new Date(Date.now() + 60_000),
      });
      await setReferralOutcome(workItemStore, referralStore, audit, {
        referralId: referral.id,
        organisationId: ORG,
        actorUserId: OWNER,
        outcome,
        lostReason: outcome === "declined" ? "no longer interested" : null,
      });
    }

    const stats = await getConversionStats(referralStore, ORG);
    expect(stats.booked).toBe(2);
    expect(stats.lost).toBe(1);
    expect(stats.waiting).toBe(1);
    expect(stats.conversionRate).toBeCloseTo(2 / 3);
  });
});
