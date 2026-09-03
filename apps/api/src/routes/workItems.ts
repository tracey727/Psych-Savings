import {
  acceptTransfer,
  beginRecovery,
  closeWorkItem,
  createWorkItem,
  escalate,
  getContactAttemptHistory,
  getQueue,
  getTeamWorkload,
  recordContactAttempt,
  rejectTransfer,
  reopenWorkItem,
  requestTransfer,
  resolveEscalation,
  WorkflowError,
} from "@psych-savings/workflow-engine";
import { Hono } from "hono";
import { createSqlClient } from "../db/client";
import { NeonAuditSink } from "../db/neonAuditSink";
import { NeonAuthStore } from "../db/neonAuthStore";
import { NeonWorkItemStore } from "../db/neonWorkItemStore";
import { createAuthMiddleware } from "../middleware/auth";
import { assertCentreAccess, requirePermission } from "../middleware/permission";
import type { Env } from "../index";

type Variables = {
  workItemStore: NeonWorkItemStore;
  auditSink: NeonAuditSink;
};

/**
 * Phase 7 scope: the generic work-ownership engine's HTTP surface.
 * Domain-specific routes (referrals, appointments, ...) reuse this same
 * engine from Phase 8 onward rather than re-implementing ownership —
 * see docs/product/LOSS_MAP_BASELINE.md §7.
 *
 * Every route requires a full session (createAuthMiddleware) and the
 * matching packages/permissions grant (requirePermission); centre-scoped
 * actions additionally check assertCentreAccess once the resource's
 * centre_id is known. This is the API half of the Phase 6/7 guarantee
 * that unauthorised cross-user/cross-centre access is denied.
 */
export function createWorkItemRoutes() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

  app.use("*", async (c, next) => {
    if (!c.env.DATABASE_URL) return c.json({ error: "server misconfigured: DATABASE_URL not set" }, 500);
    const sql = createSqlClient(c.env.DATABASE_URL);
    const authStore = new NeonAuthStore(sql);
    c.set("workItemStore", new NeonWorkItemStore(sql));
    c.set("auditSink", new NeonAuditSink(sql));
    return createAuthMiddleware(authStore)(c, next);
  });

  app.post("/", requirePermission("work_items", "create"), async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json<{
      centreId?: string | null;
      domain?: string;
      title?: string;
      ownerUserId?: string;
      priority?: "low" | "normal" | "high" | "urgent";
      dueAt?: string | null;
      nextAction?: string | null;
    }>();
    if (!body.domain || !body.title) return c.json({ error: "domain and title are required" }, 400);

    const centreId = body.centreId ?? null;
    if (!assertCentreAccess(auth, "work_items", centreId)) return c.json({ error: "forbidden_centre" }, 403);

    const item = await createWorkItem(c.get("workItemStore"), c.get("auditSink"), {
      organisationId: auth.organisationId,
      centreId,
      domain: body.domain,
      title: body.title,
      ownerUserId: body.ownerUserId ?? auth.userId,
      priority: body.priority ?? "normal",
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
      nextAction: body.nextAction ?? null,
    });
    return c.json({ workItem: item }, 201);
  });

  // Phase 9 — the reception/callback queue is a filtered, sorted view
  // over work_items (MODULE_REGISTER.md M02), not a separate resource.
  // Registered before "/:id" so "queue"/"workload" are never swallowed
  // by the :id param route.
  app.get("/queue", requirePermission("work_items", "view"), async (c) => {
    const auth = c.get("auth");
    const domain = c.req.query("domain");
    const items = await getQueue(c.get("workItemStore"), auth.organisationId, domain ? { domain } : {});
    // assigned_centres roles only see their own centres' items — same
    // rule assertCentreAccess enforces per-resource elsewhere, applied
    // here as a filter over the whole queue.
    const visible = items.filter((item) => assertCentreAccess(auth, "work_items", item.centreId));
    return c.json({ queue: visible });
  });

  app.get("/workload", requirePermission("work_items", "view"), async (c) => {
    const auth = c.get("auth");
    const centreId = c.req.query("centreId") ?? null;
    if (centreId !== null && !assertCentreAccess(auth, "work_items", centreId)) {
      return c.json({ error: "forbidden_centre" }, 403);
    }
    const workload = await getTeamWorkload(c.get("workItemStore"), auth.organisationId, centreId);
    return c.json({ workload });
  });

  app.get("/:id", requirePermission("work_items", "view"), async (c) => {
    const auth = c.get("auth");
    const item = await c.get("workItemStore").getWorkItem(c.req.param("id"), auth.organisationId);
    if (!item) return c.json({ error: "not_found" }, 404);
    if (!assertCentreAccess(auth, "work_items", item.centreId)) return c.json({ error: "forbidden_centre" }, 403);
    return c.json({ workItem: item });
  });

  app.post("/:id/contact-attempts", requirePermission("work_items", "update"), async (c) => {
    const auth = c.get("auth");
    const store = c.get("workItemStore");
    const item = await store.getWorkItem(c.req.param("id"), auth.organisationId);
    if (!item) return c.json({ error: "not_found" }, 404);
    if (!assertCentreAccess(auth, "work_items", item.centreId)) return c.json({ error: "forbidden_centre" }, 403);

    const body = await c.req.json<{ outcome?: string; notes?: string | null }>();
    if (!body.outcome) return c.json({ error: "outcome is required" }, 400);

    const evidence = await recordContactAttempt(store, c.get("auditSink"), {
      workItemId: item.id,
      organisationId: auth.organisationId,
      actorUserId: auth.userId,
      outcome: body.outcome,
      notes: body.notes ?? null,
    });
    return c.json({ contactAttempt: evidence }, 201);
  });

  app.get("/:id/contact-attempts", requirePermission("work_items", "view"), async (c) => {
    const auth = c.get("auth");
    const store = c.get("workItemStore");
    const item = await store.getWorkItem(c.req.param("id"), auth.organisationId);
    if (!item) return c.json({ error: "not_found" }, 404);
    if (!assertCentreAccess(auth, "work_items", item.centreId)) return c.json({ error: "forbidden_centre" }, 403);

    const history = await getContactAttemptHistory(store, item.id, auth.organisationId);
    return c.json({ contactAttempts: history });
  });

  app.post("/:id/transfer", requirePermission("work_items", "transfer"), async (c) => {
    const auth = c.get("auth");
    const store = c.get("workItemStore");
    const item = await store.getWorkItem(c.req.param("id"), auth.organisationId);
    if (!item) return c.json({ error: "not_found" }, 404);
    if (!assertCentreAccess(auth, "work_items", item.centreId)) return c.json({ error: "forbidden_centre" }, 403);

    const body = await c.req.json<{ toUserId?: string; reason?: string }>();
    if (!body.toUserId) return c.json({ error: "toUserId is required" }, 400);

    try {
      const transfer = await requestTransfer(store, c.get("auditSink"), {
        workItemId: item.id,
        organisationId: auth.organisationId,
        requestedByUserId: auth.userId,
        toUserId: body.toUserId,
        reason: body.reason ?? null,
      });
      return c.json({ transfer }, 201);
    } catch (err) {
      if (err instanceof WorkflowError) return c.json({ error: err.message }, 409);
      throw err;
    }
  });

  app.post("/transfers/:transferId/accept", requirePermission("work_items", "transfer"), async (c) => {
    const auth = c.get("auth");
    try {
      const item = await acceptTransfer(c.get("workItemStore"), c.get("auditSink"), {
        transferId: c.req.param("transferId"),
        organisationId: auth.organisationId,
        acceptingUserId: auth.userId,
      });
      return c.json({ workItem: item });
    } catch (err) {
      if (err instanceof WorkflowError) return c.json({ error: err.message }, 409);
      throw err;
    }
  });

  app.post("/transfers/:transferId/reject", requirePermission("work_items", "transfer"), async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json<{ reason?: string }>();
    if (!body.reason) return c.json({ error: "reason is required" }, 400);
    try {
      await rejectTransfer(c.get("workItemStore"), c.get("auditSink"), {
        transferId: c.req.param("transferId"),
        organisationId: auth.organisationId,
        rejectingUserId: auth.userId,
        reason: body.reason,
      });
      return c.json({ outcome: "success" });
    } catch (err) {
      if (err instanceof WorkflowError) return c.json({ error: err.message }, 409);
      throw err;
    }
  });

  app.post("/:id/escalate", requirePermission("work_items", "update"), async (c) => {
    const auth = c.get("auth");
    const store = c.get("workItemStore");
    const item = await store.getWorkItem(c.req.param("id"), auth.organisationId);
    if (!item) return c.json({ error: "not_found" }, 404);
    if (!assertCentreAccess(auth, "work_items", item.centreId)) return c.json({ error: "forbidden_centre" }, 403);

    const body = await c.req.json<{ escalatedToUserId?: string | null; reason?: string }>();
    if (!body.reason) return c.json({ error: "reason is required" }, 400);

    const { workItem, escalation } = await escalate(store, c.get("auditSink"), {
      workItemId: item.id,
      organisationId: auth.organisationId,
      escalatedToUserId: body.escalatedToUserId ?? null,
      reason: body.reason,
      actorUserId: auth.userId,
    });
    return c.json({ workItem, escalation }, 201);
  });

  app.post("/escalations/:escalationId/resolve", requirePermission("work_items", "update"), async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json<{ workItemId?: string }>();
    if (!body.workItemId) return c.json({ error: "workItemId is required" }, 400);

    const item = await resolveEscalation(c.get("workItemStore"), c.get("auditSink"), {
      escalationId: c.req.param("escalationId"),
      workItemId: body.workItemId,
      organisationId: auth.organisationId,
      actorUserId: auth.userId,
    });
    return c.json({ workItem: item });
  });

  app.post("/:id/begin-recovery", requirePermission("work_items", "update"), async (c) => {
    const auth = c.get("auth");
    try {
      const item = await beginRecovery(c.get("workItemStore"), c.get("auditSink"), {
        workItemId: c.req.param("id"),
        organisationId: auth.organisationId,
        actorUserId: auth.userId,
      });
      return c.json({ workItem: item });
    } catch (err) {
      if (err instanceof WorkflowError) return c.json({ error: err.message }, 409);
      throw err;
    }
  });

  app.post("/:id/close", requirePermission("work_items", "close"), async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json<{ reason?: string }>();
    if (!body.reason) return c.json({ error: "reason is required" }, 400);
    try {
      const item = await closeWorkItem(c.get("workItemStore"), c.get("auditSink"), {
        workItemId: c.req.param("id"),
        organisationId: auth.organisationId,
        actorUserId: auth.userId,
        reason: body.reason,
      });
      return c.json({ workItem: item });
    } catch (err) {
      if (err instanceof WorkflowError) return c.json({ error: err.message }, 409);
      throw err;
    }
  });

  app.post("/:id/reopen", requirePermission("work_items", "close"), async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json<{ reason?: string }>();
    if (!body.reason) return c.json({ error: "reason is required" }, 400);
    try {
      const item = await reopenWorkItem(c.get("workItemStore"), c.get("auditSink"), {
        workItemId: c.req.param("id"),
        organisationId: auth.organisationId,
        actorUserId: auth.userId,
        reason: body.reason,
      });
      return c.json({ workItem: item });
    } catch (err) {
      if (err instanceof WorkflowError) return c.json({ error: err.message }, 409);
      throw err;
    }
  });

  return app;
}
