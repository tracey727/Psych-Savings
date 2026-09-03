# Data Model Blueprint

This is a logical model. Physical schema design occurs only after the product contract is frozen.

## Core identity and tenancy
- organisations
- centres
- users
- roles
- user_role_assignments
- user_centre_assignments
- service_accounts

## Referral domain
- referrals
- referral_sources
- referral_owners
- referral_contact_attempts
- referral_status_history
- referral_outcomes
- referral_value_estimates

## Reception and action domain
- work_items
- work_item_owners
- work_item_transfers
- work_item_comments
- due_dates
- escalations
- action_evidence

## Appointment leakage domain
- appointment_vacancies
- cancellation_events
- no_show_events
- refill_candidates
- refill_contact_attempts
- refill_outcomes

## Staff-efficiency domain
- waste_events
- waste_categories
- time_estimates
- root_causes
- process_interventions
- before_after_measurements

## Leave and handover domain
- absences
- handovers
- handover_items
- temporary_assignments
- handover_acceptances
- return_briefings

## Capacity domain
- capacity_snapshots
- appointment_capacity
- demand_snapshots
- utilisation_metrics

## Cost-review domain
- recurring_costs
- supplier_records
- renewals
- cost_reviews
- cost_decisions
- cost_saving_evidence

## Pattern and prevention domain
- systemic_patterns
- pattern_events
- prevention_actions
- prevention_measurements

## Savings domain
- savings_cases
- savings_baselines
- savings_calculations
- savings_evidence
- savings_verifications

## Audit and notification domain
- audit_events
- notifications
- alert_rules
- alert_events
- configuration_versions

# Critical data rules

- Primary keys must be non-guessable identifiers.
- Every tenant-owned record includes organisation scope.
- Centre scope is explicit where centre separation applies.
- Operational events use append-only history for material state changes.
- Soft-delete/archive rules must preserve auditability.
- Clinical notes are not stored in this product.
- Free-text fields are minimised.
- Sensitive identifiers are limited to what the workflow truly requires.
- API-level and database-level access controls must agree.
- Runtime services use least-privilege credentials.
