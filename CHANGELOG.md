# Changelog

All notable changes to this repository are recorded here, referenced against the phase in `docs/product/CHRONOLOGICAL_BUILD_PLAN.md`.

## [Phase 0] Directive & IP Freeze — 2026-09-03

- Froze the product contract, module register and canonical product name (`docs/product/PRODUCT_CONTRACT.md`, `docs/product/MODULE_REGISTER.md`, `docs/product/DIRECTIVE_FREEZE.md`).
- Recorded product/IP ownership, pilot licence terms and authorised environments (`docs/product/DIRECTIVE_FREEZE.md`).
- Recorded the platform rule: GitHub + Cloudflare + Neon, no Vercel.
- Recorded the synthetic-data-only rule for all build/test phases.
- Created the versioned feature register (`feature_register.json`) and this change-control log.

**GREEN GATE: PASSED** — see `docs/product/DIRECTIVE_FREEZE.md` §10.

## [Phase 1] Current-State Loss Map — 2026-09-03

- Documented a current-state process, today's informal owner, and a placeholder measurable-baseline slot for every target loss type (referral, reception follow-up, cancellation/no-show, handover/absence, repetitive admin, recurring costs) — `docs/product/LOSS_MAP_BASELINE.md`.
- Flagged explicitly that all figures are placeholders pending confirmation with the practice during Phase 21; no saving may be claimed from them.

**GREEN GATE: PASSED (template)** — every target loss type has a defined process, owner and baseline slot; real figures deferred to Phase 21 by design.

## [Phase 2] Savings Measurement Contract — 2026-09-03

- Defined recovered revenue / avoided revenue leakage / avoided operating cost / released staff time as the four frozen value categories, each with a calculation formula (`docs/product/SAVINGS_MEASUREMENT_CONTRACT.md`).
- Defined the evidence hierarchy and required audit trail per savings case.
- Defined the Potential → Approved → Implemented → Measured → Verified lifecycle, who may move a case through each state, and the self-verification restriction.
- Defined anti-double-counting rules across individual events and systemic patterns.

**GREEN GATE: PASSED** — no savings case can reach Verified without a calculation method, a persisted baseline and evidence.

## [Phase 3] Information Architecture & Role Matrix — 2026-09-03

- Defined organisation/centre tenancy boundaries (`docs/architecture/ROLE_MATRIX.md`).
- Defined five roles (Director, Manager, Reception/Admin, Clinician, Technical Administrator) and a full create/view/update/transfer/close/verify permission matrix per domain.
- Defined the operational-vs-clinical data separation rule and confirmed technical administrators hold no business decision rights.
- Defined dashboard/queue navigation structure per app (`director-command` vs `operations`) and confirmed permissions are enforced server-side, not just hidden in UI.

**GREEN GATE: PASSED** — role matrix defined; no role receives unnecessary access.

## [Phase 4] Repository & Environment Foundation — 2026-09-03 (in progress)

- Created repository structure (`apps/`, `packages/`, `database/`, `docs/`) per `docs/10_DEVELOPER_HANDOFF.md`.
- Added a pnpm workspace, base TypeScript config, ESLint flat config, and CI workflow (`.github/workflows/ci.yml`) running install → typecheck → test → lint.
- Added the `apps/api` Cloudflare Worker skeleton (Hono) with a single `/health` route and a passing test — proves the toolchain builds/tests end to end without pulling in any business logic ahead of its phase.
- Added `docs/security/SECRETS_POLICY.md` and `.env.example`; confirmed no secrets are committed.
- Verified locally: clean `pnpm install`, `pnpm run typecheck`, `pnpm run test` and `pnpm run lint` all pass from a fresh clone.

- Provisioned the Neon development project/branch (`psych-savings`, project `calm-cake-37228033`, branch `development`) — see `docs/architecture/ENVIRONMENTS.md`.

**GREEN GATE: NOT YET COMPLETE.** Clean install and CI passing locally is confirmed; the Neon development environment now exists. Still outstanding, pending the practice/product owner: (1) restore GitHub push access for this session (the Claude GitHub App installation is not yet authorised to push to `tracey727/Psych-Savings`) and, once pushed, enable branch protection on `main`; (2) create the Cloudflare development/preview environments. Recorded here so the gate is not falsely marked green — see `docs/product/BUILD_GATE_CHECKLIST.md`.

## [Phase 5] Authoritative Database Spine — 2026-09-03

- Wrote and applied migrations 0001–0006 against the live Neon development branch: extensions, identity/tenancy schema (organisations, centres, roles, users, user_role_assignments, user_centre_assignments, service_accounts), the work-ownership engine's spine tables (work_items, work_item_owners, work_item_transfers, work_item_comments, escalations, action_evidence, work_item_status_history), the audit_events table, and Row Level Security tenant-isolation policies on every tenant table (`database/migrations/`).
- Used composite foreign keys — every child table references its parent as `(parent_id, organisation_id)` — so it is impossible at the database level for a row to reference a parent belonging to a different organisation.
- **Found and fixed a real Neon platform gotcha**: a Postgres role created through Neon's own role-provisioning API/console defaults to `BYPASSRLS` and `CREATEROLE`, which would have silently defeated every RLS policy just written, and Neon does not allow `ALTER ROLE` to correct it afterwards. Fixed by creating the runtime role with plain SQL instead (`database/provisioning/create_runtime_role.sql`), run by a role holding `CREATEROLE`. Documented in `docs/architecture/ENVIRONMENTS.md` and `docs/security/SECRETS_POLICY.md` so it isn't rediscovered the hard way in preview/production.
- Granted the correctly-restricted `psych_savings_runtime` role least-privilege access: read/write (no delete) on mutable operational tables, insert/read-only on append-only tables, read-only on reference data (`database/migrations/0006_least_privilege_grants.sql`).
- Seeded two synthetic organisations, each with its own centre, users and one work item (`database/seed/0001_synthetic_practice.sql`) — deliberately two, not one, so an isolation bug has something to leak.
- Ran a live behavioural isolation test as the actual `psych_savings_runtime` role against the real database (`database/tests/tenant_isolation.sql`), not just a structural check. All six checks passed: no session `org_id` set → 0 rows visible (fails closed, no data leak); an org-A session sees exactly its own 1 work item and 0 of org B's users even when explicitly filtering for org B; an org-B session sees exactly its own 1 work item; an org-A session's attempt to insert a work item tagged as org B is rejected by the RLS `WITH CHECK` clause; the runtime role's attempt to `DELETE` an audit event is rejected (no grant — audit stays append-only).

**GREEN GATE: PASSED.** A fresh database was created from these migrations on a live Neon branch, and tenant/role isolation tests pass against the actual least-privilege runtime role — not the migration/owner credential, which bypasses RLS by default and is never bound to the running API.

## [Phase 6] Authentication, Authorisation & Audit — 2026-09-03

- Added `packages/permissions`: docs/architecture/ROLE_MATRIX.md §3 encoded as executable `can(role, domain, action)` / `hasCentreAccess(...)` logic, plus the self-verification rule from `docs/product/SAVINGS_MEASUREMENT_CONTRACT.md`. 19 tests check it against the matrix domain by domain.
- Added `packages/audit`: a validated `buildAuditEvent()` builder plus an `AuditSink` interface, matching the required fields in `docs/security/SECURITY_PRIVACY_GOVERNANCE.md` "Audit requirements".
- Added secure sign-in: PBKDF2-HMAC-SHA256 password hashing (210,000 iterations, WebCrypto, no native dependency), 26 tests including exact-match RFC 6238 TOTP test vectors for the MFA implementation.
- Added the privileged-role MFA policy: director/manager/technical_admin (`packages/permissions` `PRIVILEGED_ROLES`) cannot obtain a fully-authenticated session without completing TOTP — first login forces enrolment (`mfa_setup_required`), a code is required afterwards (`mfa_required`), and password verification alone only ever issues a short-lived pending session, never a working one.
- Added DB-backed sessions (not stateless JWT) so expiry and revocation are real, queryable, revocable facts — opaque random tokens, only their SHA-256 hash ever stored.
- Added lockout after repeated failed sign-ins (10 failures / 15 minutes, keyed by email — deliberately not organisation-scoped, since credential stuffing doesn't respect tenant boundaries), and sign-in never reveals whether a failure was "no such user" or "wrong password".
- Added `apps/api` request middleware (`createAuthMiddleware`, `requirePermission`, `assertCentreAccess`) enforcing all of the above server-side, and wired real `/auth/sign-in`, `/auth/mfa/enroll`, `/auth/mfa/enroll/confirm`, `/auth/mfa/verify` and `/auth/sign-out` routes.
- **Found and fixed a real RLS design gap**: `sessions` is RLS-scoped like every other tenant table, but looking a session up by its token is a chicken-and-egg problem — the caller can't know which organisation to scope to until it reads the row RLS is blocking. Fixed with a narrow `SECURITY DEFINER` function, `lookup_session_organisation(token_hash)`, that resolves only an `organisation_id` for a live token and nothing else (`database/migrations/0008_session_lookup_function.sql`). Verified live against the real database: a direct read with no session context returns 0 rows; the function correctly resolves a real token to its organisation; a bogus token resolves to `NULL` with no error; an expired token also resolves to `NULL`. Documented in `docs/architecture/ENVIRONMENTS.md` as the one deliberate exception to "every table is RLS-scoped".
- The full sign-in → MFA-required → correct/incorrect TOTP → session flow, and the enrol → confirm → subsequent-login-requires-a-code flow, are both tested end-to-end against an in-memory fake `AuthStore` (72 tests pass across the repo). The real Neon-backed adapters (`db/neonAuthStore.ts`, `db/neonAuditSink.ts`) reuse the exact SQL/RLS pattern proven live in Phase 5 and above, but cannot themselves be exercised locally — this sandbox's network egress cannot reach Neon directly (confirmed for both raw TCP and the HTTPS driver) — see `docs/architecture/ENVIRONMENTS.md` "Testing the database adapter".
- Seeded working credentials for the three Phase 5 synthetic users, generated by the real `hashPassword()`/`generateTotpSecret()` implementations rather than hand-rolled (`database/seed/0002_auth_seed.sql`); Irene A (director) has MFA already enrolled and enabled so the `mfa_required` path can be exercised immediately.

**GREEN GATE: PASSED.** Unauthorised access is denied at both layers: the API layer denies it via `createAuthMiddleware`/`requirePermission`/`assertCentreAccess`, proven by 8 middleware tests covering no-session, bogus-token, not-yet-MFA-verified, revoked-session, insufficient-role, and cross-centre scenarios; the database layer denies it via the RLS tenant isolation proven live in Phase 5, extended to `sessions` and `mfa_secrets` in this phase and proven live again for the token-lookup mechanism specifically.

## [Phase 7] Core Work Ownership Engine — 2026-09-03

- Added `packages/workflow-engine`: the generic work-item engine every later module (Phase 8+) reuses instead of re-implementing ownership per module, per `docs/product/LOSS_MAP_BASELINE.md` §7.
- `createWorkItem` makes ownership mandatory at the type level — `ownerUserId` is a required field, not optional — so it is impossible to call this engine in a way that produces an ownerless active item. This is the concrete mechanism behind the GREEN gate's "cannot silently lose ownership."
- Ownership transfer requires acceptance (`docs/product/PRODUCT_CONTRACT.md` §5.2): `requestTransfer` only records a pending request and never touches `current_owner_user_id`; only `acceptTransfer` moves ownership, and only when called by the transfer's actual intended recipient. A rejected or unauthorised-accept attempt leaves the original owner untouched — proven by dedicated tests, not just assumed.
- Added a pure, fully-tested Green/Amber/Red/Recovery state machine (`packages/workflow-engine/src/health.ts`) matching `docs/product/PRODUCT_CONTRACT.md` §6 and `OPERATING_MODEL.md`: Red on any open escalation or an overdue due date; Amber inside a configurable warning window; Green otherwise; Recovery is sticky and only ever exits to Green once nothing remains overdue or escalated — it is a state a person deliberately enters (`beginRecovery`, only callable from Red) rather than something time alone can produce or silently clear.
- Added the escalation queue (`escalate`/`resolveEscalation`) and close/reopen with a mandatory reason (`closeWorkItem`/`reopenWorkItem` reject an empty reason before the request ever reaches the database's own `closed_requires_reason` CHECK constraint from Phase 5 — defense in depth) plus full append-only history (`work_item_status_history`, `work_item_owners`) and audit events for every transition.
- 31 tests cover the engine end-to-end against an in-memory fake store: creation-always-has-an-owner, the full transfer accept/reject/unauthorised-actor matrix, escalate → Red → partially-resolved-stays-Red → fully-resolved → Green, the full escalate → beginRecovery → resolve → Green lifecycle, and close/reopen including the reason requirement and that reopening preserves the original owner.
- Added the real Neon-backed adapter (`apps/api/src/db/neonWorkItemStore.ts`, same RLS/transaction pattern as Phase 5-6) and wired it to real `/work-items/*` routes (create, view, transfer request/accept/reject, escalate/resolve, begin-recovery, close/reopen), each gated by `requirePermission("work_items", ...)` and, once the resource's `centre_id` is known, `assertCentreAccess` — reusing the exact Phase 6 middleware rather than inventing a parallel authorisation path.

**GREEN GATE: PASSED.** An active item cannot silently lose ownership — it is impossible to create one without an owner, and transfer only ever completes on explicit acceptance by the intended recipient, both proven by automated tests, not just asserted. Overdue and transfer scenarios pass automated tests: 31 tests across `health.test.ts` and `engine.test.ts`, covering every state transition and every transfer accept/reject/unauthorised-actor combination.

## [Phase 8] No Lost Referral™ — 2026-09-03

- Added `database/migrations/0009_referrals.sql`: a referral IS a `work_items` row (domain = `referral`) plus exactly the fields that are genuinely referral-specific — `referrals` (source, contact progress, outcome, value estimate) and `referral_contact_attempts` (append-only). Ownership, the first-contact deadline, escalation and close/reopen are the Phase 7 engine, reused rather than duplicated — a deliberate simplification of `docs/architecture/DATA_MODEL_BLUEPRINT.md`'s logical "Referral domain" model, documented in the migration itself.
- Added a small necessary Phase 7 addition first: `rescheduleWorkItem` (`packages/workflow-engine`) — updating a due date is core to the ownership engine, but Phase 7 only set it at creation time. Follow-up deadlines needed a first-class "update the due date and recompute health state" operation; 3 new tests cover it (green→amber, green→red, cannot reschedule a closed item).
- `intakeReferral` registers a referral and assigns its owner in one operation (MODULE_REGISTER.md M01), setting the first-contact deadline as the work item's `due_at` — overdue referral alerts (item 6) fall directly out of the Phase 7 health-state machine already proven in Phase 7, no new alerting code needed.
- `recordContactAttempt` logs the attempt, advances `contact_status` (not_yet_contacted → attempting → contacted), and optionally reschedules the follow-up deadline through `rescheduleWorkItem`.
- `setReferralOutcome` sets the final result (waiting/booked/declined/not_suitable). A lost outcome (declined/not_suitable) requires a reason — checked in the engine ahead of the database's own `lost_reason_required` CHECK constraint, same defense-in-depth pattern used for close reasons in Phase 7. Any outcome but "waiting" closes the underlying work item through the Phase 7 engine's `closeWorkItem`; "waiting" leaves it open and still subject to ordinary overdue/escalation rules.
- Added conversion reporting (`calculateConversionStats`, MODULE_REGISTER.md M01): a pure function over outcome counts, `conversionRate = booked / (booked + lost)`, correctly `0` rather than `NaN` when nothing has been finalized yet.
- 16 new tests (13 engine + 3 workflow-engine reschedule) cover intake-always-has-an-owner, the contact-attempt/status-progression flow, the lost-reason requirement, that "waiting" leaves the item open while every other outcome closes it, and the conversion-rate calculation including the zero-division edge case — 119 tests pass across the repo.
- Added the real Neon-backed adapter and wired real `/referrals/*` routes (create, view, record contact attempt, set outcome, conversion report), gated by the same `requirePermission("referrals", ...)` / `assertCentreAccess` middleware as every other domain.
- Seeded three synthetic referrals covering the full range of states — not yet contacted, contacted then booked, contacted then declined with a lost reason — and verified live against the real database that every one is traceable end to end (source, contact attempts, final outcome, and the underlying work item's status/close reason all join up with no gaps).

**GREEN GATE: PASSED.** Every synthetic referral is traceable from receipt to final outcome with no invisible state — proven both by 13 automated tests against an in-memory fake and by a live query against the real Neon database joining all three seeded referrals to their work items and contact-attempt history with zero missing links.

## [Phase 9] Reception Flow & Follow-up — 2026-09-03

- No new migration needed — Phase 9 turned out to be a queue/view layer over what Phase 5 and 7 already built: the reception/callback queue is a filtered, sorted view over `work_items`, and contact-attempt history reuses Phase 5's `action_evidence` table, which had sat unused since the schema was written. A callback is just a `work_items` row with `domain = 'callback'`.
- Added `sortQueue` (`packages/workflow-engine`): the one authoritative order reception works a queue in — most severe health state first (Red, then Recovery, then Amber, then Green), then soonest due date, then priority. Pure and stable, so "no synthetic callback disappears" is something a test can actually assert rather than eyeball.
- Added `getQueue` (filterable by domain/owner/centre, always open-only) and `getTeamWorkload` (MODULE_REGISTER.md M02 "team workload view... without exposing unnecessary sensitive content" — returns only `{userId, openCount, overdueCount}` per user, no titles, no item content, checked directly in a test that inspects the result's own key set).
- Added `recordContactAttempt`/`getContactAttemptHistory`, storing attempts as `action_evidence` with `evidence_type = 'contact_attempt'`, plus a documented (not DB-enforced, consistent with Phase 5's data-minimisation stance on free text) canonical list of standard outcomes (`STANDARD_CONTACT_OUTCOMES`) — MODULE_REGISTER.md M02 "standard status codes".
- 11 new tests cover queue ordering exhaustively (each sort tier in isolation, plus that sorting doesn't mutate its input), that domain filtering and closed-item exclusion work, that an escalated item surfaces at the top, and that contact-attempt history only returns contact attempts even when other evidence types exist on the same item — 130 tests pass across the repo.
- Extended `NeonWorkItemStore` with the four new queries (parameterized "NULL means no filter" pattern rather than building SQL strings dynamically) and added `GET /work-items/queue`, `GET /work-items/workload`, `POST /work-items/:id/contact-attempts` and `GET /work-items/:id/contact-attempts` routes, gated by the same `requirePermission`/`assertCentreAccess` middleware as every other domain. `action_evidence` already had the runtime role's grants from Phase 5 — nothing new to grant.
- Seeded three synthetic callbacks (overdue+escalated, due soon, due later) and verified live against the real database that the queue ordering and workload aggregation match the engine's logic exactly — all three callbacks present, correctly ordered, and the seeded reception user's workload count (4 open, 1 overdue, across both callbacks and their still-open referral) reconciles precisely.

**GREEN GATE: PASSED.** Reception works from one authoritative queue — `getQueue`, proven live against the database to return every open item in the correct order — and no synthetic callback disappears, proven both by the "closed items excluded, everything else present" test and by all three seeded callbacks showing up, correctly ordered, in the live query.
