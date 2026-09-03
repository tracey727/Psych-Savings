import type { Action, Domain } from "@psych-savings/permissions";
import { can, hasCentreAccess } from "@psych-savings/permissions";
import type { Role } from "@psych-savings/shared-types";
import type { MiddlewareHandler } from "hono";

/**
 * Requires that at least one of the authenticated user's roles grants
 * `action` on `domain`, per docs/architecture/ROLE_MATRIX.md. Must run
 * after createAuthMiddleware (relies on `c.get("auth")`).
 */
export function requirePermission(domain: Domain, action: Action): MiddlewareHandler {
  return async (c, next) => {
    const auth = c.get("auth");
    const allowed = auth.roles.some((role) => can(role, domain, action));
    if (!allowed) return c.json({ error: "forbidden" }, 403);
    await next();
  };
}

/**
 * Centre-scope check for a specific resource, called by a route handler
 * once it knows the resource's centre_id (unlike organisation isolation,
 * which is enforced uniformly by RLS, centre scope varies per role — see
 * docs/architecture/ROLE_MATRIX.md §5). Returns false if no role the
 * user holds for `domain` covers `resourceCentreId`.
 */
export function assertCentreAccess(
  auth: { roles: readonly Role[]; centreIds: readonly string[] },
  domain: Domain,
  resourceCentreId: string | null,
): boolean {
  return auth.roles.some((role) => hasCentreAccess(role, domain, auth.centreIds, resourceCentreId));
}
