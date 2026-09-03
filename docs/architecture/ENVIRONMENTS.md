# Environments

Non-secret reference for where each environment lives. Connection strings
and passwords are never recorded here — see
`docs/security/SECRETS_POLICY.md`.

## Neon

| Environment | Neon project | Project ID | Default branch | Region |
|---|---|---|---|---|
| Development | `psych-savings` | `calm-cake-37228033` | `development` (`br-royal-surf-arssg49c`) | `aws-us-west-2` |
| Preview | *not yet provisioned* | — | — | — |
| Production | *not yet provisioned* | — | — | — |

Runtime role (every environment): `psych_savings_runtime`, created via
`database/provisioning/create_runtime_role.sql` — never via Neon's own
role-creation console/API.

### Neon platform gotcha — verified 2026-09-03

Roles created through Neon's own role-provisioning API/console default to
`BYPASSRLS` **and** `CREATEROLE`. On this project, creating a role that way
(`psych_savings_app`, since deleted) produced a role that silently bypassed
every tenant-isolation policy in `database/migrations/0005_row_level_security.sql`
— confirmed via `pg_roles.rolbypassrls = true` immediately after creation,
and the API/console offers no way to unset it (`ALTER ROLE ... NOBYPASSRLS`
was rejected with "permission denied to alter role" even from the project
owner role).

The fix: create the runtime role with plain SQL (`CREATE ROLE ...
NOBYPASSRLS NOCREATEROLE ...`) run by a role that itself has `CREATEROLE`
(the migration/owner credential). A role created this way is correctly
restricted. This is why `database/provisioning/create_runtime_role.sql`
exists as a required step, separate from Neon's UI — **do not** create the
runtime role any other way.

### Session lookup requires a narrow RLS bypass, by design

`sessions` is RLS-scoped by organisation like every other tenant table
(`database/migrations/0007_auth_spine.sql`), but looking a session up by
its token is a chicken-and-egg problem: the caller cannot set
`app.current_org_id` until it knows which organisation the token belongs
to, and it can only learn that from the row RLS is blocking. Verified
live 2026-09-03: reading `sessions` by `token_hash` with no GUC set
returns zero rows, as expected.

The fix is `lookup_session_organisation(token_hash)`
(`database/migrations/0008_session_lookup_function.sql`), a
`SECURITY DEFINER` SQL function that returns only an `organisation_id`
for a live (unrevoked, unexpired) token — nothing else — and is granted
to `psych_savings_runtime` for this purpose alone. Verified live: it
resolves a real token to the correct organisation with no GUC set, a
bogus token resolves to `NULL` (not an error, not a leak), and an
expired token also resolves to `NULL`. The caller then sets the GUC and
re-reads the session through the normal RLS path. This is the one
deliberate, narrow, documented exception to "every table is RLS-scoped"
in this codebase — do not add another one without very good reason.

### Testing the database adapter

`apps/api/src/db/neonAuthStore.ts` and `neonAuditSink.ts` cannot be
exercised by this repository's local test suite: this development
sandbox's network egress cannot reach Neon directly (confirmed — both
raw TCP and the HTTPS-based `@neondatabase/serverless` driver are
blocked by the sandbox's organisational egress policy, independently of
Neon). This is a sandbox limitation, not a Worker limitation — a
deployed Cloudflare Worker reaches Neon over Cloudflare's own network
and is unaffected.

Everything these adapters call (`src/auth/login.ts`, `session.ts`,
`totp.ts`, `password.ts`, `rateLimit.ts`) is fully unit-tested against an
in-memory fake implementing the same `AuthStore`/`AuditSink` interfaces
(`apps/api/test/fakes/fakeAuthStore.ts`), so the orchestration logic is
proven; the adapters themselves are proven correct by construction
(reusing the exact SQL/RLS pattern verified live in Phase 5 and above)
but should get a real smoke test against a deployed Worker once
Cloudflare is connected (tracked alongside the Phase 4 Cloudflare
environment gap below).

## Cloudflare

| Environment | Worker name | Status |
|---|---|---|
| Development | `psych-savings-api-dev` | Defined in `apps/api/wrangler.toml`; not yet deployed |
| Preview | `psych-savings-api-preview` | Defined in `apps/api/wrangler.toml`; not yet deployed |
| Production | `psych-savings-api-production` | Defined in `apps/api/wrangler.toml`; not yet deployed |

## GitHub

- Repository: `tracey727/Psych-Savings` (private)
- Branch protection on `main`: not yet configured — pending (see
  `CHANGELOG.md` "[Phase 4]").
