import type { AuditSink, AuditEvent } from "@psych-savings/audit";
import type { NeonQueryFunction } from "@neondatabase/serverless";

type Sql = NeonQueryFunction<false, false>;

/**
 * Writes audit events to audit_events (database/migrations/0004_audit.sql,
 * RLS-scoped by database/migrations/0005_row_level_security.sql). Like
 * NeonAuthStore, this is a thin, deliberately simple adapter — the events
 * it is given are built and validated by the well-tested
 * packages/audit#buildAuditEvent, not by this class.
 */
export class NeonAuditSink implements AuditSink {
  constructor(private readonly sql: Sql) {}

  async write(event: AuditEvent): Promise<void> {
    await this.sql.transaction((tx) => [
      tx`select set_config('app.current_org_id', ${event.organisationId}, true)`,
      tx`insert into audit_events (organisation_id, actor_user_id, action, entity_type, entity_id, prior_state, new_state, reason, occurred_at, source)
         values (${event.organisationId}, ${event.actorUserId}, ${event.action}, ${event.entityType}, ${event.entityId}, ${JSON.stringify(event.priorState)}, ${JSON.stringify(event.newState)}, ${event.reason}, ${event.occurredAt}, ${event.source})`,
    ]);
  }
}
