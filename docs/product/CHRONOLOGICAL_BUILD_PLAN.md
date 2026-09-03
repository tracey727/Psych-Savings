# Exact Chronological Build Plan
## Golden Rule
Build **one phase at a time**. Do not begin the next phase until the current **GREEN GATE** is passed and recorded.

## Phase 0 — Directive & IP Freeze
1. Create the canonical product contract.
2. Freeze the Irene-specific purpose: save the practice money; do not turn this into a client budgeting product.
3. Freeze core module names and scope.
4. Record product/IP ownership, pilot licence terms and authorised environments.
5. Record platform rule: GitHub + Cloudflare + Neon.
6. Record synthetic-data-only rule for build/test.
7. Create feature register and change-control log.

**GREEN GATE:** Signed/frozen product contract; no duplicate competing product; feature register versioned.

## Phase 1 — Current-State Loss Map
1. Map the present referral journey from receipt to booked/closed.
2. Map reception callback/follow-up process.
3. Map cancellation/no-show handling.
4. Map staff task handovers and leave cover.
5. Map repetitive admin activities.
6. Map recurring subscriptions/suppliers worth reviewing.
7. Identify where ownership disappears.
8. Create baseline KPI definitions without yet claiming savings.

**GREEN GATE:** Every target loss type has a defined current-state process, owner and measurable baseline.

## Phase 2 — Savings Measurement Contract
1. Define recovered revenue vs avoided cost vs released staff time.
2. Define calculation formulas.
3. Define evidence required for each category.
4. Define anti-double-counting rules.
5. Define Potential → Approved → Implemented → Measured → Verified lifecycle.
6. Define who may verify significant savings.

**GREEN GATE:** No savings can be counted without a calculation method, baseline and evidence rule.

## Phase 3 — Information Architecture & Role Matrix
1. Define organisation and centre boundaries.
2. Define director, manager, reception/admin, clinician and technical-admin permissions.
3. Define what each role can see, create, update, transfer, close and verify.
4. Separate operational data from clinical data.
5. Define dashboard navigation and queue structure.

**GREEN GATE:** Role matrix approved; no role receives unnecessary access.

## Phase 4 — Repository & Environment Foundation
1. Create private GitHub repository.
2. Create protected main branch and development workflow.
3. Create app/API/database/docs structure.
4. Create Cloudflare development and preview environments.
5. Create Neon development/test branches.
6. Create secrets policy; no secrets committed.
7. Add dependency locking, linting, tests and CI checks.

**GREEN GATE:** Clean install succeeds; CI passes; protected main exists; preview environment works with synthetic data.

## Phase 5 — Authoritative Database Spine
1. Implement organisation/centre/user/role schema.
2. Implement work-item ownership, due-date, transfer, escalation and audit tables.
3. Implement append-only material state history.
4. Add tenant isolation constraints.
5. Add seed data for synthetic practice, staff and referrals.
6. Create migration discipline and rollback plan.

**GREEN GATE:** Fresh database can be created from migrations; tenant/role isolation tests pass.

## Phase 6 — Authentication, Authorisation & Audit
1. Implement secure sign-in.
2. Implement privileged MFA policy.
3. Implement session expiry/revocation.
4. Enforce role/centre permissions server-side.
5. Use least-privilege Neon runtime role.
6. Implement audit events for material reads/writes/exports where required.
7. Add rate limiting, lockout and abuse controls.

**GREEN GATE:** Unauthorised cross-user/cross-centre access is denied by API and database controls.

## Phase 7 — Core Work Ownership Engine
1. Build generic work_item engine.
2. Require one current owner for active work.
3. Build due dates, priorities and next actions.
4. Build transfer-with-acceptance.
5. Build Green/Amber/Red/Recovery state logic.
6. Build escalation queue.
7. Build close/reopen with reason and history.

**GREEN GATE:** An active item cannot silently lose ownership; overdue/transfer scenarios pass automated tests.

## Phase 8 — No Lost Referral™
1. Create referral intake.
2. Assign owner immediately.
3. Create first-contact and follow-up deadlines.
4. Record contact attempts and outcomes.
5. Create waiting/booked/declined/not-suitable statuses.
6. Create overdue referral alerts.
7. Capture referral value estimate and final result.
8. Create lost-referral reason reporting.

**GREEN GATE:** Every synthetic referral is traceable from receipt to final outcome with no invisible state.

## Phase 9 — Reception Flow & Follow-up
1. Build reception queue.
2. Build callback/follow-up queues.
3. Add standard action/status choices.
4. Show due, overdue and priority items.
5. Add contact attempt history.
6. Add team-level workload visibility without exposing unnecessary sensitive content.

**GREEN GATE:** Reception can work from one authoritative queue and no synthetic callback disappears.

## Phase 10 — Appointment Leakage & Refill
1. Capture cancellation/no-show events.
2. Create vacancy window.
3. Link vacancy to approved waiting/refill workflow.
4. Record outreach attempts.
5. Record replacement booking outcome.
6. Calculate recovered appointment value.
7. Add repeated leakage pattern reporting.

**GREEN GATE:** Cancelled capacity can be tracked from vacancy to refill/no-refill and recovered value is auditable.

## Phase 11 — Leave, Handover & Absence Continuity
1. Create planned leave handover.
2. Create unexpected absence reassignment.
3. Require temporary owner acceptance.
4. Create return-from-leave briefing.
5. Escalate unaccepted critical handovers.
6. Measure repeated/recovered work caused by absence.

**GREEN GATE:** No active priority work is orphaned during synthetic leave/absence tests.

## Phase 12 — Staff Time Waste & Duplication
1. Create quick waste-event capture.
2. Categorise duplicate work, rework, searching, waiting, manual entry, wrong-role work and unnecessary approval.
3. Record estimated minutes and recurrence.
4. Create root-cause review.
5. Create intervention workflow.
6. Measure before/after staff time.

**GREEN GATE:** At least one end-to-end synthetic waste case reaches Verified savings with evidence.

## Phase 13 — Capacity & Utilisation
1. Create capacity snapshots.
2. Compare appointment capacity, demand and waiting demand.
3. Identify avoidable idle-capacity events.
4. Separate legitimate spare capacity from recoverable capacity.
5. Report utilisation trends without punitive staff ranking.

**GREEN GATE:** Capacity metrics reconcile to synthetic source data and do not misclassify approved/non-working time.

## Phase 14 — Recurring Cost & Supplier Waste
1. Create recurring-cost register.
2. Capture renewal dates and service owners.
3. Flag duplicate/unused costs.
4. Create keep/cancel/renegotiate review.
5. Record implemented saving and evidence.

**GREEN GATE:** Annualised cost reductions are derived from recorded before/after values and evidence.

## Phase 15 — Systemic Pattern, Waste & Prevention Command
1. Group repeated referral, appointment, staff-time and cost events.
2. Rank patterns by verified/estimated impact.
3. Create prevention action.
4. Assign owner and due date.
5. Measure intervention effectiveness.
6. Prevent savings double-counting.

**GREEN GATE:** Repeated synthetic events can be grouped, corrected and measured without corrupting individual event history.

## Phase 16 — Verified Savings Ledger
1. Build savings case record.
2. Link source event(s), baseline, calculation and evidence.
3. Implement Potential/Approved/Implemented/Measured/Verified states.
4. Add verifier permissions.
5. Separate recovered revenue, avoided cost and released staff time.
6. Create month, quarter and year summaries.

**GREEN GATE:** Dashboard total can be reconstructed from underlying verified cases.

## Phase 17 — Irene Director Command Dashboard
1. Build executive overview.
2. Show money at risk, money recovered, verified savings and unresolved Red items.
3. Show lost-referral funnel.
4. Show cancellation/refill recovery.
5. Show staff-time waste trends.
6. Show top systemic waste patterns.
7. Show actions awaiting Irene/manager decision.
8. Allow drill-down from totals to evidence.

**GREEN GATE:** Every headline number is traceable; no dashboard value is a disconnected calculation.

## Phase 18 — Alerts, Notifications & Accountability
1. Configure alert rules.
2. Create in-app notifications.
3. Add escalation paths by severity.
4. Create digest options to avoid alert fatigue.
5. Add acknowledgement and action tracking.
6. Test duplicate alert suppression.

**GREEN GATE:** Critical synthetic events alert the correct role once, escalate correctly and remain auditable.

## Phase 19 — Full Regression, Security, Load & UAT
1. Run unit/integration/end-to-end tests.
2. Run permission/tenant isolation tests.
3. Run migration-from-zero test.
4. Run audit-history integrity tests.
5. Run load tests for expected practice growth.
6. Run mobile/tablet/desktop usability checks.
7. Run synthetic UAT with Irene/practice representatives.
8. Fix all critical/high findings before release.

**GREEN GATE:** No critical/high defects; all core workflows GREEN; UAT sign-off recorded.

## Phase 20 — Production Deployment & Controlled Pilot
1. Create production Neon branch/database.
2. Create production least-privilege runtime role.
3. Connect Cloudflare production API through approved connection path.
4. Configure production secrets.
5. Deploy through protected main.
6. Run production smoke tests with non-sensitive/synthetic records first.
7. Enable pilot users gradually.
8. Monitor errors, queues and access events.
9. Do not import real operational data until governance, security and migration readiness are confirmed.

**GREEN GATE:** Production environment healthy; pilot access controlled; monitoring and rollback ready.

## Phase 21 — Baseline Period & First Verified Savings
1. Collect agreed baseline period.
2. Record real operational events under approved governance.
3. Validate data quality.
4. Implement first small process interventions.
5. Measure before/after results.
6. Verify savings evidence.

**GREEN GATE:** First verified savings cases completed without double-counting or unsupported assumptions.

## Phase 22 — Scale, Optimise & Prevent
1. Review patterns monthly.
2. Retire low-value alerts.
3. Automate stable repetitive workflows.
4. Refine staffing/process decisions from verified evidence.
5. Create quarterly savings review.
6. Maintain feature register and change control.
7. Re-test security and permissions after material changes.

**GREEN GATE:** System operates as a continuous prevention and savings-control cycle, not a one-off audit.
