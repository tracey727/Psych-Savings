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
