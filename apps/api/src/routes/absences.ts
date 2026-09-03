import { Hono } from "hono";
import {
  acceptHandover,
  completeReturnBriefing,
  declareAbsence,
  escalateUnacceptedHandovers,
  getAbsenceImpactSummary,
  rejectHandover,
  WorkflowError,
} from "../absences/engine";
import { createSqlClient } from "../db/client";
import { NeonAbsenceStore } from "../db/neonAbsenceStore";
import { NeonAuditSink } from "../db/neonAuditSink";
import { NeonAuthStore } from "../db/neonAuthStore";
import { NeonWorkItemStore } from "../db/neonWorkItemStore";
import { createAuthMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import type { Env } from "../index";

type Variables = {
  workItemStore: NeonWorkItemStore;
  absenceStore: NeonAbsenceStore;
  auditSink: NeonAuditSink;
};

/** Phase 11 scope: Leave, Handover & Absence Continuity, built on the Phase 7 transfer-with-acceptance mechanism. */
export function createAbsenceRoutes() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

  app.use("*", async (c, next) => {
    if (!c.env.DATABASE_URL) return c.json({ error: "server misconfigured: DATABASE_URL not set" }, 500);
    const sql = createSqlClient(c.env.DATABASE_URL);
    const authStore = new NeonAuthStore(sql);
    c.set("workItemStore", new NeonWorkItemStore(sql));
    c.set("absenceStore", new NeonAbsenceStore(sql));
    c.set("auditSink", new NeonAuditSink(sql));
    return createAuthMiddleware(authStore)(c, next);
  });

  app.post("/", requirePermission("handovers", "create"), async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json<{
      userId?: string;
      absenceType?: "planned_leave" | "unexpected";
      startsAt?: string;
      endsAt?: string | null;
      temporaryOwnerUserId?: string;
    }>();
    if (!body.userId || !body.absenceType || !body.startsAt || !body.temporaryOwnerUserId) {
      return c.json({ error: "userId, absenceType, startsAt and temporaryOwnerUserId are required" }, 400);
    }
    const result = await declareAbsence(c.get("workItemStore"), c.get("absenceStore"), c.get("auditSink"), {
      organisationId: auth.organisationId,
      userId: body.userId,
      absenceType: body.absenceType,
      startsAt: new Date(body.startsAt),
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      temporaryOwnerUserId: body.temporaryOwnerUserId,
      actorUserId: auth.userId,
    });
    return c.json(result, 201);
  });

  app.get("/:id/impact", requirePermission("handovers", "view"), async (c) => {
    const auth = c.get("auth");
    const summary = await getAbsenceImpactSummary(c.get("workItemStore"), c.get("absenceStore"), auth.organisationId, c.req.param("id"));
    return c.json({ summary });
  });

  app.post("/:id/escalate-unaccepted", requirePermission("handovers", "update"), async (c) => {
    const auth = c.get("auth");
    const escalated = await escalateUnacceptedHandovers(c.get("workItemStore"), c.get("absenceStore"), c.get("auditSink"), {
      absenceId: c.req.param("id"),
      organisationId: auth.organisationId,
      actorUserId: auth.userId,
    });
    return c.json({ escalated });
  });

  app.post("/:id/return-briefing", requirePermission("handovers", "update"), async (c) => {
    const auth = c.get("auth");
    try {
      const result = await completeReturnBriefing(c.get("workItemStore"), c.get("absenceStore"), c.get("auditSink"), {
        absenceId: c.req.param("id"),
        organisationId: auth.organisationId,
        actorUserId: auth.userId,
      });
      return c.json(result);
    } catch (err) {
      if (err instanceof WorkflowError) return c.json({ error: err.message }, 409);
      throw err;
    }
  });

  app.post("/handovers/:handoverId/accept", requirePermission("handovers", "transfer"), async (c) => {
    const auth = c.get("auth");
    try {
      const workItem = await acceptHandover(c.get("workItemStore"), c.get("absenceStore"), c.get("auditSink"), {
        handoverId: c.req.param("handoverId"),
        organisationId: auth.organisationId,
        acceptingUserId: auth.userId,
      });
      return c.json({ workItem });
    } catch (err) {
      if (err instanceof WorkflowError) return c.json({ error: err.message }, 409);
      throw err;
    }
  });

  app.post("/handovers/:handoverId/reject", requirePermission("handovers", "transfer"), async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json<{ reason?: string }>();
    if (!body.reason) return c.json({ error: "reason is required" }, 400);
    try {
      const workItem = await rejectHandover(c.get("workItemStore"), c.get("absenceStore"), c.get("auditSink"), {
        handoverId: c.req.param("handoverId"),
        organisationId: auth.organisationId,
        rejectingUserId: auth.userId,
        reason: body.reason,
        actorUserId: auth.userId,
      });
      return c.json({ workItem });
    } catch (err) {
      if (err instanceof WorkflowError) return c.json({ error: err.message }, 409);
      throw err;
    }
  });

  return app;
}
