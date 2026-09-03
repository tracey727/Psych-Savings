import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { completeMfa, confirmMfaEnrollment, enrollMfa, signIn } from "./auth/login";
import { hashSessionToken } from "./auth/session";
import { createSqlClient } from "./db/client";
import { NeonAuditSink } from "./db/neonAuditSink";
import { NeonAuthStore } from "./db/neonAuthStore";
import { SESSION_COOKIE_NAME } from "./middleware/auth";
import { createAbsenceRoutes } from "./routes/absences";
import { createAppointmentRoutes } from "./routes/appointments";
import { createReferralRoutes } from "./routes/referrals";
import { createWorkItemRoutes } from "./routes/workItems";

/**
 * Business routes (referrals, work items, ...) are added from Phase 7/8
 * onward, per docs/10_DEVELOPER_HANDOFF.md "First build to execute".
 * Phase 6 adds only authentication/session/MFA. Every handler here
 * builds its own NeonAuthStore/NeonAuditSink from c.env.DATABASE_URL —
 * Workers don't share module state safely across isolates the way a
 * long-lived Node process would, so nothing DB-related is module-scoped.
 *
 * The orchestration each handler calls (signIn, completeMfa, enrollMfa,
 * confirmMfaEnrollment) is fully unit-tested against an in-memory fake
 * store — see apps/api/test/login.test.ts and mfaEnrollment.test.ts.
 * This file is deliberately thin: request parsing, cookie handling and
 * status codes only.
 */

export type Env = {
  ENVIRONMENT: string;
  DATABASE_URL?: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "psych-savings-api",
    environment: c.env.ENVIRONMENT ?? "unknown",
  }),
);

function requireDb(c: Context<{ Bindings: Env }>) {
  if (!c.env.DATABASE_URL) return null;
  const sql = createSqlClient(c.env.DATABASE_URL);
  return { store: new NeonAuthStore(sql), audit: new NeonAuditSink(sql) };
}

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string | null {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null;
}

const auth = new Hono<{ Bindings: Env }>();

auth.post("/sign-in", async (c) => {
  const db = requireDb(c);
  if (!db) return c.json({ error: "server misconfigured: DATABASE_URL not set" }, 500);

  const body = await c.req.json<{ organisationId?: string; email?: string; password?: string }>();
  if (!body.organisationId || !body.email || !body.password) {
    return c.json({ error: "organisationId, email and password are required" }, 400);
  }

  const result = await signIn(db.store, db.audit, {
    organisationId: body.organisationId,
    email: body.email,
    password: body.password,
    ip: clientIp(c),
    userAgent: c.req.header("user-agent") ?? null,
  });

  if (result.outcome === "locked_out") return c.json({ outcome: result.outcome }, 429);
  if (result.outcome === "invalid_credentials") return c.json({ outcome: result.outcome }, 401);

  setCookie(c, SESSION_COOKIE_NAME, result.token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
  });

  if (result.outcome === "mfa_required" || result.outcome === "mfa_setup_required") {
    return c.json({ outcome: result.outcome });
  }
  return c.json({ outcome: "success", userId: result.userId, roles: result.roles });
});

auth.post("/mfa/enroll", async (c) => {
  const db = requireDb(c);
  if (!db) return c.json({ error: "server misconfigured: DATABASE_URL not set" }, 500);

  const body = await c.req.json<{ organisationId?: string }>();
  const pendingToken = getCookie(c, SESSION_COOKIE_NAME);
  if (!body.organisationId || !pendingToken) return c.json({ error: "not in an MFA enrolment step" }, 400);

  const result = await enrollMfa(db.store, { organisationId: body.organisationId, pendingToken });
  if (result.outcome !== "success") return c.json({ outcome: result.outcome }, 400);
  return c.json({ outcome: "success", secretBase32: result.secretBase32 });
});

auth.post("/mfa/enroll/confirm", async (c) => {
  const db = requireDb(c);
  if (!db) return c.json({ error: "server misconfigured: DATABASE_URL not set" }, 500);

  const body = await c.req.json<{ organisationId?: string; code?: string }>();
  const pendingToken = getCookie(c, SESSION_COOKIE_NAME);
  if (!body.organisationId || !body.code || !pendingToken) {
    return c.json({ error: "organisationId and code are required" }, 400);
  }

  const result = await confirmMfaEnrollment(db.store, db.audit, {
    organisationId: body.organisationId,
    pendingToken,
    code: body.code,
  });
  if (result.outcome !== "success") return c.json({ outcome: result.outcome }, 401);
  return c.json({ outcome: "success", userId: result.userId, roles: result.roles });
});

auth.post("/mfa/verify", async (c) => {
  const db = requireDb(c);
  if (!db) return c.json({ error: "server misconfigured: DATABASE_URL not set" }, 500);

  const body = await c.req.json<{ organisationId?: string; code?: string }>();
  const pendingToken = getCookie(c, SESSION_COOKIE_NAME);
  if (!body.organisationId || !body.code || !pendingToken) {
    return c.json({ error: "organisationId and code are required" }, 400);
  }

  const result = await completeMfa(db.store, db.audit, {
    organisationId: body.organisationId,
    pendingToken,
    code: body.code,
  });
  if (result.outcome !== "success") return c.json({ outcome: result.outcome }, 401);
  return c.json({ outcome: "success", userId: result.userId, roles: result.roles });
});

auth.post("/sign-out", async (c) => {
  const db = requireDb(c);
  if (!db) return c.json({ error: "server misconfigured: DATABASE_URL not set" }, 500);

  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (token) {
    const tokenHash = await hashSessionToken(token);
    const session = await db.store.findSessionByTokenHash(tokenHash);
    if (session) await db.store.revokeSession(session.id, session.organisationId);
  }
  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
  return c.json({ outcome: "success" });
});

app.route("/auth", auth);
app.route("/work-items", createWorkItemRoutes());
app.route("/referrals", createReferralRoutes());
app.route("/appointment-vacancies", createAppointmentRoutes());
app.route("/absences", createAbsenceRoutes());

export default app;
