import { Hono } from "hono";

/**
 * Phase 4 scope only: prove the Worker builds, deploys and responds.
 * No referral/work-item/business routes are added until their own
 * phase (7+) is GREEN — see docs/10_DEVELOPER_HANDOFF.md "First build
 * to execute".
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

export default app;
