# savings-engine

Savings calculation, evidence linkage and verification logic implementing `docs/product/SAVINGS_MEASUREMENT_CONTRACT.md`. All savings math lives here — never as a UI-only calculation (`docs/10_DEVELOPER_HANDOFF.md` "No hidden calculations in UI-only code").

Built in **Phase 12**, not Phase 16 as originally planned: Phase 12's GREEN GATE requires at least one synthetic waste case to reach **Verified** savings with evidence, which is impossible without the case lifecycle, the baseline record and the verification rules. The package is therefore written generically across all four value categories from the start. Phase 16 (Verified Savings Ledger) adds the month/quarter/year roll-ups and dashboard reconstruction on top of what is here; it does not replace it.

## What is enforced here

- **`calculate.ts` is pure.** It takes only a persisted baseline and a persisted post-intervention measurement. That is what makes the contract's "System calculation, from persisted before/after data — never a manual dashboard override" true in code rather than only on paper.
- **One state at a time.** `Potential → Approved → Implemented → Measured → Verified`; skipping a state is refused, because skipping is how an unmeasured figure would reach a dashboard total.
- **Verification needs evidence and a second person.** A case cannot be verified without at least one `savings_evidence` record, and `canVerifySavingsCase` (in `@psych-savings/permissions`) refuses a manager verifying their own implementation.
- **Annualised figures are separate by construction.** `getVerifiedSavingsTotals` returns the run-rate in its own fields and never adds it to a verified total. A one-off saving gets no run-rate at all.
- **Anti-double-counting rule 1.** One underlying operational event backs at most one open case per value category, checked here and by a partial unique index in `database/migrations/0012_waste_and_savings.sql`.
