# Phase 0 — Directive & IP Freeze Record

This record is the GREEN GATE evidence for Phase 0 of `CHRONOLOGICAL_BUILD_PLAN.md`.

## 1. Frozen product directive

- **Canonical product name:** Practice Savings & Revenue Protection Command
- **Primary beneficiary:** Irene / the psychology practice
- **Purpose:** Stop money leaking from the practice through lost referrals, failed follow-up, wasted staff time, duplicated work, missed appointments, unclear responsibility, poor handovers, under-used capacity and recurring operational waste.
- **Explicitly not the purpose:** This is not a consumer budgeting app and is not designed to save clients money. It must not be merged with, or drift into, a client-facing budgeting product.
- Full contract: `PRODUCT_CONTRACT.md` (frozen alongside this record).

## 2. No duplicate competing product

This is the single canonical build of the Practice Savings & Revenue Protection Command. It supersedes and is not to be duplicated by any other repository, branch, or parallel build. Any future variant must be a versioned evolution of this repository, tracked through `feature_register.json` and this changelog — not a second repository.

## 3. Core modules frozen (see `MODULE_REGISTER.md`)

M01 No Lost Referral™ · M02 Reception Flow & Follow-up · M03 Appointment Leakage & Refill · M04 No-Lost-Responsibility / Work Ownership · M05 Staff Time Waste & Duplication Detection · M06 Leave, Handover & Absence Continuity · M07 Capacity & Utilisation · M08 Recurring Cost / Supplier Waste Review · M09 Systemic Pattern, Waste & Prevention Command · M10 Verified Savings Ledger & Director Dashboard

## 4. Product / IP ownership

- Product and its source code are owned by Tracey (GitHub: `tracey727`), operating as/for Genevieve App, for the benefit of Irene's practice.
- The product is designed to sit within the wider **GENEVIEVE App™** ecosystem as a distinct operational module, with its own permissions, data boundaries and ownership — it must not be collapsed into another product's codebase or data store.
- This repository (`tracey727/Psych-Savings`) is the authoritative source. No other repository holds production-authoritative code for this product.

## 5. Pilot licence terms

- Phase 1–19 (build, test, UAT) run entirely on **synthetic data**. No real client, referral, staff or clinical data is entered before Phase 20's production-governance gate is confirmed GREEN (see `docs/security/SECURITY_PRIVACY_GOVERNANCE.md` §"Production governance").
- The controlled pilot (Phase 20–21) is limited to Irene's practice and named authorised pilot users only.
- No data or credentials from this product are to be shared with, or reused by, unrelated products or third parties.

## 6. Authorised environments

| Environment | Purpose | Data |
|---|---|---|
| Local / CI | Development, automated tests | Synthetic only |
| Cloudflare + Neon **development** | Active build, integration testing | Synthetic only |
| Cloudflare + Neon **preview** | PR review, UAT | Synthetic only |
| Cloudflare + Neon **production** | Controlled pilot and beyond (Phase 20+) | Real data, only after governance gate GREEN |

## 7. Platform rule (frozen)

- Private GitHub repository: `tracey727/Psych-Savings`.
- Cloudflare Worker for the API.
- Cloudflare for application hosting.
- Neon Postgres for the database, accessed via a least-privilege runtime role — never the database owner/admin credential.
- Cloudflare Hyperdrive where it reduces connection overhead to Neon.
- No Vercel dependency.

## 8. Synthetic-data-only rule

Every build and test phase (Phase 0 through the end of Phase 19) uses **synthetic data only** — invented practices, staff, referrals, appointments and costs. No real client-identifying or clinical information is introduced before the Phase 20 production-governance gate is explicitly confirmed GREEN by the practice owner.

## 9. Feature register and change control

- `feature_register.json` (repository root) is the machine-readable register of modules, phases and gates. It is versioned with every material change.
- `CHANGELOG.md` (repository root) is the human-readable change-control log. Every phase completion, and every material scope change, is recorded there with date and phase reference.

## 10. Freeze status

- **Status:** FROZEN
- **Frozen by:** Tracey (practice/product owner), via Claude Code build session
- **Date:** 2026-09-03
- **Change control:** Any change to §1–§3 above requires a new dated entry in this file and a corresponding `CHANGELOG.md` entry — it cannot be edited silently.

**GREEN GATE — Phase 0: PASSED.** Signed/frozen product contract in place (`PRODUCT_CONTRACT.md`); no duplicate competing product (§2); `feature_register.json` present and versioned.
