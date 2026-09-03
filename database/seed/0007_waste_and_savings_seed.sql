-- Phase 12 — a complete synthetic waste case, from three captured
-- observations through to a VERIFIED released-staff-time saving with
-- evidence. This is the Phase 12 GREEN GATE expressed as database
-- fixtures, so the gate can be demonstrated against a real Neon branch
-- and not only against the in-memory fakes in apps/api/test/waste.test.ts.
--
-- Synthetic only (docs/product/DIRECTIVE_FREEZE.md §8).
--
-- The numbers below are the same ones the unit test asserts:
--   baseline 12 min/occurrence, weekly  ->  260 occurrences? no: 52/year
--   post-intervention 4 min             ->  8 min released per occurrence
--   labour rate $45.00/hour             ->  600 cents released per occurrence
--   annualised                          ->  416 minutes / 31,200 cents run-rate
-- and the annualised figures are stored in their own columns so no
-- dashboard can accidentally add them to the verified total.

-- A practice manager, so the intervention can be implemented by someone
-- other than the director who verifies the saving. That separation is
-- the point: SAVINGS_MEASUREMENT_CONTRACT.md forbids self-verification.
INSERT INTO users (id, organisation_id, email, display_name) VALUES
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-000000000001', 'manager.a@example-synthetic.test', 'Manager A (synthetic)');

INSERT INTO user_role_assignments (organisation_id, user_id, role_key) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4', 'manager');

INSERT INTO user_centre_assignments (organisation_id, user_id, centre_id) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a1');

UPDATE users
SET password_hash = 'pbkdf2$210000$1fa39db53c7856944407452764792428$7202aca66dd95bf5d9eba0f4d600122292af9b1b289d2da119430d1396da3b07'
WHERE id = '00000000-0000-0000-0000-0000000000a4';

-- The intervention's work item. Owned, deadlined and now closed, because
-- the change was carried out — ownership and closure are the Phase 7
-- engine, reused rather than reimplemented.
INSERT INTO work_items (id, organisation_id, centre_id, domain, title, current_owner_user_id, priority, due_at, next_action, health_state, status, close_reason, closed_at)
VALUES (
  '00000000-0000-0000-0000-0000000000c8',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1',
  'waste_intervention',
  'Referral intake goes straight into the practice system',
  '00000000-0000-0000-0000-0000000000a4',
  'normal',
  now() - interval '7 days',
  NULL,
  'green',
  'closed',
  'direct referral intake switched on',
  now() - interval '7 days'
);

INSERT INTO process_interventions (id, organisation_id, work_item_id, title, description, root_cause_category, implemented_at, implemented_by_user_id)
VALUES (
  '00000000-0000-0000-0000-000000000031',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000c8',
  'Referral intake goes straight into the practice system',
  'Remove the paper re-keying step between the referral fax and the practice system.',
  'no_single_source_of_truth',
  now() - interval '7 days',
  '00000000-0000-0000-0000-0000000000a4'
);

-- Three occurrences of the same duplicated task, captured by reception
-- over three weeks, each reviewed by the manager and attached to the
-- intervention above.
INSERT INTO waste_events (id, organisation_id, centre_id, reported_by_user_id, category, staff_role, description,
                          estimated_minutes, recurrence, occurred_at, root_cause_category, root_cause_note,
                          reviewed_at, reviewed_by_user_id, intervention_id)
VALUES
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000a3', 'duplicate_work', 'reception_admin',
   'Referral details re-keyed from the fax into the practice system', 12, 'weekly', now() - interval '28 days',
   'no_single_source_of_truth', 'referral arrives on paper and is typed in twice',
   now() - interval '21 days', '00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-000000000031'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000a3', 'duplicate_work', 'reception_admin',
   'Referral details re-keyed from the fax into the practice system', 12, 'weekly', now() - interval '21 days',
   'no_single_source_of_truth', 'same paper-to-system double entry',
   now() - interval '18 days', '00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-000000000031'),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000a3', 'duplicate_work', 'reception_admin',
   'Referral details re-keyed from the fax into the practice system', 12, 'weekly', now() - interval '14 days',
   'no_single_source_of_truth', 'same paper-to-system double entry',
   now() - interval '12 days', '00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-000000000031');

-- An unreviewed event as well, so the review queue is not empty and the
-- `unreviewedOnly` filter has something to return.
INSERT INTO waste_events (id, organisation_id, centre_id, reported_by_user_id, category, staff_role, description,
                          estimated_minutes, recurrence, occurred_at)
VALUES (
  '00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000a3', 'searching', 'reception_admin',
  'Hunting for the current fee schedule across shared drives', 6, 'daily', now() - interval '2 days'
);

-- The MEASURED before-state. Not the reporters' 12-minute estimates —
-- a timed figure with a stated method, which is what the contract
-- requires before any saving may be counted.
INSERT INTO savings_baselines (id, organisation_id, category, method, baseline_minutes, baseline_amount_cents,
                               recurrence, measured_from, measured_to, source_reference, created_by_user_id)
VALUES (
  '00000000-0000-0000-0000-000000000041',
  '00000000-0000-0000-0000-000000000001',
  'released_staff_time',
  'Timed six consecutive re-keying occurrences with a stopwatch; mean 12 minutes per referral.',
  12,
  NULL,
  'weekly',
  now() - interval '35 days',
  now() - interval '14 days',
  'baseline-timing-sheet-2026-08',
  '00000000-0000-0000-0000-0000000000a4'
);

INSERT INTO savings_cases (id, organisation_id, title, category, state, baseline_id, intervention_id,
                           source_entity_type, source_entity_id,
                           post_minutes, post_measured_at, measured_at,
                           measured_minutes_released, measured_amount_cents,
                           annualised_minutes_released, annualised_amount_cents, labour_rate_cents_per_hour,
                           approved_by_user_id, approved_at, implemented_by_user_id, implemented_at,
                           verified_by_user_id, verified_at, created_by_user_id)
VALUES (
  '00000000-0000-0000-0000-000000000042',
  '00000000-0000-0000-0000-000000000001',
  'Released reception time — referral re-keying',
  'released_staff_time',
  'verified',
  '00000000-0000-0000-0000-000000000041',
  '00000000-0000-0000-0000-000000000031',
  'process_intervention',
  '00000000-0000-0000-0000-000000000031',
  4,
  now() - interval '3 days',
  now() - interval '3 days',
  8,
  600,
  416,
  31200,
  4500,
  '00000000-0000-0000-0000-0000000000a2', now() - interval '10 days',
  '00000000-0000-0000-0000-0000000000a4', now() - interval '7 days',
  '00000000-0000-0000-0000-0000000000a2', now() - interval '2 days',
  '00000000-0000-0000-0000-0000000000a4'
);

-- The evidence without which the case could not have been verified.
INSERT INTO savings_evidence (id, organisation_id, savings_case_id, evidence_type, reference, note, created_by_user_id)
VALUES (
  '00000000-0000-0000-0000-000000000043',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000042',
  'measured_process_time',
  'post-change-timing-sheet-2026-09',
  'Six occurrences timed after the change; mean 4 minutes per referral.',
  '00000000-0000-0000-0000-0000000000a4'
);

-- The full append-only lifecycle, so the verified figure can be
-- reconstructed transition by transition with an actor against each.
INSERT INTO savings_case_state_history (organisation_id, savings_case_id, changed_at, changed_by_user_id, from_state, to_state, reason)
VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000042', now() - interval '12 days', '00000000-0000-0000-0000-0000000000a4', NULL, 'potential', 'case opened'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000042', now() - interval '10 days', '00000000-0000-0000-0000-0000000000a2', 'potential', 'approved', 'worth doing; low cost to change'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000042', now() - interval '7 days', '00000000-0000-0000-0000-0000000000a4', 'approved', 'implemented', 'direct referral intake switched on'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000042', now() - interval '3 days', '00000000-0000-0000-0000-0000000000a4', 'implemented', 'measured', 'measured from persisted baseline and post-intervention measurement'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000042', now() - interval '2 days', '00000000-0000-0000-0000-0000000000a2', 'measured', 'verified', 'timing sheets reviewed against the baseline');
