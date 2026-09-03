# Secrets Policy

Frozen at Phase 4, enforced from Phase 4 onward for the life of the repository.

## Rules

1. **No secret is ever committed to source control** — not in code, not in `wrangler.toml`, not in a config file, not in a test fixture. `.gitignore` excludes `.env` and `.env.*` (except `.env.example`).
2. `.env.example` (repository root, added in this phase) lists every environment variable name a developer needs, with no real values — copy it to `.env` locally and fill in real values there.
3. Cloudflare Worker secrets (database URLs, API keys) are set per environment with `wrangler secret put <NAME> --env <development|preview|production>`, never as plaintext `vars` in `wrangler.toml`.
4. The Worker's `DATABASE_URL` is always a **least-privilege Neon runtime role** connection string — never the Neon project owner/admin credential (`docs/product/DIRECTIVE_FREEZE.md` §7, `docs/security/SECURITY_PRIVACY_GOVERNANCE.md`). The owner credential is used only for running migrations from a controlled context (CI migration job or an authorised developer), never bound to the running API.

   **The runtime role must be created via `database/provisioning/create_runtime_role.sql` (plain SQL), never via Neon's own role-creation console/API.** Verified 2026-09-03: a role created through Neon's API defaults to `BYPASSRLS` and `CREATEROLE`, silently defeating every tenant-isolation policy in `database/migrations/0005_row_level_security.sql`, and Neon does not allow that to be corrected afterwards with `ALTER ROLE`. See `docs/architecture/ENVIRONMENTS.md` "Neon platform gotcha" for the full finding.
5. CI does not have access to production secrets. Preview/development CI jobs use scoped, rotatable credentials tied to non-production Neon branches/Cloudflare environments only.
6. Dependency and secret scanning run in CI before merge to `main` (Phase 4 GREEN gate).
7. Any suspected secret exposure is rotated immediately and logged as an audit/incident entry — see `docs/security/SECURITY_PRIVACY_GOVERNANCE.md` "Production governance" §incident response.
8. Access to production secrets is limited to the technical administrator role and the practice/product owner — never held by reception, clinician or manager accounts (`docs/architecture/ROLE_MATRIX.md`).
