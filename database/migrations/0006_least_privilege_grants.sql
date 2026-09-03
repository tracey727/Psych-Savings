-- Phase 5 — Authoritative Database Spine
-- Grants for the least-privilege runtime role. The role itself is NOT
-- created here (creating a login role requires a password, which must
-- never be committed — see docs/security/SECRETS_POLICY.md). Run
-- database/provisioning/create_runtime_role.sql once per environment
-- first (it creates `psych_savings_runtime` with a real password set
-- out-of-band), then apply this migration.
--
-- IMPORTANT — Neon-specific gotcha (verified 2026-09-03): a role created
-- via Neon's own "create role" API/console defaults to BYPASSRLS and
-- CREATEROLE, which silently defeats every RLS policy in
-- 0005_row_level_security.sql. The runtime role MUST be created with
-- plain SQL (CREATE ROLE ... NOBYPASSRLS NOCREATEROLE) by a role that
-- itself has CREATEROLE (the migration/owner credential), never through
-- Neon's role-provisioning API. See
-- database/provisioning/create_runtime_role.sql and
-- docs/security/SECRETS_POLICY.md.

GRANT USAGE ON SCHEMA public TO psych_savings_runtime;

-- Reference data: read-only.
GRANT SELECT ON roles TO psych_savings_runtime;

-- Tenant/identity and mutable operational tables: read + write, no delete.
-- Nothing is silently deleted from operational history
-- (docs/product/PRODUCT_CONTRACT.md §5.10) — records are closed/archived,
-- never removed, so DELETE is intentionally not granted anywhere below.
GRANT SELECT, INSERT, UPDATE ON
  organisations,
  centres,
  users,
  user_role_assignments,
  user_centre_assignments,
  service_accounts,
  work_items,
  work_item_transfers,
  escalations
TO psych_savings_runtime;

-- Append-only tables: insert + read only, never update or delete.
GRANT SELECT, INSERT ON
  work_item_owners,
  work_item_comments,
  action_evidence,
  work_item_status_history,
  audit_events
TO psych_savings_runtime;
