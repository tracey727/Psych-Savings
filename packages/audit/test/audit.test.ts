import { describe, expect, it } from "vitest";
import { buildAuditEvent, InMemoryAuditSink } from "../src/index";

describe("buildAuditEvent", () => {
  const base = {
    organisationId: "org-1",
    actorUserId: "user-1",
    action: "sign_in",
    entityType: "session",
    entityId: "session-1",
    source: "api",
  };

  it("builds a well-formed event with an ISO timestamp", () => {
    const event = buildAuditEvent(base, new Date("2026-01-01T00:00:00.000Z"));
    expect(event.occurredAt).toBe("2026-01-01T00:00:00.000Z");
    expect(event.priorState).toBeNull();
    expect(event.newState).toBeNull();
    expect(event.reason).toBeNull();
  });

  it("rejects an event with no organisationId", () => {
    expect(() => buildAuditEvent({ ...base, organisationId: "" })).toThrow();
  });

  it("rejects an event with no action", () => {
    expect(() => buildAuditEvent({ ...base, action: "" })).toThrow();
  });

  it("rejects an event with no source", () => {
    expect(() => buildAuditEvent({ ...base, source: "" })).toThrow();
  });

  it("preserves prior/new state and reason when provided", () => {
    const event = buildAuditEvent({
      ...base,
      priorState: { status: "open" },
      newState: { status: "closed" },
      reason: "duplicate referral",
    });
    expect(event.priorState).toEqual({ status: "open" });
    expect(event.newState).toEqual({ status: "closed" });
    expect(event.reason).toBe("duplicate referral");
  });
});

describe("InMemoryAuditSink", () => {
  it("records written events in order", async () => {
    const sink = new InMemoryAuditSink();
    await sink.write(buildAuditEvent({ ...baseEvent(), action: "a" }));
    await sink.write(buildAuditEvent({ ...baseEvent(), action: "b" }));
    expect(sink.events.map((e) => e.action)).toEqual(["a", "b"]);
  });
});

function baseEvent() {
  return {
    organisationId: "org-1",
    actorUserId: "user-1",
    action: "noop",
    entityType: "session",
    entityId: null,
    source: "api",
  };
}
