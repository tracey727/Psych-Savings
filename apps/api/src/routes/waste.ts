import type { Recurrence, RootCauseCategory, WasteCategory } from "@psych-savings/shared-types";
import { Hono } from "hono";
import { createSqlClient } from "../db/client";
import { NeonAuditSink } from "../db/neonAuditSink";
import { NeonAuthStore } from "../db/neonAuthStore";
import { NeonSavingsStore } from "../db/neonSavingsStore";
import { NeonWasteStore } from "../db/neonWasteStore";
import { NeonWorkItemStore } from "../db/neonWorkItemStore";
import { createAuthMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import {
  captureWasteEvent,
  getWasteTotalsByCategory,
  implementIntervention,
  openIntervention,
  openWasteSavingsCase,
  reviewWasteEvent,
  SavingsError,
  suggestBaselineFromIntervention,
  WorkflowError,
} from "../waste/engine";
import type { Env } from "../index";

type Variables = {
  workItemStore: NeonWorkItemStore;
  wasteStore: NeonWasteStore;
  savingsStore: NeonSavingsStore;
  auditSink: NeonAuditSink;
};

/** Phase 12 scope: Staff Time Waste & Duplication (MODULE_REGISTER.md M05). */
export function createWasteRoutes() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

  app.use("*", async (c, next) => {
    if (!c.env.DATABASE_URL) return c.json({ error: "server misconfigured: DATABASE_URL not set" }, 500);
    const sql = createSqlClient(c.env.DATABASE_URL);
    const authStore = new NeonAuthStore(sql);
    c.set("workItemStore", new NeonWorkItemStore(sql));
    c.set("wasteStore", new NeonWasteStore(sql));
    c.set("savingsStore", new NeonSavingsStore(sql));
    c.set("auditSink", new NeonAuditSink(sql));
    return createAuthMiddleware(authStore)(c, next);
  });

  /**
   * Quick capture. Every role that can create in the `waste` domain can
   * post here — including clinicians and reception, who are the people
   * who actually see the waste (docs/architecture/ROLE_MATRIX.md).
   */
  app.post("/events", requirePermission("waste", "create"), async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json<{
      centreId?: string | null;
      category?: WasteCategory;
      staffRole?: string;
      description?: string;
      estimatedMinutes?: number;
      recurrence?: Recurrence;
      occurredAt?: string;
    }>();
    if (!body.category || !body.staffRole || !body.description || !body.estimatedMinutes || !body.recurrence) {
      return c.json(
        { error: "category, staffRole, description, estimatedMinutes and recurrence are required" },
        400,
      );
    }
    try {
      const event = await captureWasteEvent(c.get("wasteStore"), c.get("auditSink"), {
        organisationId: auth.organisationId,
        centreId: body.centreId ?? null,
        reportedByUserId: auth.userId,
        category: body.category,
        staffRole: body.staffRole,
        description: body.description,
        estimatedMinutes: body.estimatedMinutes,
        recurrence: body.recurrence,
        ...(body.occurredAt ? { occurredAt: new Date(body.occurredAt) } : {}),
      });
      return c.json({ event }, 201);
    } catch (err) {
      if (err instanceof WorkflowError) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  app.get("/events", requirePermission("waste", "view"), async (c) => {
    const auth = c.get("auth");
    const category = c.req.query("category") as WasteCategory | undefined;
    const events = await c.get("wasteStore").listWasteEvents(auth.organisationId, {
      ...(category ? { category } : {}),
      ...(c.req.query("unreviewed") === "true" ? { unreviewedOnly: true } : {}),
    });
    return c.json({ events });
  });

  app.post("/events/:id/review", requirePermission("waste", "update"), async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json<{ rootCauseCategory?: RootCauseCategory; rootCauseNote?: string | null }>();
    if (!body.rootCauseCategory) return c.json({ error: "rootCauseCategory is required" }, 400);
    try {
      const event = await reviewWasteEvent(c.get("wasteStore"), c.get("auditSink"), {
        wasteEventId: c.req.param("id"),
        organisationId: auth.organisationId,
        actorUserId: auth.userId,
        rootCauseCategory: body.rootCauseCategory,
        rootCauseNote: body.rootCauseNote ?? null,
      });
      return c.json({ event });
    } catch (err) {
      if (err instanceof WorkflowError) return c.json({ error: err.message }, 404);
      throw err;
    }
  });

  app.get("/totals", requirePermission("waste", "view"), async (c) => {
    const auth = c.get("auth");
    return c.json({ totals: await getWasteTotalsByCategory(c.get("wasteStore"), auth.organisationId) });
  });

  /**
   * Opening an intervention creates owned work, so it needs the `waste`
   * domain's transfer right — which reception and clinician roles do not
   * hold. They report waste; a manager decides what the practice does
   * about it.
   */
  app.post("/interventions", requirePermission("waste", "transfer"), async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json<{
      centreId?: string | null;
      ownerUserId?: string;
      title?: string;
      description?: string | null;
      rootCauseCategory?: RootCauseCategory;
      dueAt?: string;
      nextAction?: string;
      wasteEventIds?: string[];
    }>();
    if (!body.ownerUserId || !body.title || !body.rootCauseCategory || !body.dueAt || !body.nextAction) {
      return c.json(
        { error: "ownerUserId, title, rootCauseCategory, dueAt and nextAction are required" },
        400,
      );
    }
    try {
      const result = await openIntervention(c.get("workItemStore"), c.get("wasteStore"), c.get("auditSink"), {
        organisationId: auth.organisationId,
        centreId: body.centreId ?? null,
        ownerUserId: body.ownerUserId,
        title: body.title,
        description: body.description ?? null,
        rootCauseCategory: body.rootCauseCategory,
        dueAt: new Date(body.dueAt),
        nextAction: body.nextAction,
        wasteEventIds: body.wasteEventIds ?? [],
      });
      return c.json(result, 201);
    } catch (err) {
      if (err instanceof WorkflowError) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  /** The reporters' own estimates, offered to help set a baseline — explicitly not a baseline itself. */
  app.get("/interventions/:id/baseline-suggestion", requirePermission("waste", "view"), async (c) => {
    const auth = c.get("auth");
    try {
      const suggestion = await suggestBaselineFromIntervention(
        c.get("wasteStore"),
        auth.organisationId,
        c.req.param("id"),
      );
      return c.json({ suggestion, note: "Estimates from the reporters, not a measured baseline." });
    } catch (err) {
      if (err instanceof WorkflowError) return c.json({ error: err.message }, 404);
      throw err;
    }
  });

  /** Raises the Category D savings case. Creating savings cases is the `savings` domain, not `waste`. */
  app.post("/interventions/:id/savings-case", requirePermission("savings", "create"), async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json<{
      title?: string;
      baselineMinutes?: number;
      recurrence?: Recurrence;
      method?: string;
      measuredFrom?: string;
      measuredTo?: string;
      sourceReference?: string | null;
    }>();
    if (!body.title || !body.baselineMinutes || !body.recurrence || !body.method || !body.measuredFrom || !body.measuredTo) {
      return c.json(
        { error: "title, baselineMinutes, recurrence, method, measuredFrom and measuredTo are required" },
        400,
      );
    }
    try {
      const savingsCase = await openWasteSavingsCase(
        c.get("wasteStore"),
        c.get("savingsStore"),
        c.get("auditSink"),
        {
          organisationId: auth.organisationId,
          interventionId: c.req.param("id"),
          actorUserId: auth.userId,
          title: body.title,
          baselineMinutes: body.baselineMinutes,
          recurrence: body.recurrence,
          method: body.method,
          measuredFrom: new Date(body.measuredFrom),
          measuredTo: new Date(body.measuredTo),
          sourceReference: body.sourceReference ?? null,
        },
      );
      return c.json({ savingsCase }, 201);
    } catch (err) {
      if (err instanceof SavingsError) return c.json({ error: err.message }, 409);
      if (err instanceof WorkflowError) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  app.post("/interventions/:id/implement", requirePermission("waste", "update"), async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json<{ reason?: string }>();
    if (!body.reason) return c.json({ error: "reason is required" }, 400);
    try {
      const result = await implementIntervention(
        c.get("workItemStore"),
        c.get("wasteStore"),
        c.get("savingsStore"),
        c.get("auditSink"),
        {
          interventionId: c.req.param("id"),
          organisationId: auth.organisationId,
          actorUserId: auth.userId,
          reason: body.reason,
        },
      );
      return c.json(result);
    } catch (err) {
      if (err instanceof SavingsError) return c.json({ error: err.message }, 409);
      if (err instanceof WorkflowError) return c.json({ error: err.message }, 409);
      throw err;
    }
  });

  return app;
}
