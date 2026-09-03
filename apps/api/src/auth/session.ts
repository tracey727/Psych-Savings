/**
 * Session tokens are opaque random values handed to the client; only
 * their SHA-256 hash is ever persisted (database/migrations/0007_auth_spine.sql
 * "sessions.token_hash"), so reading the sessions table can never yield a
 * usable token. Sessions are DB-backed so expiry and revocation
 * (Phase 6 item 3) are real, queryable facts, not just a JWT claim
 * nobody can revoke early.
 */

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
export const PENDING_MFA_TTL_MS = 5 * 60 * 1000; // 5 minutes to complete MFA after password check

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateSessionToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface SessionRecord {
  id: string;
  organisationId: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  mfaVerified: boolean;
}

/** A session is usable only if unexpired and unrevoked. Whether it also
 *  needs to be `mfaVerified` is a separate, caller-decided check — a
 *  pending (not-yet-MFA-verified) session is deliberately still "not
 *  expired" so it can be used for the /auth/mfa/verify step itself. */
export function isSessionUsable(session: SessionRecord, now: Date = new Date()): boolean {
  if (session.revokedAt !== null) return false;
  if (session.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}
