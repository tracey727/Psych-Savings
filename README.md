# Psych Savings — Practice Savings & Revenue Protection Command

One operational system that stops money leaking out of Irene's psychology practice: lost referrals, failed follow-up, wasted staff time, duplicated work, missed appointments, unclear responsibility, poor handovers, under-used capacity and recurring operational waste.

**This is not a consumer budgeting app.** It does not store therapy content, clinical notes, diagnoses or treatment decisions, and it is not designed to save clients money — see [`docs/product/PRODUCT_CONTRACT.md`](docs/product/PRODUCT_CONTRACT.md).

## Build rule

This repository is built **one phase at a time**, in the exact chronological order defined in [`docs/product/CHRONOLOGICAL_BUILD_PLAN.md`](docs/product/CHRONOLOGICAL_BUILD_PLAN.md). Every phase has a GREEN GATE recorded in [`docs/product/BUILD_GATE_CHECKLIST.md`](docs/product/BUILD_GATE_CHECKLIST.md). The next phase does not start until the current one is complete, tested and documented.

Current phase status lives in `docs/product/BUILD_GATE_CHECKLIST.md` — check there before assuming anything beyond it exists.

## Platform baseline

- Private GitHub repository
- Cloudflare Worker API (`apps/api`)
- Cloudflare Pages/Workers for the web app(s)
- Neon Postgres, accessed through a least-privilege runtime role
- Synthetic test data only until production governance and security gates are complete (Phase 20)
- No Vercel dependency

## Repository layout

```text
/apps
  /director-command   Irene / management dashboard (built in Phase 17)
  /operations          Reception/clinician operational queues (built from Phase 9 onward)
  /api                  Cloudflare Worker API
/packages
  /shared-types        Canonical status/domain types shared by API and UI
  /permissions         Role/centre permission matrix and enforcement helpers
  /workflow-engine      Work-item ownership, escalation, state-machine engine
  /alerts               Alert rules, notification and escalation logic
  /audit                Audit event emission/query helpers
  /savings-engine       Savings calculation, evidence and verification logic
  /ui                   Shared UI components
/database
  /migrations           Append-only SQL migrations (Neon Postgres)
  /seed                 Synthetic seed data
  /tests                Migration/isolation tests
/docs
  /product              Product contract, module register, build plan, feature register
  /architecture         Data model, role matrix
  /security             Security, privacy and governance rules
  /uat                  Test plans and UAT sign-off records
```

## Core operating cycle

**Capture → Own → Act → Escalate → Recover → Measure → Verify → Learn → Prevent**

## Ownership

Built for Irene's practice as an operational module that can sit within the wider GENEVIEVE App™ ecosystem, with clear module boundaries, permissions and data ownership. See `docs/product/PRODUCT_CONTRACT.md` §9.
