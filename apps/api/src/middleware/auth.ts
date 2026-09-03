import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { RequestAuthContext } from "../auth/context";
import { hashSessionToken, isSessionUsable } from "../auth/session";
import type { AuthStore } from "../auth/store";

export const SESSION_COOKIE_NAME = "psych_savings_session";

declare module "hono" {
  interface ContextVariableMap {
    auth: RequestAuthContext;
  }
}

/**
 * Verifies the session cookie and attaches a RequestAuthContext, or
 * rejects with 401. This is the API-layer half of the Phase 6 GREEN
 * gate ("unauthorised cross-user ... access is denied by API and
 * database controls") — no valid, unrevoked, unexpired, MFA-complete
 * session means no request proceeds, full stop.
 */
export function createAuthMiddleware(store: AuthStore): MiddlewareHandler {
  return async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE_NAME);
    if (!token) return c.json({ error: "unauthenticated" }, 401);

    const tokenHash = await hashSessionToken(token);
    const session = await store.findSessionByTokenHash(tokenHash);
    if (!session || !isSessionUsable(session) || !session.mfaVerified) {
      return c.json({ error: "unauthenticated" }, 401);
    }

    const [roles, centreIds] = await Promise.all([
      store.getRoles(session.userId, session.organisationId),
      store.getCentreAssignments(session.userId, session.organisationId),
    ]);

    c.set("auth", {
      userId: session.userId,
      organisationId: session.organisationId,
      roles,
      centreIds,
    });

    await next();
  };
}
