import { Hono } from "hono";
import { createSqlClient } from "../db/client";
import { NeonAuditSink } from "../db/neonAuditSink";
import { NeonAuthStore } from "../db/neonAuthStore";
import { NeonReferralStore } from "../db/neonReferralStore";
import { NeonWorkItemStore } from "../db/neonWorkItemStore";
import { createAuthMiddleware } from "../middleware/auth";
import { assertCentreAccess, requirePermission } from "../middleware/permission";
import {
  getConversionStats,
  intakeReferral,
  recordContactAttempt,
  setReferralOutcome,
  WorkflowError,
} from "../referrals/engine";
import type { Env } from "../index";

type Variables = {
  workItemStore: NeonWorkItemStore;
  referralStore: NeonReferralStore;
  auditSink: NeonAuditSink;
};

/** Phase 8 scope: the No Lost Referral™ HTTP surface, built on the Phase 7 work-ownership engine. */
export function createReferralRoutes() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

  app.use("*", async (c, next) => {
    if (!c.env.DATABASE_URL) return c.json({ error: "server misconfigured: DATABASE_URL not set" }, 500);
    const sql = createSqlClient(c.env.DATABASE_URL);
    const authStore = new NeonAuthStore(sql);
    c.set("workItemStore", new NeonWorkItemStore(sql));
    c.set("referralStore", new NeonReferralStore(sql));
    c.set("auditSink", new NeonAuditSink(sql));
    return createAuthMiddleware(authStore)(c, next);
  });

  app.post("/", requirePermission("referrals", "create"), async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json<{
      centreId?: string | null;
      source?: string;
      valueEstimateCents?: number | null;
      firstContactDueAt?: string;
      ownerUserId?: string;
      title?: string;
    }>();
    if (!body.source || !body.firstContactDueAt) {
      return c.json({ error: "source and firstContactDueAt are required" }, 400);
    }
    const centreId = body.centreId ?? null;
    if (!assertCentreAccess(auth, "referrals", centreId)) return c.json({ error: "forbidden_centre" }, 403);

    const result = await intakeReferral(c.get("workItemStore"), c.get("referralStore"), c.get("auditSink"), {
      organisationId: auth.organisationId,
      centreId,
      ownerUserId: body.ownerUserId ?? auth.userId,
      source: body.source,
      valueEstimateCents: body.valueEstimateCents ?? null,
      firstContactDueAt: new Date(body.firstContactDueAt),
      ...(body.title !== undefined ? { title: body.title } : {}),
    });
    return c.json(result, 201);
  });

  app.get("/:id", requirePermission("referrals", "view"), async (c) => {
    const auth = c.get("auth");
    const referral = await c.get("referralStore").getReferral(c.req.param("id"), auth.organisationId);
    if (!referral) return c.json({ error: "not_found" }, 404);
    const workItem = await c.get("workItemStore").getWorkItem(referral.workItemId, auth.organisationId);
    if (!assertCentreAccess(auth, "referrals", workItem?.centreId ?? null)) {
      return c.json({ error: "forbidden_centre" }, 403);
    }
    return c.json({ referral, workItem });
  });

  app.post("/:id/contact-attempts", requirePermission("referrals", "update"), async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json<{
      method?: string;
      outcome?: string;
      notes?: string | null;
      reachedClient?: boolean;
      nextFollowUpDueAt?: string | null;
      nextAction?: string | null;
    }>();
    if (!body.method || !body.outcome || body.reachedClient === undefined) {
      return c.json({ error: "method, outcome and reachedClient are required" }, 400);
    }
    try {
      const referral = await recordContactAttempt(c.get("workItemStore"), c.get("referralStore"), c.get("auditSink"), {
        referralId: c.req.param("id"),
        organisationId: auth.organisationId,
        actorUserId: auth.userId,
        method: body.method,
        outcome: body.outcome,
        notes: body.notes ?? null,
        reachedClient: body.reachedClient,
        ...(body.nextFollowUpDueAt !== undefined
          ? { nextFollowUpDueAt: body.nextFollowUpDueAt ? new Date(body.nextFollowUpDueAt) : null }
          : {}),
        ...(body.nextAction !== undefined ? { nextAction: body.nextAction } : {}),
      });
      return c.json({ referral }, 201);
    } catch (err) {
      if (err instanceof WorkflowError) return c.json({ error: err.message }, 409);
      throw err;
    }
  });

  app.post("/:id/outcome", requirePermission("referrals", "update"), async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json<{ outcome?: "waiting" | "booked" | "declined" | "not_suitable"; lostReason?: string }>();
    if (!body.outcome) return c.json({ error: "outcome is required" }, 400);
    try {
      const result = await setReferralOutcome(c.get("workItemStore"), c.get("referralStore"), c.get("auditSink"), {
        referralId: c.req.param("id"),
        organisationId: auth.organisationId,
        actorUserId: auth.userId,
        outcome: body.outcome,
        ...(body.lostReason !== undefined ? { lostReason: body.lostReason } : {}),
      });
      return c.json(result);
    } catch (err) {
      if (err instanceof WorkflowError) return c.json({ error: err.message }, 409);
      throw err;
    }
  });

  app.get("/reports/conversion", requirePermission("referrals", "view"), async (c) => {
    const stats = await getConversionStats(c.get("referralStore"), c.get("auth").organisationId);
    return c.json({ conversionStats: stats });
  });

  return app;
}
