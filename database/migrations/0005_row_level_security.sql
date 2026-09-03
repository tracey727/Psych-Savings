-- Phase 5 — Authoritative Database Spine
-- Tenant isolation constraints (database-level), on top of the composite
-- foreign keys in 0002-0004. Row Level Security scopes every tenant table
-- to the organisation set on the current session via
-- `SET LOCAL app.current_org_id = '<uuid>'`, which the API sets per
-- request from the authenticated user's organisation (Phase 6).
--
-- This applies only to non-owner roles connecting to the database (the
-- migration/owner credential is exempt by default Postgres RLS semantics
-- and is never bound to the running API — see docs/security/SECRETS_POLICY.md).

ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organisations
  USING (id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE centres ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON centres
  USING (organisation_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organisation_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON users
  USING (organisation_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organisation_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE user_role_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON user_role_assignments
  USING (organisation_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organisation_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE user_centre_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON user_centre_assignments
  USING (organisation_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organisation_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE service_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON service_accounts
  USING (organisation_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organisation_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE work_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON work_items
  USING (organisation_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organisation_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE work_item_owners ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON work_item_owners
  USING (organisation_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organisation_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE work_item_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON work_item_transfers
  USING (organisation_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organisation_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE work_item_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON work_item_comments
  USING (organisation_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organisation_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON escalations
  USING (organisation_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organisation_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE action_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON action_evidence
  USING (organisation_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organisation_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE work_item_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON work_item_status_history
  USING (organisation_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organisation_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_events
  USING (organisation_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organisation_id = current_setting('app.current_org_id', true)::uuid);
