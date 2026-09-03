import { InMemoryAuditSink } from "@psych-savings/audit";
import {
  addSavingsEvidence,
  approveSavingsCase,
  getVerifiedSavingsTotals,
  measureSavingsCase,
  verifySavingsCase,
} from "@psych-savings/savings-engine";
import { FakeSavingsStore } from "@psych-savings/savings-engine/test/fakes/fakeSavingsStore";
import { FakeWorkItemStore } from "@psych-savings/workflow-engine/test/fakes/fakeWorkItemStore";
import { beforeEach, describe, expect, it } from "vitest";
import {
  captureWasteEvent,
  getWasteTotalsByCategory,
  implementIntervention,
  openIntervention,
  openWasteSavingsCase,
  reviewWasteEvent,
  suggestBaselineFromIntervention,
} from "../src/waste/engine";
import type { WasteEvent } from "../src/waste/types";
import { FakeWasteStore } from "./fakes/fakeWasteStore";

const ORG = "org-1";
const RECEPTION = "user-reception";
const MANAGER = "user-manager";
const DIRECTOR = "user-director";

let workItemStore: FakeWorkItemStore;
let wasteStore: FakeWasteStore;
let savingsStore: FakeSavingsStore;
let audit: InMemoryAuditSink;

beforeEach(() => {
  workItemStore = new FakeWorkItemStore();
  wasteStore = new FakeWasteStore();
  savingsStore = new FakeSavingsStore();
  audit = new InMemoryAuditSink();
});

function capture(minutes = 12) {
  return captureWasteEvent(wasteStore, audit, {
    organisationId: ORG,
    centreId: null,
    reportedByUserId: RECEPTION,
    category: "duplicate_work",
    staffRole: "reception_admin",
    description: "Referral details re-keyed from the fax into the practice system",
    estimatedMinutes: minutes,
    recurrence: "weekly",
  });
}

async function reviewed(minutes = 12): Promise<WasteEvent> {
  const event = await capture(minutes);
  return reviewWasteEvent(wasteStore, audit, {
    wasteEventId: event.id,
    organisationId: ORG,
    actorUserId: MANAGER,
    rootCauseCategory: "no_single_source_of_truth",
    rootCauseNote: "referral arrives on paper and is typed in twice",
  });
}

describe("captureWasteEvent", () => {
  it("captures without an owner, a due date or a root cause", async () => {
    const event = await capture();
    expect(event.reviewedAt).toBeNull();
    expect(event.interventionId).toBeNull();
    expect(audit.events.map((e) => e.action)).toContain("waste_event_captured");
  });

  it("refuses a nonsensical time estimate", async () => {
    await expect(
      captureWasteEvent(wasteStore, audit, {
        organisationId: ORG,
        centreId: null,
        reportedByUserId: RECEPTION,
        category: "searching",
        staffRole: "reception_admin",
        description: "looking for a file",
        estimatedMinutes: 0,
        recurrence: "daily",
      }),
    ).rejects.toThrow(/positive whole number/);
  });
});

describe("getWasteTotalsByCategory", () => {
  it("annualises each category's estimated minutes at its recorded recurrence", async () => {
    await capture(12);
    await capture(8);
    const totals = await getWasteTotalsByCategory(wasteStore, ORG);
    expect(totals).toHaveLength(1);
    expect(totals[0]!.totalEstimatedMinutes).toBe(20);
    expect(totals[0]!.annualisedMinutes).toBe(20 * 52);
  });
});

describe("openIntervention", () => {
  it("refuses to act on an event nobody has diagnosed", async () => {
    const event = await capture();
    await expect(
      openIntervention(workItemStore, wasteStore, audit, {
        organisationId: ORG,
        centreId: null,
        ownerUserId: MANAGER,
        title: "Stop re-keying referrals",
        description: null,
        rootCauseCategory: "no_single_source_of_truth",
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        nextAction: "Configure direct referral intake",
        wasteEventIds: [event.id],
      }),
    ).rejects.toThrow(/root-cause review/);
  });

  it("creates an owned work item and attaches the reviewed events", async () => {
    const first = await reviewed();
    const second = await reviewed();
    const { workItem, attached } = await openIntervention(workItemStore, wasteStore, audit, {
      organisationId: ORG,
      centreId: null,
      ownerUserId: MANAGER,
      title: "Stop re-keying referrals",
      description: null,
      rootCauseCategory: "no_single_source_of_truth",
      dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      nextAction: "Configure direct referral intake",
      wasteEventIds: [first.id, second.id],
    });

    expect(workItem.currentOwnerUserId).toBe(MANAGER);
    expect(workItem.domain).toBe("waste_intervention");
    expect(attached.every((e) => e.interventionId !== null)).toBe(true);
  });

  it("refuses to attach an event that another intervention already owns", async () => {
    const event = await reviewed();
    const open = () =>
      openIntervention(workItemStore, wasteStore, audit, {
        organisationId: ORG,
        centreId: null,
        ownerUserId: MANAGER,
        title: "Stop re-keying referrals",
        description: null,
        rootCauseCategory: "no_single_source_of_truth",
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        nextAction: "Configure direct referral intake",
        wasteEventIds: [event.id],
      });
    await open();
    await expect(open()).rejects.toThrow(/already attached/);
  });
});

describe("suggestBaselineFromIntervention", () => {
  it("summarises the reporters' estimates without becoming a baseline", async () => {
    const first = await reviewed(12);
    const second = await reviewed(8);
    const { intervention } = await openIntervention(workItemStore, wasteStore, audit, {
      organisationId: ORG,
      centreId: null,
      ownerUserId: MANAGER,
      title: "Stop re-keying referrals",
      description: null,
      rootCauseCategory: "no_single_source_of_truth",
      dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      nextAction: "Configure direct referral intake",
      wasteEventIds: [first.id, second.id],
    });

    const suggestion = await suggestBaselineFromIntervention(wasteStore, ORG, intervention.id);
    expect(suggestion.eventCount).toBe(2);
    expect(suggestion.totalEstimatedMinutes).toBe(20);
    expect(suggestion.meanEstimatedMinutes).toBe(10);
    expect(suggestion.mostCommonRecurrence).toBe("weekly");
    // Nothing was persisted as a baseline by asking for a suggestion.
    expect(savingsStore.baselines.size).toBe(0);
  });
});

/**
 * PHASE 12 GREEN GATE — "At least one end-to-end synthetic waste case
 * reaches Verified savings with evidence."
 *
 * This walks the whole chain in the order a real practice would:
 * reception notices the waste, a manager diagnoses it, the director
 * approves acting on it, the manager carries it out and measures the
 * result, and the director verifies it against evidence. Every guard
 * along the way is a rule from docs/product/SAVINGS_MEASUREMENT_CONTRACT.md.
 */
describe("Phase 12 GREEN GATE: a synthetic waste case reaching Verified", () => {
  it("takes one waste case from capture to verified savings with evidence", async () => {
    // 1. Reception logs the same duplicated task three weeks running.
    const events = [await reviewed(12), await reviewed(12), await reviewed(12)];

    // 2. A manager opens an owned intervention against the diagnosed events.
    const { intervention, workItem } = await openIntervention(workItemStore, wasteStore, audit, {
      organisationId: ORG,
      centreId: null,
      ownerUserId: MANAGER,
      title: "Referral intake goes straight into the practice system",
      description: "Remove the paper re-keying step",
      rootCauseCategory: "no_single_source_of_truth",
      dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      nextAction: "Switch the referral inbox to direct intake",
      wasteEventIds: events.map((e) => e.id),
    });

    // 3. The savings case is raised against a MEASURED baseline, not the estimates.
    const savingsCase = await openWasteSavingsCase(wasteStore, savingsStore, audit, {
      organisationId: ORG,
      interventionId: intervention.id,
      actorUserId: MANAGER,
      title: "Released reception time — referral re-keying",
      baselineMinutes: 12,
      recurrence: "weekly",
      method: "timed six consecutive re-keying occurrences with a stopwatch",
      measuredFrom: new Date("2026-08-01T00:00:00Z"),
      measuredTo: new Date("2026-08-31T00:00:00Z"),
      sourceReference: "baseline-timing-sheet-2026-08",
    });
    expect(savingsCase.state).toBe("potential");
    expect(savingsCase.category).toBe("released_staff_time");

    // 4. Only a director or manager may approve acting on it.
    await approveSavingsCase(savingsStore, audit, {
      savingsCaseId: savingsCase.id,
      organisationId: ORG,
      actorUserId: DIRECTOR,
      actorRoles: ["director"],
      reason: "worth doing; low cost to change",
    });

    // 5. Carrying the intervention out moves the case to Implemented and
    //    closes the work item — one real-world event, one transition.
    const implemented = await implementIntervention(
      workItemStore,
      wasteStore,
      savingsStore,
      audit,
      {
        interventionId: intervention.id,
        organisationId: ORG,
        actorUserId: MANAGER,
        reason: "direct referral intake switched on",
      },
    );
    expect(implemented.workItem.status).toBe("closed");
    expect(implemented.savingsCases[0]!.state).toBe("implemented");

    // 6. Measuring supplies only the observed after-state; the engine does the arithmetic.
    const measured = await measureSavingsCase(savingsStore, audit, {
      savingsCaseId: savingsCase.id,
      organisationId: ORG,
      actorUserId: MANAGER,
      postMinutes: 4,
      postAmountCents: null,
      labourRateCentsPerHour: 4500,
    });
    expect(measured.measuredMinutesReleased).toBe(8);
    expect(measured.measuredAmountCents).toBe(600);
    expect(measured.annualisedMinutesReleased).toBe(416);

    // 7. Evidence, then verification by someone other than the implementer.
    await addSavingsEvidence(savingsStore, audit, {
      savingsCaseId: savingsCase.id,
      organisationId: ORG,
      evidenceType: "measured_process_time",
      reference: "post-change-timing-sheet-2026-09",
      note: "six occurrences timed after the change",
      actorUserId: MANAGER,
    });
    const verified = await verifySavingsCase(savingsStore, audit, {
      savingsCaseId: savingsCase.id,
      organisationId: ORG,
      actorUserId: DIRECTOR,
      actorRoles: ["director"],
      reason: "timing sheets reviewed against the baseline",
    });

    expect(verified.state).toBe("verified");
    expect(verified.verifiedByUserId).toBe(DIRECTOR);
    expect(verified.implementedByUserId).toBe(MANAGER);

    // 8. The verified total is reconstructable, and the run-rate stays out of it.
    const totals = await getVerifiedSavingsTotals(savingsStore, ORG);
    expect(totals.verifiedMinutesReleased).toBe(8);
    expect(totals.verifiedAmountCents).toBe(600);
    expect(totals.annualisedRunRateMinutesReleased).toBe(416);

    // 9. The whole lifecycle is recoverable from append-only history.
    const history = await savingsStore.listStateHistory(savingsCase.id, ORG);
    expect(history.map((h) => h.toState)).toEqual([
      "potential",
      "approved",
      "implemented",
      "measured",
      "verified",
    ]);

    // 10. And the work item, not just the ledger, records what happened.
    expect(workItem.id).toBe(implemented.workItem.id);
    expect(audit.events.map((e) => e.action)).toEqual(
      expect.arrayContaining([
        "waste_event_captured",
        "waste_event_reviewed",
        "intervention_opened",
        "savings_baseline_recorded",
        "savings_case_potential",
        "savings_case_approved",
        "intervention_implemented",
        "savings_case_measured",
        "savings_evidence_added",
        "savings_case_verified",
      ]),
    );
  });

  it("refuses to implement an intervention whose savings case was never approved", async () => {
    const event = await reviewed();
    const { intervention } = await openIntervention(workItemStore, wasteStore, audit, {
      organisationId: ORG,
      centreId: null,
      ownerUserId: MANAGER,
      title: "Stop re-keying referrals",
      description: null,
      rootCauseCategory: "no_single_source_of_truth",
      dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      nextAction: "Configure direct referral intake",
      wasteEventIds: [event.id],
    });
    await openWasteSavingsCase(wasteStore, savingsStore, audit, {
      organisationId: ORG,
      interventionId: intervention.id,
      actorUserId: MANAGER,
      title: "Released reception time",
      baselineMinutes: 12,
      recurrence: "weekly",
      method: "timed six occurrences",
      measuredFrom: new Date("2026-08-01T00:00:00Z"),
      measuredTo: new Date("2026-08-31T00:00:00Z"),
      sourceReference: null,
    });

    await expect(
      implementIntervention(workItemStore, wasteStore, savingsStore, audit, {
        interventionId: intervention.id,
        organisationId: ORG,
        actorUserId: MANAGER,
        reason: "done it anyway",
      }),
    ).rejects.toThrow(/has not been approved/);
  });

  it("lets an intervention with no savings claim be implemented anyway", async () => {
    const event = await reviewed();
    const { intervention } = await openIntervention(workItemStore, wasteStore, audit, {
      organisationId: ORG,
      centreId: null,
      ownerUserId: MANAGER,
      title: "Tidy the referral inbox filters",
      description: null,
      rootCauseCategory: "manual_process",
      dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      nextAction: "Rebuild the filters",
      wasteEventIds: [event.id],
    });

    const result = await implementIntervention(workItemStore, wasteStore, savingsStore, audit, {
      interventionId: intervention.id,
      organisationId: ORG,
      actorUserId: MANAGER,
      reason: "filters rebuilt",
    });
    expect(result.intervention.implementedAt).not.toBeNull();
    expect(result.savingsCases).toHaveLength(0);
  });
});
