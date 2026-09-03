import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, computeTotp, generateTotpSecret, verifyTotp } from "../src/auth/totp";

// RFC 6238 Appendix B test vectors (SHA-1, 8-digit truncation). The last 6
// digits of each 8-digit vector are exactly what 6-digit truncation
// produces, since 6-digit truncation is the same dynamic-truncation value
// mod 10^6. The RFC's raw ASCII secret is base32-encoded here because this
// implementation's public API takes base32 (matching authenticator apps).
const RFC_SECRET_ASCII = "12345678901234567890";
const RFC_SECRET_BASE32 = base32Encode(new TextEncoder().encode(RFC_SECRET_ASCII));

describe("base32", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it("encodes the RFC 6238 test secret as expected", () => {
    // Known-correct base32 encoding of "12345678901234567890".
    expect(RFC_SECRET_BASE32).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });
});

describe("computeTotp — RFC 6238 test vectors", () => {
  const cases: Array<[number, string]> = [
    [59_000, "287082"],
    [1_111_111_109_000, "081804"],
    [1_111_111_111_000, "050471"],
    [1_234_567_890_000, "005924"],
    [2_000_000_000_000, "279037"],
  ];

  it.each(cases)("time %i -> code %s", async (timeMs, expected) => {
    expect(await computeTotp(RFC_SECRET_BASE32, timeMs)).toBe(expected);
  });
});

describe("verifyTotp", () => {
  it("accepts the current code", async () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = await computeTotp(secret, now);
    expect(await verifyTotp(secret, code, now)).toBe(true);
  });

  it("rejects an incorrect code", async () => {
    const secret = generateTotpSecret();
    expect(await verifyTotp(secret, "000000", Date.now())).toBe(false);
  });

  it("tolerates one step of clock drift within the window", async () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const codeOneStepAgo = await computeTotp(secret, now - 30_000);
    expect(await verifyTotp(secret, codeOneStepAgo, now, 1)).toBe(true);
  });

  it("rejects a code more than the window steps away", async () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const codeFarAway = await computeTotp(secret, now - 5 * 30_000);
    expect(await verifyTotp(secret, codeFarAway, now, 1)).toBe(false);
  });
});
