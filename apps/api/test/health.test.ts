import { describe, expect, it } from "vitest";
import app from "../src/index";

describe("GET /health", () => {
  it("returns ok status", async () => {
    const res = await app.request("/health", {}, { ENVIRONMENT: "test" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok", service: "psych-savings-api", environment: "test" });
  });
});
