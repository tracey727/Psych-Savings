# Migrations

Neon Postgres, plain SQL, applied in filename order. **Append-only after release** (`docs/10_DEVELOPER_HANDOFF.md` "Engineering rules" #1) — once a migration has shipped to a shared environment, it is never edited; a follow-up migration corrects it instead.

Schema build starts in Phase 5 (Authoritative Database Spine). No migration is added before then — see `docs/product/CHRONOLOGICAL_BUILD_PLAN.md`.
