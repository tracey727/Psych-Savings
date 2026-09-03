-- Phase 5 — Authoritative Database Spine
-- Audit event table. See docs/security/SECURITY_PRIVACY_GOVERNANCE.md
-- "Audit requirements": actor, timestamp, action, affected record, prior
-- state, new state, reason, source. Append-only — write privileges are
-- restricted to INSERT/SELECT for the runtime role in 0005_least_privilege_role.sql.

CREATE TABLE audit_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  actor_user_id    uuid,
  action           text NOT NULL,
  entity_type      text NOT NULL,
  entity_id        uuid,
  prior_state      jsonb,
  new_state        jsonb,
  reason           text,
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  source           text
);

CREATE INDEX idx_audit_events_org ON audit_events (organisation_id);
CREATE INDEX idx_audit_events_entity ON audit_events (entity_type, entity_id);
CREATE INDEX idx_audit_events_occurred ON audit_events (occurred_at);
