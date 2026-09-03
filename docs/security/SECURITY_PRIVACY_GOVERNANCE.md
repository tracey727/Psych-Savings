# Security, Privacy & Governance Blueprint

## Security baseline
- Private source repository.
- MFA for privileged accounts.
- Separate development, test and production environments.
- No production database owner credentials in runtime code.
- Cloudflare Worker/API uses a least-privilege Neon role.
- Secrets held in approved secret storage, never source control.
- Server-side authorisation on every protected API operation.
- Database isolation aligned with API rules.
- Session expiry and revocation.
- Rate limiting and account-abuse controls.
- Audit history for material operational changes.
- Backups and tested restore procedures.
- Dependency and secret scanning in CI.

## Data minimisation
This product should hold only the minimum operational information needed to prevent business leakage.

Avoid storing:
- therapy notes;
- diagnoses;
- detailed clinical narratives;
- unnecessary health information.

Where an operational workflow needs to identify a person, use the minimum approved identifier and avoid duplicating data already mastered in another approved system.

## Production governance
Before real practice information is used:
1. Complete privacy/data inventory.
2. Confirm lawful purpose and access boundaries.
3. Confirm retention/deletion rules.
4. Confirm incident response and breach process.
5. Confirm backup/restore.
6. Confirm user offboarding.
7. Confirm export controls.
8. Confirm audit access.
9. Complete penetration/security review proportionate to production risk.
10. Obtain practice approval.

## Audit requirements
Material events should record:
- actor;
- timestamp;
- action;
- affected record;
- prior state where appropriate;
- new state;
- reason;
- source/device/session identifiers where appropriate.

## Change control
Any new module must:
- be entered into the feature register;
- identify the business problem;
- identify the data it requires;
- identify roles and permissions;
- identify how it affects savings calculations;
- pass security/privacy review before production.
