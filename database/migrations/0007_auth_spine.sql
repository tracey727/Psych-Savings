-- Phase 6 — Authentication, Authorisation & Audit
-- Password credential, session, MFA and login-attempt tables.

ALTER TABLE users ADD COLUMN password_hash text;

-- Sessions are DB-backed (not stateless JWT) specifically so expiry and
-- revocation are real, queryable, revocable facts, per Phase 6 item 3.
-- The raw session token is never stored — only its SHA-256 hash — so a
-- database read cannot be turned into a usable session token.
CREATE TABLE sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL,
  user_id          uuid NOT NULL,
  token_hash       text NOT NULL UNIQUE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  revoked_at       timestamptz,
  mfa_verified     boolean NOT NULL DEFAULT false,
  user_agent       text,
  ip               text,
  FOREIGN KEY (user_id, organisation_id) REFERENCES users(id, organisation_id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_org ON sessions (organisation_id);
CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_token_hash ON sessions (token_hash);

-- One TOTP secret per user (privileged-role MFA policy — enforced in
-- application code per docs/architecture/ROLE_MATRIX.md, since which
-- roles are "privileged" is a role-matrix concern, not a schema concern).
CREATE TABLE mfa_secrets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL,
  user_id          uuid NOT NULL,
  secret_base32    text NOT NULL,
  enabled_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, organisation_id) REFERENCES users(id, organisation_id) ON DELETE CASCADE,
  UNIQUE (user_id)
);

CREATE INDEX idx_mfa_secrets_org ON mfa_secrets (organisation_id);

-- Login attempts are deliberately NOT organisation-scoped or RLS-isolated:
-- credential-stuffing and brute-force attacks target an email/IP
-- regardless of which organisation they claim, so lockout must be
-- computed across all attempts for that email/IP, not hidden behind a
-- tenant boundary. This table carries no business data, only security
-- telemetry, so it is exempt from the tenant-isolation rule that applies
-- to operational tables.
CREATE TABLE login_attempts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid,
  user_id          uuid,
  email_attempted  text NOT NULL,
  ip               text,
  succeeded        boolean NOT NULL,
  attempted_at     timestamptz NOT NULL DEFAULT now(),
  reason           text
);

CREATE INDEX idx_login_attempts_email_time ON login_attempts (email_attempted, attempted_at);
CREATE INDEX idx_login_attempts_ip_time ON login_attempts (ip, attempted_at);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sessions
  USING (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE mfa_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON mfa_secrets
  USING (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
