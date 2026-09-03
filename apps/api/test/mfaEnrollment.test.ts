import { InMemoryAuditSink } from "@psych-savings/audit";
import { beforeEach, describe, expect, it } from "vitest";
import { confirmMfaEnrollment, enrollMfa, signIn } from "../src/auth/login";
import { hashPassword } from "../src/auth/password";
import { computeTotp } from "../src/auth/totp";
import { FakeAuthStore } from "./fakes/fakeAuthStore";

const ORG = "org-1";

describe("MFA enrollment (first login for a privileged role)", () => {
  let store: FakeAuthStore;
  let audit: InMemoryAuditSink;
  let pendingToken: string;

  beforeEach(async () => {
    store = new FakeAuthStore();
    audit = new InMemoryAuditSink();
    store.users.push({
      id: "user-1",
      organisationId: ORG,
      email: "irene@a.test",
      displayName: "Irene",
      passwordHash: await hashPassword("correct-password"),
      disabledAt: null,
    });
    store.roles.set("user-1:org-1", ["director"]);

    const step1 = await signIn(store, audit, {
      organisationId: ORG,
      email: "irene@a.test",
      password: "correct-password",
      ip: "1.2.3.4",
      userAgent: "test",
    });
    expect(step1.outcome).toBe("mfa_setup_required");
    pendingToken = (step1 as { token: string }).token;
  });

  it("full enroll -> confirm flow completes sign-in and future logins require MFA", async () => {
    const enrolled = await enrollMfa(store, { organisationId: ORG, pendingToken });
    expect(enrolled.outcome).toBe("success");
    const secret = (enrolled as { secretBase32: string }).secretBase32;

    const code = await computeTotp(secret);
    const confirmed = await confirmMfaEnrollment(store, audit, {
      organisationId: ORG,
      pendingToken,
      code,
    });
    expect(confirmed).toEqual({ outcome: "success", userId: "user-1", roles: ["director"] });
    expect(audit.events.map((e) => e.action)).toContain("mfa_enrolled");

    // Signing in again now requires a code, not another enrollment.
    const nextLogin = await signIn(store, audit, {
      organisationId: ORG,
      email: "irene@a.test",
      password: "correct-password",
      ip: "1.2.3.4",
      userAgent: "test",
    });
    expect(nextLogin.outcome).toBe("mfa_required");
  });

  it("rejects confirmation with a wrong code and leaves MFA un-enabled", async () => {
    await enrollMfa(store, { organisationId: ORG, pendingToken });
    const confirmed = await confirmMfaEnrollment(store, audit, {
      organisationId: ORG,
      pendingToken,
      code: "000000",
    });
    expect(confirmed).toEqual({ outcome: "invalid_code" });

    const secret = await store.getMfaSecret("user-1", ORG);
    expect(secret?.enabledAt).toBeNull();
  });

  it("rejects enrollment attempts with an invalid or expired pending token", async () => {
    const result = await enrollMfa(store, { organisationId: ORG, pendingToken: "not-a-real-token" });
    expect(result).toEqual({ outcome: "invalid_session" });
  });
});
