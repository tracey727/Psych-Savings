import { InMemoryAuditSink } from "@psych-savings/audit";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addSavingsEvidence,
  approveSavingsCase,
  closeSavingsCase,
  createBaseline,
  getVerifiedSavingsTotals,
  implementSavingsCase,
  measureSavingsCase,
  openSavingsCase,
  SavingsError,
  verifySavingsCase,
} from "../src/engine";
import type { SavingsBaseline, SavingsCase } from "../src/types";
import { FakeSavingsStore } from "./fakes/fakeSavingsStore";

const ORG = "org-1";
const MANAGER = "user-manager";
const DIRECTOR = "user-director";
const RECEPTION = "user-reception";

let store: FakeSavingsStore;
let audit: InMemoryAuditSink;

async function aBaseline(): Promise<SavingsBaseline> {
  return createBaseline(store, audit, {
    organisationId: ORG,
    category: "released_staff_time",
    method: "timed five occurrences",
    baselineMinutes: 15,
    baselineAmountCents: null,
    recurrence: "weekly",
    measuredFrom: new Date("2026-08-01T00:00:00Z"),
    measuredTo: new Date("2026-08-31T00:00:00Z"),
    sourceReference: "waste-event-1",
    createdByUserId: RECEPTION,
  });
}

async function aCase(sourceEntityId = "waste-1"): Promise<SavingsCase> {
  const baseline = await aBaseline();
  return openSavingsCase(store, audit, {
    organisationId: ORG,
    title: "Stop re-keying referral details",
    baselineId: baseline.id,
    interventionId: null,
    sourceEntityType: "waste_event",
    sourceEntityId,
    actorUserId: RECEPTION,
  });
}

beforeEach(() => {
  store = new FakeSavingsStore();
  audit = new InMemoryAuditSink();
});

describe("createBaseline", () => {
  it("refuses a baseline with no measure at all", async () => {
    await expect(
      createBaseline(store, audit, {
        organisationId: ORG,
        category: "released_staff_time",
        method: "guessed",
        baselineMinutes: null,
        baselineAmountCents: null,
        recurrence: "weekly",
        measuredFrom: new Date(),
        measuredTo: new Date(),
        sourceReference: null,
        createdByUserId: RECEPTION,
      }),
    ).rejects.toThrow(SavingsError);
  });

  it("refuses a baseline with no stated method", async () => {
    await expect(
      createBaseline(store, audit, {
        organisationId: ORG,
        category: "released_staff_time",
        method: "   ",
        baselineMinutes: 15,
        baselineAmountCents: null,
        recurrence: "weekly",
        measuredFrom: new Date(),
        measuredTo: new Date(),
        sourceReference: null,
        createdByUserId: RECEPTION,
      }),
    ).rejects.toThrow(SavingsError);
  });
});

describe("openSavingsCase", () => {
  it("takes its category from the baseline and starts in potential", async () => {
    const created = await aCase();
    expect(created.state).toBe("potential");
    expect(created.category).toBe("released_staff_time");
  });

  it("refuses a second open case for the same event and category (anti-double-counting rule 1)", async () => {
    await aCase("waste-1");
    await expect(aCase("waste-1")).rejects.toThrow(/already has an open/);
  });

  it("lets the same event be reconsidered once the first case is closed", async () => {
    const first = await aCase("waste-1");
    await closeSavingsCase(store, audit, {
      savingsCaseId: first.id,
      organisationId: ORG,
      actorUserId: MANAGER,
      reason: "superseded by a wider process change",
    });
    await expect(aCase("waste-1")).resolves.toBeDefined();
  });
});

describe("lifecycle order", () => {
  it("refuses to skip a state", async () => {
    const created = await aCase();
    await expect(
      implementSavingsCase(store, audit, {
        savingsCaseId: created.id,
        organisationId: ORG,
        actorUserId: MANAGER,
        reason: null,
      }),
    ).rejects.toThrow(/cannot move a savings case from potential to implemented/);
  });

  it("refuses approval by a role that cannot approve", async () => {
    const created = await aCase();
    await expect(
      approveSavingsCase(store, audit, {
        savingsCaseId: created.id,
        organisationId: ORG,
        actorUserId: RECEPTION,
        actorRoles: ["reception_admin"],
        reason: null,
      }),
    ).rejects.toThrow(/only a director or manager/);
  });

  it("records every transition in append-only history", async () => {
    const created = await aCase();
    await approveSavingsCase(store, audit, {
      savingsCaseId: created.id,
      organisationId: ORG,
      actorUserId: MANAGER,
      actorRoles: ["manager"],
      reason: "worth doing",
    });
    const history = await store.listStateHistory(created.id, ORG);
    expect(history.map((h) => h.toState)).toEqual(["potential", "approved"]);
  });
});

describe("measureSavingsCase", () => {
  it("computes the figures from the persisted baseline rather than accepting them", async () => {
    const created = await aCase();
    await approveSavingsCase(store, audit, {
      savingsCaseId: created.id,
      organisationId: ORG,
      actorUserId: MANAGER,
      actorRoles: ["manager"],
      reason: null,
    });
    await implementSavingsCase(store, audit, {
      savingsCaseId: created.id,
      organisationId: ORG,
      actorUserId: MANAGER,
      reason: null,
    });
    const measured = await measureSavingsCase(store, audit, {
      savingsCaseId: created.id,
      organisationId: ORG,
      actorUserId: MANAGER,
      postMinutes: 5,
      postAmountCents: null,
      labourRateCentsPerHour: 4500,
    });

    expect(measured.measuredMinutesReleased).toBe(10);
    expect(measured.measuredAmountCents).toBe(750);
    expect(measured.annualisedMinutesReleased).toBe(520);
  });
});

/** Drives a case to Measured and returns it, so verification tests start where they mean to. */
async function aMeasuredCase(implementedBy: string): Promise<SavingsCase> {
  const created = await aCase();
  await approveSavingsCase(store, audit, {
    savingsCaseId: created.id,
    organisationId: ORG,
    actorUserId: MANAGER,
    actorRoles: ["manager"],
    reason: null,
  });
  await implementSavingsCase(store, audit, {
    savingsCaseId: created.id,
    organisationId: ORG,
    actorUserId: implementedBy,
    reason: null,
  });
  return measureSavingsCase(store, audit, {
    savingsCaseId: created.id,
    organisationId: ORG,
    actorUserId: implementedBy,
    postMinutes: 5,
    postAmountCents: null,
    labourRateCentsPerHour: 4500,
  });
}

describe("verifySavingsCase", () => {
  it("refuses verification without evidence", async () => {
    const measured = await aMeasuredCase(MANAGER);
    await expect(
      verifySavingsCase(store, audit, {
        savingsCaseId: measured.id,
        organisationId: ORG,
        actorUserId: DIRECTOR,
        actorRoles: ["director"],
        reason: null,
      }),
    ).rejects.toThrow(/without evidence/);
  });

  it("refuses a manager verifying their own implementation", async () => {
    const measured = await aMeasuredCase(MANAGER);
    await addSavingsEvidence(store, audit, {
      savingsCaseId: measured.id,
      organisationId: ORG,
      evidenceType: "measured_process_time",
      reference: "stopwatch-2026-09",
      note: null,
      actorUserId: MANAGER,
    });
    await expect(
      verifySavingsCase(store, audit, {
        savingsCaseId: measured.id,
        organisationId: ORG,
        actorUserId: MANAGER,
        actorRoles: ["manager"],
        reason: null,
      }),
    ).rejects.toThrow(/may not verify/);
  });

  it("allows a different verifier with evidence", async () => {
    const measured = await aMeasuredCase(MANAGER);
    await addSavingsEvidence(store, audit, {
      savingsCaseId: measured.id,
      organisationId: ORG,
      evidenceType: "measured_process_time",
      reference: "stopwatch-2026-09",
      note: null,
      actorUserId: MANAGER,
    });
    const verified = await verifySavingsCase(store, audit, {
      savingsCaseId: measured.id,
      organisationId: ORG,
      actorUserId: DIRECTOR,
      actorRoles: ["director"],
      reason: "evidence reviewed",
    });
    expect(verified.state).toBe("verified");
    expect(verified.verifiedByUserId).toBe(DIRECTOR);
  });
});

describe("getVerifiedSavingsTotals", () => {
  it("counts only verified cases and keeps the run-rate out of the verified total", async () => {
    const measured = await aMeasuredCase(MANAGER);
    await addSavingsEvidence(store, audit, {
      savingsCaseId: measured.id,
      organisationId: ORG,
      evidenceType: "measured_process_time",
      reference: "stopwatch-2026-09",
      note: null,
      actorUserId: MANAGER,
    });
    await verifySavingsCase(store, audit, {
      savingsCaseId: measured.id,
      organisationId: ORG,
      actorUserId: DIRECTOR,
      actorRoles: ["director"],
      reason: null,
    });
    // A second case that never got past Potential must contribute nothing.
    await aCase("waste-2");

    const totals = await getVerifiedSavingsTotals(store, ORG);
    expect(totals.verifiedMinutesReleased).toBe(10);
    expect(totals.verifiedAmountCents).toBe(750);
    expect(totals.potentialCaseCount).toBe(1);
    expect(totals.annualisedRunRateAmountCents).toBe(39000);
  });
});
