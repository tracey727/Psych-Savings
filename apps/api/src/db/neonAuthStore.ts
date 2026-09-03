import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { Role } from "@psych-savings/shared-types";
import type { SessionRecord } from "../auth/session";
import type {
  AuthStore,
  CreateSessionInput,
  MfaSecretRecord,
  RecordLoginAttemptInput,
  UserRecord,
} from "../auth/store";

type Sql = NeonQueryFunction<false, false>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/**
 * Real Neon-backed AuthStore. Every org-scoped query runs inside a
 * transaction that first sets `app.current_org_id` (the RLS GUC from
 * database/migrations/0005_row_level_security.sql), so this store is
 * subject to the same tenant isolation proven live in Phase 5 — it is
 * not a trusted bypass, it is an ordinary least-privilege client.
 *
 * NOT exercised by this repository's local test suite: this sandbox's
 * network egress cannot reach Neon directly (see
 * docs/architecture/ENVIRONMENTS.md). The orchestration logic that calls
 * this store (src/auth/login.ts) IS fully tested, against an in-memory
 * fake implementing the same AuthStore interface
 * (test/fakes/fakeAuthStore.ts) — this file is the thin, deliberately
 * simple adapter between that tested logic and real SQL.
 */
export class NeonAuthStore implements AuthStore {
  constructor(private readonly sql: Sql) {}

  async findUserByEmail(organisationId: string, email: string): Promise<UserRecord | null> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select id, organisation_id, email, display_name, password_hash, disabled_at
         from users where organisation_id = ${organisationId} and email = ${email}`,
    ]);
    const r = (rows as Row[])[0];
    if (!r) return null;
    return {
      id: r.id,
      organisationId: r.organisation_id,
      email: r.email,
      displayName: r.display_name,
      passwordHash: r.password_hash,
      disabledAt: r.disabled_at ? new Date(r.disabled_at) : null,
    };
  }

  async getRoles(userId: string, organisationId: string): Promise<Role[]> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select role_key from user_role_assignments where user_id = ${userId} and organisation_id = ${organisationId}`,
    ]);
    return (rows as Row[]).map((r) => r.role_key as Role);
  }

  async getCentreAssignments(userId: string, organisationId: string): Promise<string[]> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select centre_id from user_centre_assignments where user_id = ${userId} and organisation_id = ${organisationId}`,
    ]);
    return (rows as Row[]).map((r) => r.centre_id as string);
  }

  async getMfaSecret(userId: string, organisationId: string): Promise<MfaSecretRecord | null> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select secret_base32, enabled_at from mfa_secrets where user_id = ${userId} and organisation_id = ${organisationId}`,
    ]);
    const r = (rows as Row[])[0];
    if (!r) return null;
    return { secretBase32: r.secret_base32, enabledAt: r.enabled_at ? new Date(r.enabled_at) : null };
  }

  async setMfaSecret(userId: string, organisationId: string, secretBase32: string): Promise<void> {
    await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`insert into mfa_secrets (organisation_id, user_id, secret_base32, enabled_at)
         values (${organisationId}, ${userId}, ${secretBase32}, null)
         on conflict (user_id) do update set secret_base32 = excluded.secret_base32, enabled_at = null`,
    ]);
  }

  async enableMfa(userId: string, organisationId: string): Promise<void> {
    await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`update mfa_secrets set enabled_at = now() where user_id = ${userId} and organisation_id = ${organisationId}`,
    ]);
  }

  async recordLoginAttempt(input: RecordLoginAttemptInput): Promise<void> {
    // login_attempts carries no RLS (see 0007_auth_spine.sql) — it is
    // security telemetry keyed by email/IP, not tenant business data.
    await this.sql`
      insert into login_attempts (organisation_id, user_id, email_attempted, ip, succeeded, reason)
      values (${input.organisationId}, ${input.userId}, ${input.emailAttempted}, ${input.ip}, ${input.succeeded}, ${input.reason})
    `;
  }

  async getRecentFailedAttempts(email: string, _ip: string | null, since: Date): Promise<Date[]> {
    const rows = (await this.sql`
      select attempted_at from login_attempts
      where email_attempted = ${email} and succeeded = false and attempted_at >= ${since.toISOString()}
    `) as Row[];
    return rows.map((r) => new Date(r.attempted_at));
  }

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${input.organisationId}, true)`,
      tx`insert into sessions (organisation_id, user_id, token_hash, expires_at, mfa_verified, ip, user_agent)
         values (${input.organisationId}, ${input.userId}, ${input.tokenHash}, ${input.expiresAt.toISOString()}, ${input.mfaVerified}, ${input.ip}, ${input.userAgent})
         returning id, organisation_id, user_id, expires_at, revoked_at, mfa_verified`,
    ]);
    return toSessionRecord((rows as Row[])[0]!);
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    // See database/migrations/0008_session_lookup_function.sql for why
    // this two-step lookup exists: RLS cannot be satisfied until we know
    // which organisation the token belongs to.
    const lookupRows = (await this.sql`select lookup_session_organisation(${tokenHash}) as organisation_id`) as Row[];
    const organisationId = lookupRows[0]?.organisation_id as string | null | undefined;
    if (!organisationId) return null;

    const [, rows] = await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`select id, organisation_id, user_id, expires_at, revoked_at, mfa_verified
         from sessions where token_hash = ${tokenHash}`,
    ]);
    const r = (rows as Row[])[0];
    return r ? toSessionRecord(r) : null;
  }

  async markSessionMfaVerified(sessionId: string, organisationId: string, newExpiresAt: Date): Promise<void> {
    await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`update sessions set mfa_verified = true, expires_at = ${newExpiresAt.toISOString()} where id = ${sessionId} and organisation_id = ${organisationId}`,
    ]);
  }

  async revokeSession(sessionId: string, organisationId: string): Promise<void> {
    await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${organisationId}, true)`,
      tx`update sessions set revoked_at = now() where id = ${sessionId} and organisation_id = ${organisationId}`,
    ]);
  }
}

function toSessionRecord(r: Row): SessionRecord {
  return {
    id: r.id,
    organisationId: r.organisation_id,
    userId: r.user_id,
    expiresAt: new Date(r.expires_at),
    revokedAt: r.revoked_at ? new Date(r.revoked_at) : null,
    mfaVerified: r.mfa_verified,
  };
}
