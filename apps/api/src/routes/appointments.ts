import { Hono } from "hono";
import {
  captureVacancy,
  getLeakagePatternReport,
  getOutreachHistory,
  getVacancySummary,
  recordOutreachAttempt,
  setRefillOutcome,
  WorkflowError,
} from "../appointments/engine";
import { createSqlClient } from "../db/client";
import { NeonAppointmentVacancyStore } from "../db/neonAppointmentVacancyStore";
import { NeonAuditSink } from "../db/neonAuditSink";
import { NeonAuthStore } from "../db/neonAuthStore";
import { NeonWorkItemStore } from "../db/neonWorkItemStore";
import { createAuthMiddleware } from "../middleware/auth";
import { assertCentreAccess, requirePermission } from "../middleware/permission";
import type { Env } from "../index";

type Variables = {
  workItemStore: NeonWorkItemStore;
  vacancyStore: NeonAppointmentVacancyStore;
  auditSink: NeonAuditSink;
};

/** Phase 10 scope: the Appointment Leakage & Refill HTTP surface, built on the Phase 7 work-ownership engine. */
export function createAppointmentRoutes() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

  app.use("*", async (c, next) => {
    if (!c.env.DATABASE_URL) return c.json({ error: "server misconfigured: DATABASE_URL not set" }, 500);
    const sql = createSqlClient(c.env.DATABASE_URL);
    const authStore = new NeonAuthStore(sql);
    c.set("workItemStore", new NeonWorkItemStore(sql));
    c.set("vacancyStore", new NeonAppointmentVacancyStore(sql));
    c.set("auditSink", new NeonAuditSink(sql));
    return createAuthMiddleware(authStore)(c, next);
  });

  app.post("/", requirePermission("appointments", "create"), async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json<{
      centreId?: string | null;
      cancellationReason?: string;
      originalValueCents?: number | null;
      slotTime?: string | null;
      refillWindowDueAt?: string;
      ownerUserId?: string;
    }>();
    if (!body.cancellationReason || !body.refillWindowDueAt) {
      return c.json({ error: "cancellationReason and refillWindowDueAt are required" }, 400);
    }
    const centreId = body.centreId ?? null;
    if (!assertCentreAccess(auth, "appointments", centreId)) return c.json({ error: "forbidden_centre" }, 403);

    const result = await captureVacancy(c.get("workItemStore"), c.get("vacancyStore"), c.get("auditSink"), {
      organisationId: auth.organisationId,
      centreId,
      ownerUserId: body.ownerUserId ?? auth.userId,
      cancellationReason: body.cancellationReason,
      originalValueCents: body.originalValueCents ?? null,
      slotTime: body.slotTime ? new Date(body.slotTime) : null,
      refillWindowDueAt: new Date(body.refillWindowDueAt),
    });
    return c.json(result, 201);
  });

  app.get("/reports/leakage-patterns", requirePermission("appointments", "view"), async (c) => {
    const report = await getLeakagePatternReport(c.get("vacancyStore"), c.get("auth").organisationId);
    return c.json({ leakagePatterns: report });
  });

  app.get("/reports/summary", requirePermission("appointments", "view"), async (c) => {
    const summary = await getVacancySummary(c.get("vacancyStore"), c.get("auth").organisationId);
    return c.json({ summary });
  });

  app.get("/:id", requirePermission("appointments", "view"), async (c) => {
    const auth = c.get("auth");
    const vacancy = await c.get("vacancyStore").getVacancy(c.req.param("id"), auth.organisationId);
    if (!vacancy) return c.json({ error: "not_found" }, 404);
    const workItem = await c.get("workItemStore").getWorkItem(vacancy.workItemId, auth.organisationId);
    if (!assertCentreAccess(auth, "appointments", workItem?.centreId ?? null)) {
      return c.json({ error: "forbidden_centre" }, 403);
    }
    return c.json({ vacancy, workItem });
  });

  app.post("/:id/outreach-attempts", requirePermission("appointments", "update"), async (c) => {
    const auth = c.get("auth");
    const vacancy = await c.get("vacancyStore").getVacancy(c.req.param("id"), auth.organisationId);
    if (!vacancy) return c.json({ error: "not_found" }, 404);
    const body = await c.req.json<{ outcome?: string; notes?: string | null }>();
    if (!body.outcome) return c.json({ error: "outcome is required" }, 400);

    const evidence = await recordOutreachAttempt(c.get("workItemStore"), c.get("auditSink"), {
      workItemId: vacancy.workItemId,
      organisationId: auth.organisationId,
      actorUserId: auth.userId,
      outcome: body.outcome,
      notes: body.notes ?? null,
    });
    return c.json({ outreachAttempt: evidence }, 201);
  });

  app.get("/:id/outreach-attempts", requirePermission("appointments", "view"), async (c) => {
    const auth = c.get("auth");
    const vacancy = await c.get("vacancyStore").getVacancy(c.req.param("id"), auth.organisationId);
    if (!vacancy) return c.json({ error: "not_found" }, 404);
    const history = await getOutreachHistory(c.get("workItemStore"), vacancy.workItemId, auth.organisationId);
    return c.json({ outreachAttempts: history });
  });

  app.post("/:id/refill-outcome", requirePermission("appointments", "update"), async (c) => {
    const auth = c.get("auth");
    const vacancy = await c.get("vacancyStore").getVacancy(c.req.param("id"), auth.organisationId);
    if (!vacancy) return c.json({ error: "not_found" }, 404);

    const body = await c.req.json<{ outcome?: "refilled" | "not_refilled"; recoveredValueCents?: number }>();
    if (!body.outcome) return c.json({ error: "outcome is required" }, 400);

    try {
      const result = await setRefillOutcome(c.get("workItemStore"), c.get("vacancyStore"), c.get("auditSink"), {
        vacancyId: vacancy.id,
        workItemId: vacancy.workItemId,
        organisationId: auth.organisationId,
        actorUserId: auth.userId,
        outcome: body.outcome,
        ...(body.recoveredValueCents !== undefined ? { recoveredValueCents: body.recoveredValueCents } : {}),
      });
      return c.json(result);
    } catch (err) {
      if (err instanceof WorkflowError) return c.json({ error: err.message }, 409);
      throw err;
    }
  });

  return app;
}
