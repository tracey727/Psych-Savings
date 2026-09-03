import { InMemoryAuditSink } from "@psych-savings/audit";
import { WorkflowError } from "@psych-savings/workflow-engine";
import { FakeWorkItemStore } from "@psych-savings/workflow-engine/test/fakes/fakeWorkItemStore";
import { beforeEach, describe, expect, it } from "vitest";
import {
  captureVacancy,
  getLeakagePatternReport,
  getOutreachHistory,
  getVacancySummary,
  recordOutreachAttempt,
  setRefillOutcome,
} from "../src/appointments/engine";
import { FakeAppointmentVacancyStore } from "./fakes/fakeAppointmentVacancyStore";

const ORG = "org-1";
const OWNER = "user-owner";

describe("captureVacancy", () => {
  let workItemStore: FakeWorkItemStore;
  let vacancyStore: FakeAppointmentVacancyStore;
  let audit: InMemoryAuditSink;

  beforeEach(() => {
    workItemStore = new FakeWorkItemStore();
    vacancyStore = new FakeAppointmentVacancyStore();
    audit = new InMemoryAuditSink();
  });

  it("captures a cancellation with an owner and a refill-window deadline", async () => {
    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const { workItem, vacancy } = await captureVacancy(workItemStore, vacancyStore, audit, {
      organisationId: ORG,
      centreId: null,
      ownerUserId: OWNER,
      cancellationReason: "client_illness",
      originalValueCents: 18000,
      slotTime: new Date(),
      refillWindowDueAt: dueAt,
    });
    expect(workItem.currentOwnerUserId).toBe(OWNER);
    expect(workItem.dueAt?.getTime()).toBe(dueAt.getTime());
    expect(vacancy.workItemId).toBe(workItem.id);
    expect(vacancy.refillOutcome).toBeNull();
    expect(audit.events.map((e) => e.action)).toContain("vacancy_captured");
  });
});

describe("recordOutreachAttempt / getOutreachHistory", () => {
  let workItemStore: FakeWorkItemStore;
  let vacancyStore: FakeAppointmentVacancyStore;
  let audit: InMemoryAuditSink;
  let workItemId: string;

  beforeEach(async () => {
    workItemStore = new FakeWorkItemStore();
    vacancyStore = new FakeAppointmentVacancyStore();
    audit = new InMemoryAuditSink();
    const { workItem } = await captureVacancy(workItemStore, vacancyStore, audit, {
      organisationId: ORG,
      centreId: null,
      ownerUserId: OWNER,
      cancellationReason: "no_show",
      originalValueCents: null,
      slotTime: null,
      refillWindowDueAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    workItemId = workItem.id;
  });

  it("records an attempt and it shows up in history", async () => {
    await recordOutreachAttempt(workItemStore, audit, {
      workItemId,
      organisationId: ORG,
      actorUserId: OWNER,
      outcome: "no_answer",
      notes: null,
    });
    const history = await getOutreachHistory(workItemStore, workItemId, ORG);
    expect(history).toHaveLength(1);
    expect(audit.events.map((e) => e.action)).toContain("outreach_attempt_recorded");
  });

  it("outreach attempts do not leak into a different evidence type's history", async () => {
    await workItemStore.recordEvidence({
      organisationId: ORG,
      workItemId,
      evidenceType: "contact_attempt",
      reference: "spoke_to_client",
      note: null,
      createdByUserId: OWNER,
    });
    const history = await getOutreachHistory(workItemStore, workItemId, ORG);
    expect(history).toHaveLength(0);
  });
});

describe("setRefillOutcome", () => {
  let workItemStore: FakeWorkItemStore;
  let vacancyStore: FakeAppointmentVacancyStore;
  let audit: InMemoryAuditSink;
  let vacancyId: string;
  let workItemId: string;

  beforeEach(async () => {
    workItemStore = new FakeWorkItemStore();
    vacancyStore = new FakeAppointmentVacancyStore();
    audit = new InMemoryAuditSink();
    const { workItem, vacancy } = await captureVacancy(workItemStore, vacancyStore, audit, {
      organisationId: ORG,
      centreId: null,
      ownerUserId: OWNER,
      cancellationReason: "client_illness",
      originalValueCents: 15000,
      slotTime: null,
      refillWindowDueAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    vacancyId = vacancy.id;
    workItemId = workItem.id;
  });

  it("refilled requires a positive recovered value", async () => {
    await expect(
      setRefillOutcome(workItemStore, vacancyStore, audit, {
        vacancyId,
        workItemId,
        organisationId: ORG,
        actorUserId: OWNER,
        outcome: "refilled",
      }),
    ).rejects.toThrow(WorkflowError);

    await expect(
      setRefillOutcome(workItemStore, vacancyStore, audit, {
        vacancyId,
        workItemId,
        organisationId: ORG,
        actorUserId: OWNER,
        outcome: "refilled",
        recoveredValueCents: 0,
      }),
    ).rejects.toThrow(WorkflowError);
  });

  it("does NOT count recovered value merely because a candidate was contacted — only an explicit refilled outcome sets it", async () => {
    await recordOutreachAttempt(workItemStore, audit, {
      workItemId,
      organisationId: ORG,
      actorUserId: OWNER,
      outcome: "spoke_to_candidate",
      notes: "interested, awaiting confirmation",
    });
    const vacancy = await vacancyStore.getVacancy(vacancyId, ORG);
    expect(vacancy?.refillOutcome).toBeNull();
    expect(vacancy?.recoveredValueCents).toBeNull();
  });

  it("refilled with a value closes the work item and records the recovered value", async () => {
    const { vacancy, workItem } = await setRefillOutcome(workItemStore, vacancyStore, audit, {
      vacancyId,
      workItemId,
      organisationId: ORG,
      actorUserId: OWNER,
      outcome: "refilled",
      recoveredValueCents: 15000,
    });
    expect(vacancy.refillOutcome).toBe("refilled");
    expect(vacancy.recoveredValueCents).toBe(15000);
    expect(workItem.status).toBe("closed");
    expect(workItem.closeReason).toContain("refilled");
  });

  it("not_refilled also closes the work item, with no recovered value", async () => {
    const { vacancy, workItem } = await setRefillOutcome(workItemStore, vacancyStore, audit, {
      vacancyId,
      workItemId,
      organisationId: ORG,
      actorUserId: OWNER,
      outcome: "not_refilled",
    });
    expect(vacancy.refillOutcome).toBe("not_refilled");
    expect(vacancy.recoveredValueCents).toBeNull();
    expect(workItem.status).toBe("closed");
  });
});

describe("leakage pattern reporting and vacancy summary", () => {
  it("groups by cancellation reason, ranked by frequency", async () => {
    const workItemStore = new FakeWorkItemStore();
    const vacancyStore = new FakeAppointmentVacancyStore();
    const audit = new InMemoryAuditSink();

    for (const reason of ["client_illness", "client_illness", "no_show", "client_illness", "no_show"]) {
      await captureVacancy(workItemStore, vacancyStore, audit, {
        organisationId: ORG,
        centreId: null,
        ownerUserId: OWNER,
        cancellationReason: reason,
        originalValueCents: null,
        slotTime: null,
        refillWindowDueAt: new Date(Date.now() + 60_000),
      });
    }

    const report = await getLeakagePatternReport(vacancyStore, ORG);
    expect(report[0]).toEqual({ reason: "client_illness", count: 3 });
    expect(report[1]).toEqual({ reason: "no_show", count: 2 });
  });

  it("summarises total vacancies, refilled/not-refilled/pending and recovered value", async () => {
    const workItemStore = new FakeWorkItemStore();
    const vacancyStore = new FakeAppointmentVacancyStore();
    const audit = new InMemoryAuditSink();

    const outcomes: Array<["refilled" | "not_refilled" | null, number?]> = [
      ["refilled", 15000],
      ["refilled", 12000],
      ["not_refilled"],
      [null],
    ];
    for (const [outcome, value] of outcomes) {
      const { workItem, vacancy } = await captureVacancy(workItemStore, vacancyStore, audit, {
        organisationId: ORG,
        centreId: null,
        ownerUserId: OWNER,
        cancellationReason: "client_illness",
        originalValueCents: null,
        slotTime: null,
        refillWindowDueAt: new Date(Date.now() + 60_000),
      });
      if (outcome) {
        await setRefillOutcome(workItemStore, vacancyStore, audit, {
          vacancyId: vacancy.id,
          workItemId: workItem.id,
          organisationId: ORG,
          actorUserId: OWNER,
          outcome,
          ...(value !== undefined ? { recoveredValueCents: value } : {}),
        });
      }
    }

    const summary = await getVacancySummary(vacancyStore, ORG);
    expect(summary).toEqual({
      totalVacancies: 4,
      refilled: 2,
      notRefilled: 1,
      pending: 1,
      totalRecoveredValueCents: 27000,
    });
  });
});
