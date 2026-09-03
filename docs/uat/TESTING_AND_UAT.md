# Testing & UAT Blueprint

## Test layers

### Unit tests
- state transitions;
- deadline calculations;
- savings calculations;
- double-counting prevention;
- permission predicates.

### Integration tests
- API ↔ database;
- authentication ↔ authorisation;
- referral ↔ work ownership;
- cancellation ↔ refill;
- waste event ↔ savings case;
- handover ↔ ownership transfer.

### End-to-end tests
- new referral to booked outcome;
- referral overdue and escalation;
- callback completed;
- cancellation refilled;
- cancellation not refilled;
- planned leave handover;
- unexpected absence;
- duplicate-work intervention;
- recurring-cost cancellation;
- verified saving reaching dashboard.

### Security tests
- user cannot access another centre without permission;
- reception cannot verify director-only savings;
- technical admin cannot use technical rights as business-data permission;
- inactive user sessions are revoked;
- rate limiting behaves correctly;
- audit events cannot be altered through normal application routes.

### Resilience tests
- API timeout;
- temporary database unavailability;
- repeated submission/idempotency;
- notification duplication;
- retry behaviour;
- migration rollback/recovery.

### Load tests
Test for expected growth and burst scenarios so the system remains responsive when staff are working concurrently.

## UAT roles
Use synthetic data first with:
- Irene/director scenario;
- reception scenario;
- manager scenario;
- clinician operational-action scenario.

## UAT acceptance
A phase cannot be marked GREEN if users must rely on memory or external notes to complete a core workflow the system claims to control.
