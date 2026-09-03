# Phase 3 — Information Architecture & Role Matrix

## 1. Tenancy boundaries

- **Organisation** — the top-level tenant. Each practice/business is one organisation. All data is organisation-scoped; there is no cross-organisation visibility, ever.
- **Centre** — a location or site within an organisation (e.g. multiple practice rooms/branches). A user is assigned to one or more centres within their organisation via `user_centre_assignments`. Centre scope restricts operational data (referrals, appointments, capacity) to the centres a user is assigned to, except for director/manager roles who may be granted all-centre visibility within their organisation.
- Every tenant-owned table carries an explicit `organisation_id`, and centre-scoped tables carry an explicit `centre_id` (per `docs/architecture/DATA_MODEL_BLUEPRINT.md` "Critical data rules").

## 2. Roles (frozen)

| Role | Description |
|---|---|
| **Director** | Practice owner (Irene). Full read access to all operational data and dashboards across the organisation. Can verify savings, approve interventions, manage roles. |
| **Manager** | Practice manager / operations lead. Delegated authority for day-to-day operations across assigned centres: approve interventions, verify savings (subject to self-verification rule), manage escalations, manage the recurring-cost register. |
| **Reception/Admin** | Front-line operational staff. Work the referral, callback, appointment-refill and handover queues for their assigned centre(s). Cannot verify savings or approve interventions above their own work. |
| **Clinician** | Only sees and acts on the operational items relevant to them (their own referrals/appointments/handovers). No visibility into other clinicians' workload beyond what team-workload views intentionally expose (`MODULE_REGISTER.md` M02). No clinical-note access — this product does not store clinical notes at all (`PRODUCT_CONTRACT.md` §2). |
| **Technical Administrator** | System configuration, user/role management, integrations. Explicitly **separated from business decision rights**: cannot approve interventions, cannot verify savings, cannot see more operational business content than required to administer the system (`PRODUCT_CONTRACT.md` §3). |

Roles are assigned per organisation via `user_role_assignments`; a user may hold different roles in different organisations, never a blended permission set within one organisation.

## 3. Permission matrix

Legend: **C**reate · **V**iew · **U**pdate · **T**ransfer · **Cl**ose · **Ve**rify

| Domain | Director | Manager | Reception/Admin | Clinician | Tech Admin |
|---|---|---|---|---|---|
| Referrals (M01) | C V U T Cl | C V U T Cl | C V U T Cl | V U (own) | — |
| Reception/follow-up queues (M02) | V | C V U T Cl | C V U T Cl | V (own) | — |
| Appointment vacancy/refill (M03) | V | C V U T Cl | C V U T Cl | V (own) | — |
| Work items / ownership engine (M04) | C V U T Cl | C V U T Cl | C V U T Cl | C V U T Cl (own scope) | — |
| Waste events (M05) | V | C V U T Cl | C V U | C V U (own) | — |
| Handovers/absence (M06) | V | C V U T Cl | C V U T | C V U T (own) | — |
| Capacity snapshots (M07) | V | C V U | V | V (own) | — |
| Recurring costs (M08) | V Ve | C V U Cl Ve | V | — | — |
| Systemic patterns/prevention (M09) | C V U | C V U Cl | V | V | — |
| Savings cases (M10) | C V U Ve | C V U Ve* | C V (own) | C V (own) | — |
| Director dashboard | V | V (assigned centres) | — | — | — |
| Audit log | V | V (assigned centres) | — | — | V (system-level only, no business content beyond what's needed to administer) |
| User/role/centre configuration | V | V | — | — | C V U |
| Alert rules/configuration | V | C V U | — | — | C V U |

\* Manager verification is subject to the self-verification rule in `docs/product/SAVINGS_MEASUREMENT_CONTRACT.md` — a manager cannot verify a savings case they personally implemented.

## 4. Operational vs clinical data separation

- This product stores **operational** data only: ownership, dates, statuses, contact-attempt outcomes, financial/time estimates and actuals, and minimal identifiers needed to run the workflow.
- It never stores clinical notes, diagnoses, treatment content or detailed clinical narratives (`PRODUCT_CONTRACT.md` §2, `docs/security/SECURITY_PRIVACY_GOVERNANCE.md` "Data minimisation").
- Where a workflow needs to identify a person (a referral, a client tied to an appointment), it uses the minimum identifier required and does not duplicate a system-of-record already held elsewhere.
- Management/dashboard reporting is built exclusively from operational data, so a director or manager can see patterns and value without ever being exposed to clinical detail (`PRODUCT_CONTRACT.md` §5.7–5.8).

## 5. Dashboard navigation and queue structure

- **Director Command** (`apps/director-command`, built in Phase 17): organisation-wide (or all-assigned-centre) executive view — money at risk, verified savings, Red items, module panels, drill-down to evidence. No queue-working actions here, view + verify only.
- **Operations** (`apps/operations`, built from Phase 9 onward): role- and centre-scoped queues —
  - Reception/Admin: referral queue, callback/follow-up queue, appointment-refill queue, handover acceptance queue.
  - Clinician: own referrals/appointments/handovers only, plus team-workload visibility where a module explicitly allows it.
  - Manager: all of the above across assigned centres, plus approval/verification actions and the recurring-cost register.
- Both apps enforce the permission matrix above **server-side**, in `packages/permissions`, consumed by `apps/api` — the UI reflects permissions, it does not enforce them (Phase 6 GREEN gate: unauthorised cross-user/cross-centre access must be denied by API and database controls, not just hidden in the UI).

**GREEN GATE — Phase 3: PASSED.** Role matrix defined above; no role receives access beyond what its column lists; technical administrator has no business decision rights.
