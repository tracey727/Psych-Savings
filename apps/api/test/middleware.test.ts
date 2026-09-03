import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { hashSessionToken } from "../src/auth/session";
import { createAuthMiddleware, SESSION_COOKIE_NAME } from "../src/middleware/auth";
import { assertCentreAccess, requirePermission } from "../src/middleware/permission";
import { FakeAuthStore } from "./fakes/fakeAuthStore";

const ORG = "org-1";
const CENTRE_A = "centre-a";
const CENTRE_B = "centre-b";

async function buildApp(store: FakeAuthStore) {
  const app = new Hono();
  app.use("*", createAuthMiddleware(store));

  app.get("/work-items", requirePermission("work_items", "view"), (c) => c.json({ ok: true }));

  app.get("/work-items/:centreId", requirePermission("work_items", "view"), (c) => {
    const auth = c.get("auth");
    const centreId = c.req.param("centreId");
    if (!assertCentreAccess(auth, "work_items", centreId)) {
      return c.json({ error: "forbidden_centre" }, 403);
    }
    return c.json({ ok: true });
  });

  app.get("/recurring-costs", requirePermission("recurring_costs", "create"), (c) => c.json({ ok: true }));

  return app;
}

async function issueSession(
  store: FakeAuthStore,
  opts: { userId: string; roles: ("director" | "manager" | "reception_admin" | "clinician")[]; centreIds?: string[] },
) {
  const token = "test-token-" + opts.userId;
  const tokenHash = await hashSessionToken(token);
  store.roles.set(`${opts.userId}:${ORG}`, opts.roles);
  if (opts.centreIds) store.centreAssignments.set(`${opts.userId}:${ORG}`, opts.centreIds);
  await store.createSession({
    organisationId: ORG,
    userId: opts.userId,
    tokenHash,
    expiresAt: new Date(Date.now() + 60_000),
    mfaVerified: true,
    ip: null,
    userAgent: null,
  });
  return token;
}

describe("createAuthMiddleware", () => {
  let store: FakeAuthStore;

  beforeEach(() => {
    store = new FakeAuthStore();
  });

  it("rejects a request with no session cookie at all (cross-user: no identity)", async () => {
    const app = await buildApp(store);
    const res = await app.request("/work-items");
    expect(res.status).toBe(401);
  });

  it("rejects a request with a bogus/unknown session token", async () => {
    const app = await buildApp(store);
    const res = await app.request("/work-items", {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=not-a-real-token` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a session that has not completed MFA (pending session cannot access business routes)", async () => {
    const token = "pending-token";
    await store.createSession({
      organisationId: ORG,
      userId: "user-1",
      tokenHash: await hashSessionToken(token),
      expiresAt: new Date(Date.now() + 60_000),
      mfaVerified: false,
      ip: null,
      userAgent: null,
    });
    const app = await buildApp(store);
    const res = await app.request("/work-items", { headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` } });
    expect(res.status).toBe(401);
  });

  it("rejects a revoked session", async () => {
    const token = await issueSession(store, { userId: "user-1", roles: ["reception_admin"] });
    const [session] = [...store.sessions.values()];
    await store.revokeSession(session!.id, ORG);
    const app = await buildApp(store);
    const res = await app.request("/work-items", { headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` } });
    expect(res.status).toBe(401);
  });

  it("allows a valid session with the required permission", async () => {
    const token = await issueSession(store, { userId: "user-1", roles: ["reception_admin"] });
    const app = await buildApp(store);
    const res = await app.request("/work-items", { headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` } });
    expect(res.status).toBe(200);
  });

  it("denies a valid session lacking the required permission (clinician cannot create recurring costs)", async () => {
    const token = await issueSession(store, { userId: "user-1", roles: ["clinician"] });
    const app = await buildApp(store);
    const res = await app.request("/recurring-costs", { headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` } });
    expect(res.status).toBe(403);
  });

  it("cross-centre: a reception_admin assigned only to centre A is denied access to centre B's resource", async () => {
    const token = await issueSession(store, {
      userId: "user-1",
      roles: ["reception_admin"],
      centreIds: [CENTRE_A],
    });
    const app = await buildApp(store);
    const resB = await app.request(`/work-items/${CENTRE_B}`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    expect(resB.status).toBe(403);

    const resA = await app.request(`/work-items/${CENTRE_A}`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    expect(resA.status).toBe(200);
  });

  it("director (org-wide scope) can access any centre's resource", async () => {
    const token = await issueSession(store, { userId: "user-1", roles: ["director"], centreIds: [] });
    const app = await buildApp(store);
    const res = await app.request(`/work-items/${CENTRE_B}`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    expect(res.status).toBe(200);
  });
});
