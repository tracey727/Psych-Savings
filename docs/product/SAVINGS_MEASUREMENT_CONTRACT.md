# Phase 2 — Savings Measurement Contract

## Principle
The system must distinguish between **possible savings** and **proved savings**. No saving may be counted anywhere in a dashboard total without a calculation method, a baseline and evidence, as defined below.

## Value categories (frozen)
Every savings case must be tagged with exactly one of:
- **Recovered revenue** (Category A)
- **Avoided revenue leakage** (Category B)
- **Avoided operating cost** (Category C)
- **Released staff time** (Category D)

## Category A — Recovered revenue
Example: a cancelled appointment was refilled.

Calculation:
`recovered revenue = verified replacement appointment value actually achieved`

Do not count an appointment merely because a candidate was contacted.

## Category B — Avoided revenue leakage
Example: a referral at risk was recovered and converted.

Calculation should use the approved practice revenue/value methodology and avoid assuming that every referral would have converted.

## Category C — Avoided operating cost
Example: unused software subscription cancelled.

Calculation:
`verified saving = old recurring cost - new recurring cost`
for the verified period, with annualisation shown separately.

## Category D — Released staff time
Example: a repetitive admin task falls from 15 minutes to 5 minutes.

Calculation:
`minutes released = baseline minutes - post-intervention minutes`

If converting time to dollars:
- use an approved labour-value methodology;
- keep the original time measure visible;
- do not imply cash was saved unless payroll expenditure actually fell.

## Evidence hierarchy
Strong evidence includes:
- invoice;
- subscription bill;
- appointment outcome;
- actual booking/payment record;
- measured process time;
- system event timestamps;
- approved staffing/cost baseline.

## Double-counting controls
A single underlying event must not inflate two headline totals.

Example:
If a referral is saved and becomes a booked appointment, define whether the headline records:
- recovered referral value;
- recovered appointment revenue;
- or a controlled allocation.

The rules must be frozen before reporting.

## Dashboard totals
Show separately:
- verified recovered revenue;
- verified avoided cost;
- verified released staff hours;
- potential/unverified value;
- annualised run-rate (clearly labelled);
- total verified benefit.

## Required audit trail
Every verified saving links back to:
1. source event;
2. baseline;
3. calculation;
4. intervention;
5. measured outcome;
6. evidence;
7. verifier;
8. verification date.

## Savings lifecycle (frozen)

`Potential → Approved → Implemented → Measured → Verified`

| State | Meaning | Who moves it here |
|---|---|---|
| **Potential** | A possible saving has been identified from an operational event (referral, cancellation, waste event, cost review, pattern). No value is claimed yet. | Any user whose role can create work items in the relevant domain (system may also propose it automatically from a pattern — Phase 15). |
| **Approved** | An authorised manager has reviewed the proposed intervention and accepted it as worth doing. | Practice manager/operations lead or director only. |
| **Implemented** | The intervention was actually carried out (e.g. subscription cancelled, process changed, referral converted). | The assigned owner of the intervention. |
| **Measured** | The actual financial or time impact has been calculated against the baseline, using the category formula above. | System calculation, from persisted before/after data — never a manual dashboard override. |
| **Verified** | An authorised verifier has reviewed the calculation and evidence and confirms it is sound. | Verifier role only (§ below) — never the same person who implemented the intervention, for cases above the material-value threshold set in `docs/architecture/ROLE_MATRIX.md`. |

A savings case may only move forward one state at a time, and every transition is an append-only audit event (actor, timestamp, prior state, new state, reason/evidence reference) — see `docs/security/SECURITY_PRIVACY_GOVERNANCE.md` "Audit requirements". A case can be rejected/closed at any state with a reason; it is never silently deleted.

## Who may verify significant savings

- **Director (Irene) or Practice manager/operations lead** may verify any savings case.
- A savings case above a material-value threshold (default: any case; the exact dollar/hours threshold is configured per organisation, not hard-coded) additionally requires that the verifier is **not** the same user who was the owner of the Implemented step, to prevent self-verification.
- Reception/admin and clinician roles may create and progress Potential/Implemented work but cannot self-verify.
- Technical administrators have no verification rights — verification is a business decision, not a system-access decision (`PRODUCT_CONTRACT.md` §3, §5.9).

## Anti-double-counting rules (frozen)

1. A single underlying operational event (e.g. one referral, one cancellation) may be linked to at most one savings case per value category (A–D). It may appear in more than one category only where the categories represent genuinely distinct value (e.g. a recovered referral that also released staff time by avoiding rework) — the split must be explicit on the savings case, never implied.
2. A savings case's baseline must reference a specific, persisted before-state (a `savings_baselines` record) — never an assumed or estimated figure typed directly into a total.
3. Systemic-pattern savings (Phase 15) that group multiple individual events must subtract any value already counted on those individual events' own savings cases, so the pattern-level saving reflects only the incremental prevention benefit, not a re-count.
4. Annualised/run-rate figures are always shown separately from verified actuals and are never summed into the "verified" total (`Dashboard totals` above).
