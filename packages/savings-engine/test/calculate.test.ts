import { describe, expect, it } from "vitest";
import { calculateSaving, SavingsCalculationError } from "../src/calculate";
import type { SavingsBaseline } from "../src/types";

const BASE: Omit<SavingsBaseline, "category" | "baselineMinutes" | "baselineAmountCents" | "recurrence"> = {
  id: "baseline-1",
  organisationId: "org-1",
  method: "timed five occurrences with a stopwatch",
  measuredFrom: new Date("2026-08-01T00:00:00Z"),
  measuredTo: new Date("2026-08-31T00:00:00Z"),
  sourceReference: null,
  createdAt: new Date(),
  createdByUserId: "user-1",
};

describe("Category D — released staff time", () => {
  const baseline: SavingsBaseline = {
    ...BASE,
    category: "released_staff_time",
    baselineMinutes: 15,
    baselineAmountCents: null,
    recurrence: "weekly",
  };

  it("releases baseline minus post-intervention minutes", () => {
    const result = calculateSaving(baseline, { postMinutes: 5, postAmountCents: null });
    expect(result.minutesReleased).toBe(10);
    expect(result.annualisedMinutesReleased).toBe(520);
  });

  it("keeps the time measure visible even when converting to money", () => {
    const result = calculateSaving(baseline, { postMinutes: 5, postAmountCents: null }, 4500);
    expect(result.minutesReleased).toBe(10);
    expect(result.amountCents).toBe(750);
    expect(result.annualisedAmountCents).toBe(39000);
  });

  it("does not imply cash was saved when no labour rate was supplied", () => {
    const result = calculateSaving(baseline, { postMinutes: 5, postAmountCents: null });
    expect(result.amountCents).toBeNull();
    expect(result.annualisedAmountCents).toBeNull();
  });

  it("reports a negative release rather than hiding an intervention that made things worse", () => {
    const result = calculateSaving(baseline, { postMinutes: 25, postAmountCents: null });
    expect(result.minutesReleased).toBe(-10);
  });

  it("refuses to calculate without a post-intervention measurement", () => {
    expect(() => calculateSaving(baseline, { postMinutes: null, postAmountCents: null })).toThrow(
      SavingsCalculationError,
    );
  });

  it("gives a one-off no annual run-rate", () => {
    const oneOff: SavingsBaseline = { ...baseline, recurrence: "one_off" };
    const result = calculateSaving(oneOff, { postMinutes: 5, postAmountCents: null }, 4500);
    expect(result.minutesReleased).toBe(10);
    expect(result.annualisedMinutesReleased).toBeNull();
    expect(result.annualisedAmountCents).toBeNull();
  });
});

describe("Category C — avoided operating cost", () => {
  const baseline: SavingsBaseline = {
    ...BASE,
    category: "avoided_operating_cost",
    baselineMinutes: null,
    baselineAmountCents: 12000,
    recurrence: "monthly",
  };

  it("is old recurring cost minus new recurring cost", () => {
    const result = calculateSaving(baseline, { postMinutes: null, postAmountCents: 4000 });
    expect(result.amountCents).toBe(8000);
    expect(result.annualisedAmountCents).toBe(96000);
    expect(result.minutesReleased).toBeNull();
  });
});

describe("Categories A and B — revenue", () => {
  const baseline: SavingsBaseline = {
    ...BASE,
    category: "recovered_revenue",
    baselineMinutes: null,
    baselineAmountCents: 18000,
    recurrence: "one_off",
  };

  it("counts the value actually achieved, not the difference from what was at risk", () => {
    const result = calculateSaving(baseline, { postMinutes: null, postAmountCents: 18000 });
    expect(result.amountCents).toBe(18000);
  });

  it("refuses to count a recovery with no achieved value", () => {
    expect(() => calculateSaving(baseline, { postMinutes: null, postAmountCents: null })).toThrow(
      SavingsCalculationError,
    );
  });
});
