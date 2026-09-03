import type { AuditSink } from "@psych-savings/audit";
import { buildAuditEvent } from "@psych-savings/audit";
import { canVerifySavingsCase } from "@psych-savings/permissions";
import { SAVINGS_STATES, type Role, type SavingsState } from "@psych-savings/shared-types";
import { calculateSaving } from "./calculate";
import type { CreateBaselineInput, SavingsCasePatch, SavingsStore } from "./store";
import type { SavingsBaseline, SavingsCase, SavingsEvidence } from "./types";

export class SavingsError extends Error {}

/**
 * Enforces "A savings case may only move forward one state at a time"
 * (docs/product/SAVINGS_MEASUREMENT_CONTRACT.md). Skipping a state is
 * how an unmeasured figure would reach a dashboard total, so it is
 * refused here rather than validated per-transition.
 */
function assertTransition(from: SavingsState, to: SavingsState): void {
  const fromIndex = SAVINGS_STATES.indexOf(from);
  const toIndex = SAVINGS_STATES.indexOf(to);
  if (toIndex !== fromIndex + 1) {
    throw new SavingsError(`cannot move a savings case from ${from} to ${to}`);
  }
}

async function loadOpenCase(store: SavingsStore, id: string, organisationId: string): Promise<SavingsCase> {
  const existing = await store.getCase(id, organisationId);
  if (!existing) throw new SavingsError("savings case not found");
  if (existing.closedAt !== null) throw new SavingsError("savings case is closed");
  return existing;
}

/**
 * Applies a state transition: patch, append-only history row, audit
 * event. Every transition in this file goes through here so none can
 * quietly skip the history the contract's audit trail depends on.
 */
async function transition(
  store: SavingsStore,
  audit: AuditSink,
  existing: SavingsCase,
  toState: SavingsState,
  patch: SavingsCasePatch,
  actorUserId: string,
  reason: string | null,
): Promise<SavingsCase> {
  assertTransition(existing.state, toState);
  const updated = await store.updateCase(existing.id, existing.organisationId, { ...patch, state: toState });
  await store.recordStateChange({
    organisationId: existing.organisationId,
    savingsCaseId: existing.id,
    changedByUserId: actorUserId,
    fromState: existing.state,
    toState,
    reason,
  });
  await audit.write(
    buildAuditEvent({
      organisationId: existing.organisationId,
      actorUserId,
      action: `savings_case_${toState}`,
      entityType: "savings_case",
      entityId: existing.id,
      priorState: { state: existing.state },
      newState: { state: toState },
      reason,
      source: "api",
    }),
  );
  return updated;
}

export async function createBaseline(
  store: SavingsStore,
  audit: AuditSink,
  input: CreateBaselineInput,
): Promise<SavingsBaseline> {
  if (input.baselineMinutes === null && input.baselineAmountCents === null) {
    throw new SavingsError("a baseline must record minutes, an amount, or both");
  }
  if (!input.method.trim()) throw new SavingsError("a baseline must record how it was measured");
  if (input.measuredTo < input.measuredFrom) throw new SavingsError("baseline period ends before it starts");

  const baseline = await store.createBaseline(input);
  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.createdByUserId,
      action: "savings_baseline_recorded",
      entityType: "savings_baseline",
      entityId: baseline.id,
      newState: {
        category: baseline.category,
        baselineMinutes: baseline.baselineMinutes,
        baselineAmountCents: baseline.baselineAmountCents,
        recurrence: baseline.recurrence,
      },
      source: "api",
    }),
  );
  return baseline;
}

export interface OpenSavingsCaseInput {
  organisationId: string;
  title: string;
  baselineId: string;
  interventionId: string | null;
  sourceEntityType: string;
  sourceEntityId: string;
  actorUserId: string;
}

/**
 * Opens a case in Potential. The category is taken from the baseline
 * rather than passed in, so a case can never be measured with a formula
 * its own before-state was not measured for.
 */
export async function openSavingsCase(
  store: SavingsStore,
  audit: AuditSink,
  input: OpenSavingsCaseInput,
): Promise<SavingsCase> {
  const baseline = await store.getBaseline(input.baselineId, input.organisationId);
  if (!baseline) throw new SavingsError("baseline not found");

  // Anti-double-counting rule 1, checked here as well as by the database's
  // partial unique index, so the API returns a comprehensible error
  // instead of a constraint violation.
  const existing = await store.listCases(input.organisationId, {
    sourceEntityType: input.sourceEntityType,
    sourceEntityId: input.sourceEntityId,
    category: baseline.category,
  });
  if (existing.length > 0) {
    throw new SavingsError(
      `${input.sourceEntityType} ${input.sourceEntityId} already has an open ${baseline.category} savings case`,
    );
  }

  const created = await store.createCase({
    organisationId: input.organisationId,
    title: input.title,
    category: baseline.category,
    baselineId: baseline.id,
    interventionId: input.interventionId,
    sourceEntityType: input.sourceEntityType,
    sourceEntityId: input.sourceEntityId,
    createdByUserId: input.actorUserId,
  });

  await store.recordStateChange({
    organisationId: input.organisationId,
    savingsCaseId: created.id,
    changedByUserId: input.actorUserId,
    fromState: null,
    toState: "potential",
    reason: "case opened",
  });
  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.actorUserId,
      action: "savings_case_potential",
      entityType: "savings_case",
      entityId: created.id,
      newState: { category: created.category, sourceEntityId: created.sourceEntityId },
      source: "api",
    }),
  );
  return created;
}

export interface ApproveSavingsCaseInput {
  savingsCaseId: string;
  organisationId: string;
  actorUserId: string;
  actorRoles: readonly Role[];
  reason: string | null;
}

/**
 * Potential → Approved. "An authorised manager has reviewed the proposed
 * intervention and accepted it as worth doing... Practice
 * manager/operations lead or director only" — reception and clinician
 * roles can raise a case but cannot approve their own proposal.
 */
export async function approveSavingsCase(
  store: SavingsStore,
  audit: AuditSink,
  input: ApproveSavingsCaseInput,
  now: Date = new Date(),
): Promise<SavingsCase> {
  if (!input.actorRoles.some((role) => role === "director" || role === "manager")) {
    throw new SavingsError("only a director or manager may approve a savings case");
  }
  const existing = await loadOpenCase(store, input.savingsCaseId, input.organisationId);
  return transition(
    store,
    audit,
    existing,
    "approved",
    { approvedByUserId: input.actorUserId, approvedAt: now },
    input.actorUserId,
    input.reason,
  );
}

export interface ImplementSavingsCaseInput {
  savingsCaseId: string;
  organisationId: string;
  actorUserId: string;
  reason: string | null;
}

/** Approved → Implemented: the intervention was actually carried out, by this person. */
export async function implementSavingsCase(
  store: SavingsStore,
  audit: AuditSink,
  input: ImplementSavingsCaseInput,
  now: Date = new Date(),
): Promise<SavingsCase> {
  const existing = await loadOpenCase(store, input.savingsCaseId, input.organisationId);
  return transition(
    store,
    audit,
    existing,
    "implemented",
    { implementedByUserId: input.actorUserId, implementedAt: now },
    input.actorUserId,
    input.reason,
  );
}

export interface MeasureSavingsCaseInput {
  savingsCaseId: string;
  organisationId: string;
  actorUserId: string;
  postMinutes: number | null;
  postAmountCents: number | null;
  /** Only when converting released time to money; the time measure is kept regardless. */
  labourRateCentsPerHour: number | null;
}

/**
 * Implemented → Measured. The caller supplies the observed after-state
 * and nothing else: the released/avoided figures are computed here from
 * the persisted baseline, which is what makes "never a manual dashboard
 * override" true in code rather than only in the contract.
 */
export async function measureSavingsCase(
  store: SavingsStore,
  audit: AuditSink,
  input: MeasureSavingsCaseInput,
  now: Date = new Date(),
): Promise<SavingsCase> {
  const existing = await loadOpenCase(store, input.savingsCaseId, input.organisationId);
  const baseline = await store.getBaseline(existing.baselineId, input.organisationId);
  if (!baseline) throw new SavingsError("baseline not found");

  const calculation = calculateSaving(
    baseline,
    { postMinutes: input.postMinutes, postAmountCents: input.postAmountCents },
    input.labourRateCentsPerHour,
  );

  return transition(
    store,
    audit,
    existing,
    "measured",
    {
      postMinutes: input.postMinutes,
      postAmountCents: input.postAmountCents,
      postMeasuredAt: now,
      measuredAt: now,
      measuredMinutesReleased: calculation.minutesReleased,
      measuredAmountCents: calculation.amountCents,
      annualisedMinutesReleased: calculation.annualisedMinutesReleased,
      annualisedAmountCents: calculation.annualisedAmountCents,
      labourRateCentsPerHour: input.labourRateCentsPerHour,
    },
    input.actorUserId,
    "measured from persisted baseline and post-intervention measurement",
  );
}

export interface VerifySavingsCaseInput {
  savingsCaseId: string;
  organisationId: string;
  actorUserId: string;
  actorRoles: readonly Role[];
  reason: string | null;
}

/**
 * Measured → Verified, the only state a figure may be reported from.
 * Two independent gates, both from the contract: the actor must hold
 * verification rights and must not be verifying their own implementation
 * (packages/permissions canVerifySavingsCase), and the case must carry
 * at least one evidence record — "No saving may be counted anywhere in a
 * dashboard total without a calculation method, a baseline and
 * evidence."
 */
export async function verifySavingsCase(
  store: SavingsStore,
  audit: AuditSink,
  input: VerifySavingsCaseInput,
  now: Date = new Date(),
): Promise<SavingsCase> {
  const existing = await loadOpenCase(store, input.savingsCaseId, input.organisationId);
  if (existing.implementedByUserId === null) {
    throw new SavingsError("a savings case cannot be verified before it has been implemented");
  }

  const permitted = input.actorRoles.some((role) =>
    canVerifySavingsCase(role, input.actorUserId, existing.implementedByUserId!),
  );
  if (!permitted) {
    throw new SavingsError("this user may not verify this savings case");
  }

  const evidence = await store.listEvidence(input.savingsCaseId, input.organisationId);
  if (evidence.length === 0) {
    throw new SavingsError("a savings case cannot be verified without evidence");
  }

  return transition(
    store,
    audit,
    existing,
    "verified",
    { verifiedByUserId: input.actorUserId, verifiedAt: now },
    input.actorUserId,
    input.reason,
  );
}

export interface AddSavingsEvidenceInput {
  savingsCaseId: string;
  organisationId: string;
  evidenceType: SavingsEvidence["evidenceType"];
  reference: string | null;
  note: string | null;
  actorUserId: string;
}

export async function addSavingsEvidence(
  store: SavingsStore,
  audit: AuditSink,
  input: AddSavingsEvidenceInput,
): Promise<SavingsEvidence> {
  const existing = await loadOpenCase(store, input.savingsCaseId, input.organisationId);
  const evidence = await store.addEvidence({
    organisationId: input.organisationId,
    savingsCaseId: existing.id,
    evidenceType: input.evidenceType,
    reference: input.reference,
    note: input.note,
    createdByUserId: input.actorUserId,
  });
  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.actorUserId,
      action: "savings_evidence_added",
      entityType: "savings_case",
      entityId: existing.id,
      newState: { evidenceType: input.evidenceType, reference: input.reference },
      source: "api",
    }),
  );
  return evidence;
}

export interface CloseSavingsCaseInput {
  savingsCaseId: string;
  organisationId: string;
  actorUserId: string;
  reason: string;
}

/**
 * A case can be rejected or abandoned at any state with a reason, and is
 * never silently deleted. Closing also releases the anti-double-counting
 * slot so the same underlying event can be reconsidered later.
 */
export async function closeSavingsCase(
  store: SavingsStore,
  audit: AuditSink,
  input: CloseSavingsCaseInput,
  now: Date = new Date(),
): Promise<SavingsCase> {
  if (!input.reason.trim()) throw new SavingsError("a close reason is required");
  const existing = await loadOpenCase(store, input.savingsCaseId, input.organisationId);
  const updated = await store.updateCase(existing.id, input.organisationId, {
    closeReason: input.reason,
    closedAt: now,
  });
  await store.recordStateChange({
    organisationId: input.organisationId,
    savingsCaseId: existing.id,
    changedByUserId: input.actorUserId,
    fromState: existing.state,
    toState: existing.state,
    reason: `closed: ${input.reason}`,
  });
  await audit.write(
    buildAuditEvent({
      organisationId: input.organisationId,
      actorUserId: input.actorUserId,
      action: "savings_case_closed",
      entityType: "savings_case",
      entityId: existing.id,
      priorState: { state: existing.state },
      reason: input.reason,
      source: "api",
    }),
  );
  return updated;
}

export interface VerifiedSavingsTotals {
  verifiedMinutesReleased: number;
  verifiedAmountCents: number;
  potentialCaseCount: number;
  /** Run-rate, kept out of the verified totals above by construction. */
  annualisedRunRateAmountCents: number;
  annualisedRunRateMinutesReleased: number;
}

/**
 * Totals for reporting. Only Verified cases contribute to the verified
 * figures; everything else is counted, not valued. The annualised
 * run-rate is returned as its own field and is never added into the
 * verified totals ("Dashboard totals" in the contract). Phase 16 builds
 * the month/quarter/year roll-ups on top of this.
 */
export async function getVerifiedSavingsTotals(
  store: SavingsStore,
  organisationId: string,
): Promise<VerifiedSavingsTotals> {
  const cases = await store.listCases(organisationId, {});
  const totals: VerifiedSavingsTotals = {
    verifiedMinutesReleased: 0,
    verifiedAmountCents: 0,
    potentialCaseCount: 0,
    annualisedRunRateAmountCents: 0,
    annualisedRunRateMinutesReleased: 0,
  };

  for (const c of cases) {
    if (c.state !== "verified") {
      totals.potentialCaseCount++;
      continue;
    }
    totals.verifiedMinutesReleased += c.measuredMinutesReleased ?? 0;
    totals.verifiedAmountCents += c.measuredAmountCents ?? 0;
    totals.annualisedRunRateMinutesReleased += c.annualisedMinutesReleased ?? 0;
    totals.annualisedRunRateAmountCents += c.annualisedAmountCents ?? 0;
  }

  return totals;
}
