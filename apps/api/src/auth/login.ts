import type { AuditSink } from "@psych-savings/audit";
import { buildAuditEvent } from "@psych-savings/audit";
import { isPrivilegedRole } from "@psych-savings/permissions";
import { verifyPassword } from "./password";
import { isLockedOut, LOCKOUT_WINDOW_MS } from "./rateLimit";
import {
  generateSessionToken,
  hashSessionToken,
  PENDING_MFA_TTL_MS,
  SESSION_TTL_MS,
} from "./session";
import type { AuthStore } from "./store";
import { generateTotpSecret, verifyTotp } from "./totp";

export interface SignInInput {
  organisationId: string;
  email: string;
  password: string;
  ip: string | null;
  userAgent: string | null;
}

export type SignInResult =
  | { outcome: "locked_out" }
  | { outcome: "invalid_credentials" }
  | { outcome: "mfa_setup_required"; token: string }
  | { outcome: "mfa_required"; token: string }
  | { outcome: "success"; token: string; userId: string; roles: string[] };

/**
 * Sign-in never reveals whether the failure was "no such user" vs "wrong
 * password" (both return invalid_credentials) — this avoids user
 * enumeration. Lockout is checked before touching the password hash so a
 * locked-out attacker cannot keep guessing.
 */
export async function signIn(store: AuthStore, audit: AuditSink, input: SignInInput): Promise<SignInResult> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MS);
  const recentFailures = await store.getRecentFailedAttempts(input.email, input.ip, since);
  if (isLockedOut(recentFailures)) {
    await store.recordLoginAttempt({
      organisationId: input.organisationId,
      userId: null,
      emailAttempted: input.email,
      ip: input.ip,
      succeeded: false,
      reason: "locked_out",
    });
    return { outcome: "locked_out" };
  }

  const user = await store.findUserByEmail(input.organisationId, input.email);
  const passwordOk =
    user?.passwordHash != null ? await verifyPassword(input.password, user.passwordHash) : false;

  if (!user || user.disabledAt !== null || !passwordOk) {
    await store.recordLoginAttempt({
      organisationId: input.organisationId,
      userId: user?.id ?? null,
      emailAttempted: input.email,
      ip: input.ip,
      succeeded: false,
      reason: !user ? "no_such_user" : user.disabledAt !== null ? "disabled" : "bad_password",
    });
    return { outcome: "invalid_credentials" };
  }

  const roles = await store.getRoles(user.id, user.organisationId);
  const requiresMfa = roles.some(isPrivilegedRole);

  if (requiresMfa) {
    const mfaSecret = await store.getMfaSecret(user.id, user.organisationId);
    const token = generateSessionToken();
    const tokenHash = await hashSessionToken(token);
    await store.createSession({
      organisationId: user.organisationId,
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + PENDING_MFA_TTL_MS),
      mfaVerified: false,
      ip: input.ip,
      userAgent: input.userAgent,
    });
    await store.recordLoginAttempt({
      organisationId: user.organisationId,
      userId: user.id,
      emailAttempted: input.email,
      ip: input.ip,
      succeeded: true,
      reason: "password_ok_awaiting_mfa",
    });
    return {
      outcome: mfaSecret?.enabledAt ? "mfa_required" : "mfa_setup_required",
      token,
    };
  }

  const token = generateSessionToken();
  const tokenHash = await hashSessionToken(token);
  await store.createSession({
    organisationId: user.organisationId,
    userId: user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    mfaVerified: true,
    ip: input.ip,
    userAgent: input.userAgent,
  });
  await store.recordLoginAttempt({
    organisationId: user.organisationId,
    userId: user.id,
    emailAttempted: input.email,
    ip: input.ip,
    succeeded: true,
    reason: null,
  });
  await audit.write(
    buildAuditEvent({
      organisationId: user.organisationId,
      actorUserId: user.id,
      action: "sign_in",
      entityType: "session",
      entityId: null,
      source: "api",
    }),
  );

  return { outcome: "success", token, userId: user.id, roles };
}

export interface CompleteMfaInput {
  organisationId: string;
  pendingToken: string;
  code: string;
}

export type CompleteMfaResult =
  | { outcome: "invalid_session" }
  | { outcome: "invalid_code" }
  | { outcome: "success"; userId: string; roles: string[] };

/** Upgrades a pending (password-verified, not-yet-MFA) session to a full session. */
export async function completeMfa(
  store: AuthStore,
  audit: AuditSink,
  input: CompleteMfaInput,
): Promise<CompleteMfaResult> {
  const tokenHash = await hashSessionToken(input.pendingToken);
  const session = await store.findSessionByTokenHash(tokenHash);

  if (
    !session ||
    session.organisationId !== input.organisationId ||
    session.mfaVerified ||
    session.revokedAt !== null ||
    session.expiresAt.getTime() <= Date.now()
  ) {
    return { outcome: "invalid_session" };
  }

  const mfaSecret = await store.getMfaSecret(session.userId, session.organisationId);
  if (!mfaSecret?.enabledAt || !(await verifyTotp(mfaSecret.secretBase32, input.code))) {
    return { outcome: "invalid_code" };
  }

  await store.markSessionMfaVerified(session.id, session.organisationId, new Date(Date.now() + SESSION_TTL_MS));

  const roles = await store.getRoles(session.userId, session.organisationId);
  await audit.write(
    buildAuditEvent({
      organisationId: session.organisationId,
      actorUserId: session.userId,
      action: "mfa_verified",
      entityType: "session",
      entityId: session.id,
      source: "api",
    }),
  );

  return { outcome: "success", userId: session.userId, roles };
}

export interface EnrollMfaInput {
  organisationId: string;
  pendingToken: string;
}

export type EnrollMfaResult =
  | { outcome: "invalid_session" }
  | { outcome: "already_enrolled" }
  | { outcome: "success"; secretBase32: string };

/**
 * Generates and stores a new (not-yet-enabled) TOTP secret for the user
 * behind a pending session. The secret only takes effect — and MFA
 * becomes enforced — once confirmMfaEnrollment verifies a real code
 * generated from it, proving the user actually captured it in an
 * authenticator app.
 */
export async function enrollMfa(store: AuthStore, input: EnrollMfaInput): Promise<EnrollMfaResult> {
  const tokenHash = await hashSessionToken(input.pendingToken);
  const session = await store.findSessionByTokenHash(tokenHash);
  if (
    !session ||
    session.organisationId !== input.organisationId ||
    session.mfaVerified ||
    session.revokedAt !== null ||
    session.expiresAt.getTime() <= Date.now()
  ) {
    return { outcome: "invalid_session" };
  }

  const existing = await store.getMfaSecret(session.userId, session.organisationId);
  if (existing?.enabledAt) return { outcome: "already_enrolled" };

  const secretBase32 = generateTotpSecret();
  await store.setMfaSecret(session.userId, session.organisationId, secretBase32);
  return { outcome: "success", secretBase32 };
}

export interface ConfirmMfaEnrollmentInput {
  organisationId: string;
  pendingToken: string;
  code: string;
}

export type ConfirmMfaEnrollmentResult =
  | { outcome: "invalid_session" }
  | { outcome: "invalid_code" }
  | { outcome: "success"; userId: string; roles: string[] };

export async function confirmMfaEnrollment(
  store: AuthStore,
  audit: AuditSink,
  input: ConfirmMfaEnrollmentInput,
): Promise<ConfirmMfaEnrollmentResult> {
  const tokenHash = await hashSessionToken(input.pendingToken);
  const session = await store.findSessionByTokenHash(tokenHash);
  if (
    !session ||
    session.organisationId !== input.organisationId ||
    session.mfaVerified ||
    session.revokedAt !== null ||
    session.expiresAt.getTime() <= Date.now()
  ) {
    return { outcome: "invalid_session" };
  }

  const secret = await store.getMfaSecret(session.userId, session.organisationId);
  if (!secret || secret.enabledAt || !(await verifyTotp(secret.secretBase32, input.code))) {
    return { outcome: "invalid_code" };
  }

  await store.enableMfa(session.userId, session.organisationId);
  await store.markSessionMfaVerified(session.id, session.organisationId, new Date(Date.now() + SESSION_TTL_MS));

  const roles = await store.getRoles(session.userId, session.organisationId);
  await audit.write(
    buildAuditEvent({
      organisationId: session.organisationId,
      actorUserId: session.userId,
      action: "mfa_enrolled",
      entityType: "session",
      entityId: session.id,
      source: "api",
    }),
  );

  return { outcome: "success", userId: session.userId, roles };
}
