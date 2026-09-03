-- Phase 5 — Authoritative Database Spine
-- Work-item ownership, due-date, transfer, escalation and evidence tables.
-- The behavioural engine (single-owner enforcement, state transitions,
-- escalation rules) is built in Phase 7; this migration only lays the
-- authoritative tables it will run on top of, per
-- docs/product/CHRONOLOGICAL_BUILD_PLAN.md Phase 5 item 2.

CREATE TABLE work_items (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  centre_id              uuid,
  domain                 text NOT NULL,
  title                  text NOT NULL,
  current_owner_user_id  uuid,
  priority               text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_at                 timestamptz,
  next_action            text,
  health_state           text NOT NULL DEFAULT 'green' CHECK (health_state IN ('green', 'amber', 'red', 'recovery')),
  status                 text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  close_reason           text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  closed_at              timestamptz,
  UNIQUE (id, organisation_id),
  FOREIGN KEY (centre_id, organisation_id) REFERENCES centres(id, organisation_id),
  FOREIGN KEY (current_owner_user_id, organisation_id) REFERENCES users(id, organisation_id),
  CONSTRAINT closed_requires_reason CHECK (status <> 'closed' OR close_reason IS NOT NULL),
  CONSTRAINT closed_has_timestamp CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);

-- Append-only ownership history — every assignment is a new row, never
-- overwritten (docs/architecture/DATA_MODEL_BLUEPRINT.md "Critical data rules").
CREATE TABLE work_item_owners (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL,
  work_item_id     uuid NOT NULL,
  user_id          uuid NOT NULL,
  assigned_at      timestamptz NOT NULL DEFAULT now(),
  unassigned_at    timestamptz,
  FOREIGN KEY (work_item_id, organisation_id) REFERENCES work_items(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, organisation_id) REFERENCES users(id, organisation_id)
);

CREATE TABLE work_item_transfers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL,
  work_item_id     uuid NOT NULL,
  from_user_id     uuid,
  to_user_id       uuid NOT NULL,
  requested_at     timestamptz NOT NULL DEFAULT now(),
  accepted_at      timestamptz,
  rejected_at      timestamptz,
  reason           text,
  FOREIGN KEY (work_item_id, organisation_id) REFERENCES work_items(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (to_user_id, organisation_id) REFERENCES users(id, organisation_id),
  FOREIGN KEY (from_user_id, organisation_id) REFERENCES users(id, organisation_id),
  CONSTRAINT not_both_accepted_and_rejected CHECK (accepted_at IS NULL OR rejected_at IS NULL)
);

CREATE TABLE work_item_comments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL,
  work_item_id     uuid NOT NULL,
  author_user_id   uuid NOT NULL,
  body             text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (work_item_id, organisation_id) REFERENCES work_items(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id, organisation_id) REFERENCES users(id, organisation_id)
);

CREATE TABLE escalations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id        uuid NOT NULL,
  work_item_id           uuid NOT NULL,
  escalated_at           timestamptz NOT NULL DEFAULT now(),
  escalated_to_user_id   uuid,
  reason                 text NOT NULL,
  resolved_at            timestamptz,
  FOREIGN KEY (work_item_id, organisation_id) REFERENCES work_items(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (escalated_to_user_id, organisation_id) REFERENCES users(id, organisation_id)
);

CREATE TABLE action_evidence (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id    uuid NOT NULL,
  work_item_id       uuid NOT NULL,
  evidence_type      text NOT NULL,
  reference          text,
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  FOREIGN KEY (work_item_id, organisation_id) REFERENCES work_items(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id, organisation_id) REFERENCES users(id, organisation_id)
);

-- Append-only material state history for work items
-- (docs/architecture/DATA_MODEL_BLUEPRINT.md "Operational events use
-- append-only history for material state changes").
CREATE TABLE work_item_status_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL,
  work_item_id        uuid NOT NULL,
  changed_at          timestamptz NOT NULL DEFAULT now(),
  changed_by_user_id  uuid,
  from_health_state   text,
  to_health_state     text,
  from_status         text,
  to_status            text,
  reason              text,
  FOREIGN KEY (work_item_id, organisation_id) REFERENCES work_items(id, organisation_id) ON DELETE CASCADE
);

CREATE INDEX idx_work_items_org ON work_items (organisation_id);
CREATE INDEX idx_work_items_owner ON work_items (current_owner_user_id);
CREATE INDEX idx_work_items_due ON work_items (due_at) WHERE status = 'open';
CREATE INDEX idx_work_item_owners_item ON work_item_owners (work_item_id);
CREATE INDEX idx_work_item_transfers_item ON work_item_transfers (work_item_id);
CREATE INDEX idx_work_item_comments_item ON work_item_comments (work_item_id);
CREATE INDEX idx_escalations_item ON escalations (work_item_id);
CREATE INDEX idx_action_evidence_item ON action_evidence (work_item_id);
CREATE INDEX idx_work_item_status_history_item ON work_item_status_history (work_item_id);
