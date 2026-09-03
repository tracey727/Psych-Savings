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

**GREEN GATE: NOT YET COMPLETE.** Clean install and CI passing locally is confirmed. Still outstanding, pending accounts only the practice/product owner can provision: (1) push to `tracey727/Psych-Savings` and enable GitHub branch protection on `main`; (2) create the Cloudflare development/preview environments; (3) create the Neon development/test project and branches. Recorded here so the gate is not falsely marked green — see `docs/product/BUILD_GATE_CHECKLIST.md`.
