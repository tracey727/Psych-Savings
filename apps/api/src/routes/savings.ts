import {
  addSavingsEvidence,
  approveSavingsCase,
  closeSavingsCase,
  getVerifiedSavingsTotals,
  measureSavingsCase,
  SavingsError,
  verifySavingsCase,
} from "@psych-savings/savings-engine";
import type { EvidenceType, SavingsState } from "@psych-savings/shared-types";
import { Hono } from "hono";
import { createSqlClient } from "../db/client";
import { NeonAuditSink } from "../db/neonAuditSink";
import { NeonAuthStore } from "../db/neonAuthStore";
import { NeonSavingsStore } from "../db/neonSavingsStore";
import { createAuthMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import type { Env } from "../index";

type Variables = {
  savingsStore: NeonSavingsStore;
  auditSink: NeonAuditSink;
};

/**
 * The savings-case lifecycle, built in Phase 12 because its GREEN GATE
 * requires a case to reach Verified. Phase 16 adds the period roll-ups
 * and dashboard reconstruction on top of these endpoints.
 */
export function createSavingsRoutes() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

  app.use("*", async (c, next) => {
    if (!c.env.DATABASE_URL) return c.json({ error: "server misconfigured: DATABASE_URL not set" }, 500);
    const sql = createSqlClient(c.env.DATABASE_URL);
    const authStore = new NeonAuthStore(sql);
    c.set("savingsStore", new NeonSavingsStore(sql));
    c.set("auditSink", new NeonAuditSink(sql));
    return createAuthMiddleware(authStore)(c, next);
  });

  app.get("/cases", requirePermission("savings", "view"), async (c) => {
    const auth = c.get("auth");
    const state = c.req.query("state") as SavingsState | undefined;
    const cases = await c.get("savingsStore").listCases(auth.organisationId, {
      ...(state ? { state } : {}),
      ...(c.req.query("includeClosed") === "true" ? { includeClosed: true } : {}),
    });
    return c.json({ cases });
  });

  /** Every headline figure must be reconstructable from these two, per the Phase 16/17 gates. */
  app.get("/cases/:id/history", requirePermission("savings", "view"), async (c) => {
    const auth = c.get("auth");
    const store = c.get("savingsStore");
    const [history, evidence] = await Promise.all([
      store.listStateHistory(c.req.param("id"), auth.organisationId),
      store.listEvidence(c.req.param("id"), auth.organisationId),
    ]);
    return c.json({ history, evidence });
  });

  app.post("/cases/:id/approve", requirePermission("savings", "update"), async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json<{ reason?: string | null }>();
    try {
      const savingsCase = await approveSavingsCase(c.get("savingsStore"), c.get("auditSink"), {
        savingsCaseId: c.req.param("id"),
        organisationId: auth.organisationId,
        actorUserId: auth.userId,
        actorRoles: auth.roles,
        reason: body.reason ?? null,
      });
      return c.json({ savingsCase });
    } catch (err) {
      if (err instanceof SavingsError) return c.json({ error: err.message }, 409);
      throw err;
    }
  });

  /**
   * The caller supplies only the observed after-state; the released and
   * annualised figures are computed by the engine from the persisted
   * baseline. There is deliberately no endpoint that accepts a measured
   * figure directly.
   */
  app.post("/cases/:id/measure", requirePermission("savings", "update"), async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json<{
      postMinutes?: number | null;
      postAmountCents?: number | null;
      labourRateCentsPerHour?: number | null;
    }>();
    try {
      const savingsCase = await measureSavingsCase(c.get("savingsStore"), c.get("auditSink"), {
        savingsCaseId: c.req.param("id"),
        organisationId: auth.organisationId,
        actorUserId: auth.userId,
        postMinutes: body.postMinutes ?? null,
        postAmountCents: body.postAmountCents ?? null,
        labourRateCentsPerHour: body.labourRateCentsPerHour ?? null,
      });
      return c.json({ savingsCase });
    } catch (err) {
      if (err instanceof SavingsError) return c.json({ error: err.message }, 409);
      throw err;
    }
  });

  app.post("/cases/:id/evidence", requirePermission("savings", "update"), async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json<{ evidenceType?: EvidenceType; reference?: string | null; note?: string | null }>();
    if (!body.evidenceType) return c.json({ error: "evidenceType is required" }, 400);
    try {
      const evidence = await addSavingsEvidence(c.get("savingsStore"), c.get("auditSink"), {
        savingsCaseId: c.req.param("id"),
        organisationId: auth.organisationId,
        evidenceType: body.evidenceType,
        reference: body.reference ?? null,
        note: body.note ?? null,
        actorUserId: auth.userId,
      });
      return c.json({ evidence }, 201);
    } catch (err) {
      if (err instanceof SavingsError) return c.json({ error: err.message }, 409);
      throw err;
    }
  });

  app.post("/cases/:id/verify", requirePermission("savings", "verify"), async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json<{ reason?: string | null }>();
    try {
      const savingsCase = await verifySavingsCase(c.get("savingsStore"), c.get("auditSink"), {
        savingsCaseId: c.req.param("id"),
        organisationId: auth.organisationId,
        actorUserId: auth.userId,
        actorRoles: auth.roles,
        reason: body.reason ?? null,
      });
      return c.json({ savingsCase });
    } catch (err) {
      if (err instanceof SavingsError) return c.json({ error: err.message }, 409);
      throw err;
    }
  });

  app.post("/cases/:id/close", requirePermission("savings", "update"), async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json<{ reason?: string }>();
    if (!body.reason) return c.json({ error: "reason is required" }, 400);
    try {
      const savingsCase = await closeSavingsCase(c.get("savingsStore"), c.get("auditSink"), {
        savingsCaseId: c.req.param("id"),
        organisationId: auth.organisationId,
        actorUserId: auth.userId,
        reason: body.reason,
      });
      return c.json({ savingsCase });
    } catch (err) {
      if (err instanceof SavingsError) return c.json({ error: err.message }, 409);
      throw err;
    }
  });

  /** Verified actuals and the annualised run-rate, returned as separate fields — never one total. */
  app.get("/totals", requirePermission("savings", "view"), async (c) => {
    const auth = c.get("auth");
    return c.json({ totals: await getVerifiedSavingsTotals(c.get("savingsStore"), auth.organisationId) });
  });

  return app;
}
