import { describe, expect, it } from "vitest";
import { DEFAULT_AMBER_WINDOW_MS, isOverdue, nextHealthState } from "../src/health";

const NOW = new Date("2026-01-01T12:00:00.000Z");

describe("isOverdue", () => {
  it("is overdue when due date is in the past", () => {
    expect(isOverdue(new Date(NOW.getTime() - 1000), NOW)).toBe(true);
  });
  it("is not overdue when due date is in the future", () => {
    expect(isOverdue(new Date(NOW.getTime() + 1000), NOW)).toBe(false);
  });
  it("is never overdue with no due date", () => {
    expect(isOverdue(null, NOW)).toBe(false);
  });
});

describe("nextHealthState", () => {
  it("is green with no due date and no escalations", () => {
    expect(nextHealthState("green", { dueAt: null, now: NOW, openEscalationCount: 0 })).toBe("green");
  });

  it("is green when due date is well beyond the amber window", () => {
    const farFuture = new Date(NOW.getTime() + DEFAULT_AMBER_WINDOW_MS * 3);
    expect(nextHealthState("green", { dueAt: farFuture, now: NOW, openEscalationCount: 0 })).toBe("green");
  });

  it("is amber when due date is within the amber window but not yet overdue", () => {
    const soon = new Date(NOW.getTime() + DEFAULT_AMBER_WINDOW_MS / 2);
    expect(nextHealthState("green", { dueAt: soon, now: NOW, openEscalationCount: 0 })).toBe("amber");
  });

  it("is red when overdue, regardless of prior state", () => {
    const past = new Date(NOW.getTime() - 1000);
    expect(nextHealthState("green", { dueAt: past, now: NOW, openEscalationCount: 0 })).toBe("red");
    expect(nextHealthState("amber", { dueAt: past, now: NOW, openEscalationCount: 0 })).toBe("red");
  });

  it("is red when there is any open escalation, even with no due date", () => {
    expect(nextHealthState("green", { dueAt: null, now: NOW, openEscalationCount: 1 })).toBe("red");
  });

  it("recovery is sticky: stays recovery while overdue or escalations remain open", () => {
    const past = new Date(NOW.getTime() - 1000);
    expect(nextHealthState("recovery", { dueAt: past, now: NOW, openEscalationCount: 0 })).toBe("recovery");
    expect(nextHealthState("recovery", { dueAt: null, now: NOW, openEscalationCount: 1 })).toBe("recovery");
  });

  it("recovery resolves to green once neither overdue nor escalated", () => {
    const future = new Date(NOW.getTime() + DEFAULT_AMBER_WINDOW_MS * 3);
    expect(nextHealthState("recovery", { dueAt: future, now: NOW, openEscalationCount: 0 })).toBe("green");
    expect(nextHealthState("recovery", { dueAt: null, now: NOW, openEscalationCount: 0 })).toBe("green");
  });

  it("recovery does NOT resolve straight to amber even if the clear due date is technically within the amber window — it must pass through green first", () => {
    // "Clear" is binary (overdue-or-escalated vs not); recovery only ever
    // exits to green, never amber, per the sticky-then-clear rule above.
    const soon = new Date(NOW.getTime() + DEFAULT_AMBER_WINDOW_MS / 2);
    expect(nextHealthState("recovery", { dueAt: soon, now: NOW, openEscalationCount: 0 })).toBe("green");
  });
});
