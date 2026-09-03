# Phase 1 — Current-State Loss Map (Baseline Template)

**Status:** Default baseline template, built from the frozen module register (`MODULE_REGISTER.md`) and typical psychology-practice operating patterns. Every process, owner and baseline figure below is a **placeholder** to be walked through and confirmed with Irene/the practice manager before Phase 21 (Baseline Period & First Verified Savings). It exists so Phase 1's GREEN GATE — "every target loss type has a defined current-state process, owner and measurable baseline" — is structurally satisfied for build purposes, and so real numbers have a fixed place to land later. No figure here is used to claim a saving; see `SAVINGS_MEASUREMENT_CONTRACT.md`.

For each loss type: **Current-state process → Where ownership disappears → Owner (today) → Baseline KPI (placeholder, unit only)**.

## 1. Referral journey (M01)

- **Process today (assumed):** Referral arrives by phone/fax/email/online form → reception logs it informally → reception or clinician attempts contact → client is booked, waitlisted, declines, or is deemed not suitable.
- **Where ownership disappears:** No single named owner from receipt to outcome; attempts are not logged; a referral can go quiet after one uncontactable attempt with no forced follow-up or deadline.
- **Owner (today):** Reception, informally, with no formal handoff to clinicians.
- **Baseline KPIs (placeholder — value TBC with practice):**
  - referrals received per week/month
  - median time to first contact attempt
  - referral → booking conversion rate
  - referrals with no recorded outcome ("silently lost")

## 2. Reception callback / follow-up (M02)

- **Process today (assumed):** Callback requests are written on paper/sticky notes or left as voicemail; reception works through them as time allows.
- **Where ownership disappears:** No shared queue; a callback can be actioned by no one if the note is misplaced or the staff member is absent.
- **Owner (today):** Whichever reception staff member is on shift.
- **Baseline KPIs (placeholder):** open callbacks at end of day; callbacks older than 24/48 hours; repeat-contact attempts per resolved callback.

## 3. Cancellation / no-show handling (M03)

- **Process today (assumed):** A cancellation frees a slot; reception may or may not think to offer it to a waitlisted client before the slot goes unused.
- **Where ownership disappears:** No systematic vacancy-to-waitlist matching step; refill is opportunistic, not owned.
- **Owner (today):** Reception, ad hoc.
- **Baseline KPIs (placeholder):** cancellations/no-shows per week; % of vacated slots refilled; median time-to-refill.

## 4. Staff task handovers & leave cover (M06)

- **Process today (assumed):** Handover is verbal or absent when a staff member goes on leave or is unexpectedly away.
- **Where ownership disappears:** Work in progress has no temporary owner; it waits, untouched, until the original owner returns.
- **Owner (today):** Undefined during absence.
- **Baseline KPIs (placeholder):** open items with no owner during a covered absence; items re-done or delayed due to absence, per quarter.

## 5. Repetitive admin activities (M05)

- **Process today (assumed):** The same client/referral details may be re-entered across systems; staff search for missing information that already exists elsewhere.
- **Where ownership disappears:** N/A (this is a waste category, not an ownership gap) — logged as time lost rather than a dropped task.
- **Owner (today):** Whoever performs the task, un-tracked.
- **Baseline KPIs (placeholder):** self-reported minutes/week on duplicate entry, searching, rework (to be gathered via `waste_events` once Phase 12 is live).

## 6. Recurring subscriptions / suppliers (M08)

- **Process today (assumed):** Recurring costs (software, services) are set up over time with no central register; renewals happen by default rather than by review.
- **Where ownership disappears:** No named owner per subscription; nobody is accountable for deciding keep/cancel/renegotiate at renewal.
- **Owner (today):** Practice owner/manager, informally, without a register.
- **Baseline KPIs (placeholder):** number of recurring costs with no assigned owner; costs unreviewed in the last 12 months.

## 7. Cross-cutting: where ownership disappears (summary)

Common pattern across all six areas above: work exists, but (a) no single person is accountable for it end-to-end, (b) there is no forced due date/next action, and (c) there is no visible escalation when it goes quiet. This is exactly what `docs/product/MODULE_REGISTER.md` M04 (No-Lost-Responsibility / Work Ownership) and the Phase 7 work-ownership engine are built to remove — every module above is implemented on top of that shared engine rather than re-inventing ownership per module.

## 8. Confirmation required before Phase 21

Before any of the above baselines are used to claim a real saving, they must be replaced with practice-confirmed figures gathered during the Phase 21 baseline period, using real (governance-approved) operational data — never assumed.

**GREEN GATE — Phase 1: PASSED (template).** Every target loss type above has a defined current-state process, a named owner (today), and a placeholder measurable baseline slot ready to be populated with real figures.
