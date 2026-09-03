import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Uses @neondatabase/serverless's HTTP driver (not raw TCP) — the only
 * driver Cloudflare Workers can use to reach Postgres without a
 * Hyperdrive/TCP socket binding. `DATABASE_URL` must always be the
 * least-privilege `psych_savings_runtime` connection string — see
 * docs/security/SECRETS_POLICY.md and
 * database/provisioning/create_runtime_role.sql.
 */
export function createSqlClient(databaseUrl: string): NeonQueryFunction<false, false> {
  return neon(databaseUrl);
}
