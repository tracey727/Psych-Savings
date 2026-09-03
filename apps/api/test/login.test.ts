import { InMemoryAuditSink } from "@psych-savings/audit";
import { beforeEach, describe, expect, it } from "vitest";
import { completeMfa, signIn } from "../src/auth/login";
import { hashPassword } from "../src/auth/password";
import { computeTotp, generateTotpSecret } from "../src/auth/totp";
import { FakeAuthStore } from "./fakes/fakeAuthStore";

const ORG = "org-1";

async function seedUser(
  store: FakeAuthStore,
  opts: { email: string; password: string; role: "director" | "manager" | "reception_admin" | "clinician" | "technical_admin"; disabled?: boolean },
) {
  const id = `user-${store.users.length + 1}`;
  store.users.push({
    id,
    organisationId: ORG,
    email: opts.email,
    displayName: opts.email,
    passwordHash: await hashPassword(opts.password),
    disabledAt: opts.disabled ? new Date() : null,
  });
  store.roles.set(`${id}:${ORG}`, [opts.role]);
  return id;
}

describe("signIn — non-privileged role (no MFA)", () => {
  let store: FakeAuthStore;
  let audit: InMemoryAuditSink;

  beforeEach(() => {
    store = new FakeAuthStore();
    audit = new InMemoryAuditSink();
  });

  it("succeeds immediately with the correct password", async () => {
    await seedUser(store, { email: "reception@a.test", password: "correct-password", role: "reception_admin" });
    const result = await signIn(store, audit, {
      organisationId: ORG,
      email: "reception@a.test",
      password: "correct-password",
      ip: "1.2.3.4",
      userAgent: "test",
    });
    expect(result.outcome).toBe("success");
    expect(audit.events.map((e) => e.action)).toContain("sign_in");
  });

  it("rejects a wrong password without revealing whether the user exists", async () => {
    await seedUser(store, { email: "reception@a.test", password: "correct-password", role: "reception_admin" });
    const wrongPassword = await signIn(store, audit, {
      organisationId: ORG,
      email: "reception@a.test",
      password: "nope",
      ip: "1.2.3.4",
      userAgent: "test",
    });
    const noSuchUser = await signIn(store, audit, {
      organisationId: ORG,
      email: "nobody@a.test",
      password: "nope",
      ip: "1.2.3.4",
      userAgent: "test",
    });
    expect(wrongPassword).toEqual({ outcome: "invalid_credentials" });
    expect(noSuchUser).toEqual({ outcome: "invalid_credentials" });
  });

  it("rejects a disabled user even with the correct password", async () => {
    await seedUser(store, { email: "gone@a.test", password: "correct-password", role: "reception_admin", disabled: true });
    const result = await signIn(store, audit, {
      organisationId: ORG,
      email: "gone@a.test",
      password: "correct-password",
      ip: "1.2.3.4",
      userAgent: "test",
    });
    expect(result.outcome).toBe("invalid_credentials");
  });

  it("locks out after repeated failures from the same email", async () => {
    await seedUser(store, { email: "reception@a.test", password: "correct-password", role: "reception_admin" });
    for (let i = 0; i < 10; i++) {
      await signIn(store, audit, {
        organisationId: ORG,
        email: "reception@a.test",
        password: "wrong",
        ip: "1.2.3.4",
        userAgent: "test",
      });
    }
    const lockedResult = await signIn(store, audit, {
      organisationId: ORG,
      email: "reception@a.test",
      password: "correct-password", // even the right password is now blocked
      ip: "1.2.3.4",
      userAgent: "test",
    });
    expect(lockedResult).toEqual({ outcome: "locked_out" });
  });
});

describe("signIn — privileged role (MFA required)", () => {
  let store: FakeAuthStore;
  let audit: InMemoryAuditSink;

  beforeEach(() => {
    store = new FakeAuthStore();
    audit = new InMemoryAuditSink();
  });

  it("requires MFA setup on first login when no secret is enrolled", async () => {
    await seedUser(store, { email: "irene@a.test", password: "correct-password", role: "director" });
    const result = await signIn(store, audit, {
      organisationId: ORG,
      email: "irene@a.test",
      password: "correct-password",
      ip: "1.2.3.4",
      userAgent: "test",
    });
    expect(result.outcome).toBe("mfa_setup_required");
  });

  it("requires an MFA code when a secret is already enrolled, and does not grant a full session on password alone", async () => {
    const userId = await seedUser(store, { email: "irene@a.test", password: "correct-password", role: "director" });
    await store.setMfaSecret(userId, ORG, generateTotpSecret());
    await store.enableMfa(userId, ORG);

    const result = await signIn(store, audit, {
      organisationId: ORG,
      email: "irene@a.test",
      password: "correct-password",
      ip: "1.2.3.4",
      userAgent: "test",
    });
    expect(result.outcome).toBe("mfa_required");
    // No "sign_in" audit event yet — the session is not fully authenticated.
    expect(audit.events.map((e) => e.action)).not.toContain("sign_in");
  });

  it("full flow: password then correct TOTP code completes sign-in", async () => {
    const userId = await seedUser(store, { email: "irene@a.test", password: "correct-password", role: "director" });
    const secret = generateTotpSecret();
    await store.setMfaSecret(userId, ORG, secret);
    await store.enableMfa(userId, ORG);

    const step1 = await signIn(store, audit, {
      organisationId: ORG,
      email: "irene@a.test",
      password: "correct-password",
      ip: "1.2.3.4",
      userAgent: "test",
    });
    expect(step1.outcome).toBe("mfa_required");
    const pendingToken = (step1 as { token: string }).token;

    const code = await computeTotp(secret);
    const step2 = await completeMfa(store, audit, {
      organisationId: ORG,
      pendingToken,
      code,
    });
    expect(step2).toEqual({ outcome: "success", userId, roles: ["director"] });
    expect(audit.events.map((e) => e.action)).toContain("mfa_verified");
  });

  it("rejects an incorrect MFA code and does not complete the session", async () => {
    const userId = await seedUser(store, { email: "irene@a.test", password: "correct-password", role: "director" });
    await store.setMfaSecret(userId, ORG, generateTotpSecret());
    await store.enableMfa(userId, ORG);

    const step1 = await signIn(store, audit, {
      organisationId: ORG,
      email: "irene@a.test",
      password: "correct-password",
      ip: "1.2.3.4",
      userAgent: "test",
    });
    const pendingToken = (step1 as { token: string }).token;

    const step2 = await completeMfa(store, audit, {
      organisationId: ORG,
      pendingToken,
      code: "000000",
    });
    expect(step2).toEqual({ outcome: "invalid_code" });
  });

  it("a manager also requires MFA (privileged role, not just director)", async () => {
    await seedUser(store, { email: "manager@a.test", password: "correct-password", role: "manager" });
    const result = await signIn(store, audit, {
      organisationId: ORG,
      email: "manager@a.test",
      password: "correct-password",
      ip: "1.2.3.4",
      userAgent: "test",
    });
    expect(result.outcome).toBe("mfa_setup_required");
  });
});
