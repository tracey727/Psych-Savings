import type { HealthState } from "@psych-savings/shared-types";
import type { WorkItem } from "./types";

/** How far ahead of a due date an item turns Amber, per PRODUCT_CONTRACT.md §6. */
export const DEFAULT_AMBER_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isOverdue(dueAt: Date | null, now: Date): boolean {
  return dueAt !== null && dueAt.getTime() < now.getTime();
}

/**
 * Pure state-transition function implementing PRODUCT_CONTRACT.md §6 and
 * OPERATING_MODEL.md's escalation rule ("The system changes state as
 * risk increases ... based on configurable rules, not hidden logic").
 *
 * - Red: an open, unresolved escalation exists, or the due date has passed.
 * - Amber: due date is within the amber window but not yet passed.
 * - Green: neither of the above.
 * - Recovery: sticky — once an item enters Recovery it stays there until
 *   the underlying problem actually clears (no open escalations AND not
 *   overdue), matching OPERATING_MODEL.md: "Corrective action is
 *   actively underway after a Red event" is a deliberate state a person
 *   enters (see engine.ts beginRecovery), not something time alone can
 *   produce or silently exit.
 */
export function nextHealthState(
  current: HealthState,
  input: { dueAt: Date | null; now: Date; openEscalationCount: number; amberWindowMs?: number },
): HealthState {
  const amberWindowMs = input.amberWindowMs ?? DEFAULT_AMBER_WINDOW_MS;
  const overdue = isOverdue(input.dueAt, input.now);
  const clear = !overdue && input.openEscalationCount === 0;

  if (current === "recovery") {
    return clear ? "green" : "recovery";
  }

  if (input.openEscalationCount > 0 || overdue) return "red";

  if (input.dueAt !== null && input.dueAt.getTime() - input.now.getTime() <= amberWindowMs) {
    return "amber";
  }

  return "green";
}

export function recalculateWorkItemHealth(
  item: Pick<WorkItem, "healthState" | "dueAt">,
  now: Date,
  openEscalationCount: number,
  amberWindowMs: number = DEFAULT_AMBER_WINDOW_MS,
): HealthState {
  return nextHealthState(item.healthState, { dueAt: item.dueAt, now, openEscalationCount, amberWindowMs });
}
