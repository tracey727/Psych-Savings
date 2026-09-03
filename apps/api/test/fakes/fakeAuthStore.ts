import type { Role } from "@psych-savings/shared-types";
import type { SessionRecord } from "../../src/auth/session";
import type {
  AuthStore,
  CreateSessionInput,
  MfaSecretRecord,
  RecordLoginAttemptInput,
  UserRecord,
} from "../../src/auth/store";

/** In-memory AuthStore for testing the sign-in/MFA orchestration without a database. */
export class FakeAuthStore implements AuthStore {
  users: UserRecord[] = [];
  roles = new Map<string, Role[]>(); // key: `${userId}:${organisationId}`
  centreAssignments = new Map<string, string[]>(); // key: `${userId}:${organisationId}`
  mfaSecrets = new Map<string, MfaSecretRecord>(); // key: `${userId}:${organisationId}`
  loginAttempts: (RecordLoginAttemptInput & { attemptedAt: Date })[] = [];
  sessions = new Map<string, SessionRecord & { tokenHash: string }>();
  private idCounter = 0;

  private key(userId: string, organisationId: string) {
    return `${userId}:${organisationId}`;
  }

  async findUserByEmail(organisationId: string, email: string): Promise<UserRecord | null> {
    return this.users.find((u) => u.organisationId === organisationId && u.email === email) ?? null;
  }

  async getRoles(userId: string, organisationId: string): Promise<Role[]> {
    return this.roles.get(this.key(userId, organisationId)) ?? [];
  }

  async getCentreAssignments(userId: string, organisationId: string): Promise<string[]> {
    return this.centreAssignments.get(this.key(userId, organisationId)) ?? [];
  }

  async getMfaSecret(userId: string, organisationId: string): Promise<MfaSecretRecord | null> {
    return this.mfaSecrets.get(this.key(userId, organisationId)) ?? null;
  }

  async setMfaSecret(userId: string, organisationId: string, secretBase32: string): Promise<void> {
    this.mfaSecrets.set(this.key(userId, organisationId), { secretBase32, enabledAt: null });
  }

  async enableMfa(userId: string, organisationId: string): Promise<void> {
    const existing = this.mfaSecrets.get(this.key(userId, organisationId));
    if (existing) existing.enabledAt = new Date();
  }

  async recordLoginAttempt(input: RecordLoginAttemptInput): Promise<void> {
    this.loginAttempts.push({ ...input, attemptedAt: new Date() });
  }

  async getRecentFailedAttempts(email: string, _ip: string | null, since: Date): Promise<Date[]> {
    return this.loginAttempts
      .filter((a) => a.emailAttempted === email && !a.succeeded && a.attemptedAt >= since)
      .map((a) => a.attemptedAt);
  }

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const id = `session-${++this.idCounter}`;
    const record: SessionRecord & { tokenHash: string } = {
      id,
      organisationId: input.organisationId,
      userId: input.userId,
      expiresAt: input.expiresAt,
      revokedAt: null,
      mfaVerified: input.mfaVerified,
      tokenHash: input.tokenHash,
    };
    this.sessions.set(input.tokenHash, record);
    return record;
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    return this.sessions.get(tokenHash) ?? null;
  }

  async markSessionMfaVerified(sessionId: string, _organisationId: string, newExpiresAt: Date): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.id === sessionId) {
        session.mfaVerified = true;
        session.expiresAt = newExpiresAt;
      }
    }
  }

  async revokeSession(sessionId: string, _organisationId: string): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.id === sessionId) session.revokedAt = new Date();
    }
  }
}
