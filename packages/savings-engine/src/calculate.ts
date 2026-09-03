import { OCCURRENCES_PER_YEAR, type SavingsCategory } from "@psych-savings/shared-types";
import type { SavingsBaseline } from "./types";

export class SavingsCalculationError extends Error {}

export interface PostMeasurement {
  postMinutes: number | null;
  postAmountCents: number | null;
}

export interface SavingsCalculation {
  /** Always present for released_staff_time; null for the money categories. */
  minutesReleased: number | null;
  amountCents: number | null;
  /**
   * Run-rate, shown separately and never summed into a verified total
   * (SAVINGS_MEASUREMENT_CONTRACT.md "Dashboard totals"). Null for a
   * one-off: a saving that happens once has no annual run-rate, and
   * presenting one would be exactly the unsupported extrapolation the
   * contract exists to prevent.
   */
  annualisedMinutesReleased: number | null;
  annualisedAmountCents: number | null;
}

/**
 * The single place savings arithmetic happens
 * (docs/10_DEVELOPER_HANDOFF.md "No hidden calculations in UI-only
 * code"). Pure: it takes only the persisted baseline and the persisted
 * post-intervention measurement, which is what makes the contract's
 * "System calculation, from persisted before/after data — never a manual
 * dashboard override" enforceable rather than aspirational.
 *
 * A result may legitimately be negative — an intervention that made
 * things worse is a real finding, and rounding it up to zero would hide
 * it. Callers decide whether to close such a case rather than verify it.
 */
export function calculateSaving(
  baseline: SavingsBaseline,
  post: PostMeasurement,
  labourRateCentsPerHour: number | null = null,
): SavingsCalculation {
  const perOccurrence = calculatePerOccurrence(baseline.category, baseline, post, labourRateCentsPerHour);
  const occurrences = OCCURRENCES_PER_YEAR[baseline.recurrence];
  const annualise = baseline.recurrence !== "one_off";

  return {
    ...perOccurrence,
    annualisedMinutesReleased:
      annualise && perOccurrence.minutesReleased !== null ? perOccurrence.minutesReleased * occurrences : null,
    annualisedAmountCents:
      annualise && perOccurrence.amountCents !== null ? perOccurrence.amountCents * occurrences : null,
  };
}

function calculatePerOccurrence(
  category: SavingsCategory,
  baseline: SavingsBaseline,
  post: PostMeasurement,
  labourRateCentsPerHour: number | null,
): Pick<SavingsCalculation, "minutesReleased" | "amountCents"> {
  switch (category) {
    /**
     * Category D: `minutes released = baseline minutes - post-intervention minutes`.
     * The time measure is always returned, whether or not a labour rate
     * was supplied, so it stays visible next to any dollar figure — the
     * contract forbids implying cash was saved when only time was.
     */
    case "released_staff_time": {
      const baselineMinutes = required(baseline.baselineMinutes, "baseline minutes");
      const postMinutes = required(post.postMinutes, "post-intervention minutes");
      const minutesReleased = baselineMinutes - postMinutes;
      return {
        minutesReleased,
        amountCents:
          labourRateCentsPerHour === null ? null : Math.round((minutesReleased / 60) * labourRateCentsPerHour),
      };
    }

    /** Category C: `verified saving = old recurring cost - new recurring cost`. */
    case "avoided_operating_cost": {
      const before = required(baseline.baselineAmountCents, "baseline amount");
      const after = required(post.postAmountCents, "post-intervention amount");
      return { minutesReleased: null, amountCents: before - after };
    }

    /**
     * Categories A and B are not a subtraction. Recovered revenue is
     * "the verified replacement value actually achieved" — the achieved
     * figure itself. The baseline still has to exist (it records what
     * was at risk, and anti-double-counting rule 2 requires a persisted
     * before-state) but it is context, not a term in the sum.
     */
    case "recovered_revenue":
    case "avoided_revenue_leakage":
      return { minutesReleased: null, amountCents: required(post.postAmountCents, "achieved value") };
  }
}

function required(value: number | null, what: string): number {
  if (value === null) throw new SavingsCalculationError(`${what} is required for this savings category`);
  return value;
}
