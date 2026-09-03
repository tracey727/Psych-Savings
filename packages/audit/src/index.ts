/**
 * Audit event construction, matching the audit_events table
 * (database/migrations/0004_audit.sql) and the required fields in
 * docs/security/SECURITY_PRIVACY_GOVERNANCE.md "Audit requirements":
 * actor, timestamp, action, affected record, prior state, new state,
 * reason, source.
 *
 * This package only builds and validates the event shape; writing it is
 * the caller's job via an AuditSink, so this stays testable without a
 * database.
 */

export interface AuditEventInput {
  organisationId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  priorState?: unknown;
  newState?: unknown;
  reason?: string | null;
  source: string;
}

export interface AuditEvent extends AuditEventInput {
  occurredAt: string;
}

export interface AuditSink {
  write(event: AuditEvent): Promise<void>;
}

/**
 * A material write (something that changes business state) must always
 * carry a reason when there is no new state to speak for itself (e.g. a
 * closure or rejection) — see PRODUCT_CONTRACT.md §5.5 "Closed work
 * requires evidence or an outcome reason."
 */
export function buildAuditEvent(input: AuditEventInput, now: Date = new Date()): AuditEvent {
  if (!input.organisationId) throw new Error("AuditEvent requires organisationId");
  if (!input.action) throw new Error("AuditEvent requires action");
  if (!input.entityType) throw new Error("AuditEvent requires entityType");
  if (!input.source) throw new Error("AuditEvent requires source");

  return {
    ...input,
    priorState: input.priorState ?? null,
    newState: input.newState ?? null,
    reason: input.reason ?? null,
    occurredAt: now.toISOString(),
  };
}

/** In-memory sink for tests and for composing sinks (e.g. logging + DB). */
export class InMemoryAuditSink implements AuditSink {
  readonly events: AuditEvent[] = [];

  async write(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }
}
