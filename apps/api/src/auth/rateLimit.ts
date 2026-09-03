/**
 * Login lockout policy (Phase 6 item 7: "rate limiting, lockout and abuse
 * controls"). Pure decision logic over a list of recent attempt
 * timestamps, kept separate from the database query that produces that
 * list, so the policy itself is unit-testable without a live database.
 * The query lives in db/authStore.ts (queries `login_attempts`, which is
 * keyed by email/IP, not by organisation — see
 * database/migrations/0007_auth_spine.sql for why).
 */

export const LOCKOUT_THRESHOLD = 10;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export function isLockedOut(recentFailedAttemptTimestamps: readonly Date[], now: Date = new Date()): boolean {
  const windowStart = now.getTime() - LOCKOUT_WINDOW_MS;
  const countInWindow = recentFailedAttemptTimestamps.filter((t) => t.getTime() >= windowStart).length;
  return countInWindow >= LOCKOUT_THRESHOLD;
}
