import type { Role } from "@psych-savings/shared-types";
import type { SessionRecord } from "./session";

export interface UserRecord {
  id: string;
  organisationId: string;
  email: string;
  displayName: string;
  passwordHash: string | null;
  disabledAt: Date | null;
}

export interface MfaSecretRecord {
  secretBase32: string;
  enabledAt: Date | null;
}

export interface CreateSessionInput {
  organisationId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  mfaVerified: boolean;
  ip: string | null;
  userAgent: string | null;
}

export interface RecordLoginAttemptInput {
  organisationId: string | null;
  userId: string | null;
  emailAttempted: string;
  ip: string | null;
  succeeded: boolean;
  reason: string | null;
}

/**
 * Everything the auth flow needs from the database, as an interface —
 * so packages/audit-style testing applies here too: the orchestration
 * logic in login.ts and mfa.ts is unit-tested against an in-memory fake
 * implementation of this interface, and the real Neon-backed
 * implementation (db/neonAuthStore.ts) is exercised only once deployed,
 * per docs/architecture/ENVIRONMENTS.md (this sandbox cannot reach Neon
 * directly over the network).
 */
export interface AuthStore {
  findUserByEmail(organisationId: string, email: string): Promise<UserRecord | null>;
  getRoles(userId: string, organisationId: string): Promise<Role[]>;
  getCentreAssignments(userId: string, organisationId: string): Promise<string[]>;
  getMfaSecret(userId: string, organisationId: string): Promise<MfaSecretRecord | null>;
  setMfaSecret(userId: string, organisationId: string, secretBase32: string): Promise<void>;
  enableMfa(userId: string, organisationId: string): Promise<void>;

  recordLoginAttempt(input: RecordLoginAttemptInput): Promise<void>;
  getRecentFailedAttempts(email: string, ip: string | null, since: Date): Promise<Date[]>;

  createSession(input: CreateSessionInput): Promise<SessionRecord>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  markSessionMfaVerified(sessionId: string, organisationId: string, newExpiresAt: Date): Promise<void>;
  revokeSession(sessionId: string, organisationId: string): Promise<void>;
}
