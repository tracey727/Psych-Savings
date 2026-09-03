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
