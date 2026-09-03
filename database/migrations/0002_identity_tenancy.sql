-- Phase 5 — Authoritative Database Spine
-- Organisation/centre/user/role schema. See docs/architecture/DATA_MODEL_BLUEPRINT.md
-- "Core identity and tenancy" and docs/architecture/ROLE_MATRIX.md.
--
-- Tenant isolation pattern: every tenant-owned table carries an explicit
-- organisation_id, and every child table's foreign key is a COMPOSITE key
-- of (parent_id, organisation_id) against the parent's (id, organisation_id)
-- unique constraint. This makes it impossible, at the database level, for a
-- row to reference a parent belonging to a different organisation.

CREATE TABLE organisations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE centres (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  name             text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  UNIQUE (organisation_id, name)
);

-- Frozen role set — must match packages/shared-types ROLES and
-- docs/architecture/ROLE_MATRIX.md §2. Not user-editable.
CREATE TABLE roles (
  key    text PRIMARY KEY,
  label  text NOT NULL
);

INSERT INTO roles (key, label) VALUES
  ('director', 'Director'),
  ('manager', 'Manager'),
  ('reception_admin', 'Reception/Admin'),
  ('clinician', 'Clinician'),
  ('technical_admin', 'Technical Administrator');

CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  email            text NOT NULL,
  display_name     text NOT NULL,
  disabled_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  UNIQUE (organisation_id, email)
);

CREATE TABLE user_role_assignments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL,
  user_id          uuid NOT NULL,
  role_key         text NOT NULL REFERENCES roles(key),
  created_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, organisation_id) REFERENCES users(id, organisation_id) ON DELETE CASCADE,
  UNIQUE (organisation_id, user_id, role_key)
);

CREATE TABLE user_centre_assignments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL,
  user_id          uuid NOT NULL,
  centre_id        uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, organisation_id) REFERENCES users(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (centre_id, organisation_id) REFERENCES centres(id, organisation_id) ON DELETE CASCADE,
  UNIQUE (user_id, centre_id)
);

-- Non-human callers (integrations, background jobs), scoped per organisation.
CREATE TABLE service_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  name             text NOT NULL,
  disabled_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, name)
);

CREATE INDEX idx_centres_org ON centres (organisation_id);
CREATE INDEX idx_users_org ON users (organisation_id);
CREATE INDEX idx_user_role_assignments_org ON user_role_assignments (organisation_id);
CREATE INDEX idx_user_centre_assignments_org ON user_centre_assignments (organisation_id);
