-- Run this ONCE per environment (dev / preview / production Neon
-- project/branch), by a role that has CREATEROLE (the migration/owner
-- credential — see docs/security/SECRETS_POLICY.md), BEFORE applying
-- database/migrations/0006_least_privilege_grants.sql.
--
-- Do NOT create this role through Neon's "Add role" console/API instead
-- of this script: Neon-provisioned roles default to BYPASSRLS and
-- CREATEROLE, which silently defeats every tenant-isolation policy in
-- 0005_row_level_security.sql (verified against a live Neon project on
-- 2026-09-03 — see docs/architecture/ENVIRONMENTS.md). This plain-SQL
-- CREATE ROLE, run by a CREATEROLE-holding role, is the only supported
-- way to provision it correctly.
--
-- Replace the password below with a strong, randomly generated one and
-- never commit the real value — set it here interactively (psql) or via
-- an equivalent one-off, out-of-band command, then store it only in the
-- relevant Cloudflare secret (`wrangler secret put DATABASE_URL`).

CREATE ROLE psych_savings_runtime
  LOGIN
  NOBYPASSRLS
  NOCREATEROLE
  NOCREATEDB
  NOSUPERUSER
  PASSWORD '<REPLACE_ME_BEFORE_RUNNING>';

-- Sanity check — both flags below must read false:
-- SELECT rolbypassrls, rolcreaterole FROM pg_roles WHERE rolname = 'psych_savings_runtime';
