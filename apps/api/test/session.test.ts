import { describe, expect, it } from "vitest";
import { generateSessionToken, hashSessionToken, isSessionUsable } from "../src/auth/session";
import type { SessionRecord } from "../src/auth/session";

describe("session tokens", () => {
  it("generates distinct tokens", () => {
    expect(generateSessionToken()).not.toBe(generateSessionToken());
  });

  it("hashes deterministically (same token -> same hash)", async () => {
    const token = generateSessionToken();
    expect(await hashSessionToken(token)).toBe(await hashSessionToken(token));
  });

  it("different tokens hash differently", async () => {
    const a = await hashSessionToken(generateSessionToken());
    const b = await hashSessionToken(generateSessionToken());
    expect(a).not.toBe(b);
  });
});

describe("isSessionUsable", () => {
  const base: SessionRecord = {
    id: "s1",
    organisationId: "org-1",
    userId: "user-1",
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    mfaVerified: true,
  };

  it("is usable when unexpired and unrevoked", () => {
    expect(isSessionUsable(base)).toBe(true);
  });

  it("is not usable once expired", () => {
    expect(isSessionUsable({ ...base, expiresAt: new Date(Date.now() - 1) })).toBe(false);
  });

  it("is not usable once revoked", () => {
    expect(isSessionUsable({ ...base, revokedAt: new Date() })).toBe(false);
  });
});
