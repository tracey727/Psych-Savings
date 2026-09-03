-- Synthetic appointment vacancies covering the full range of states:
-- refilled (recovered value), not refilled, and still pending within
-- its refill window — so Phase 10's GREEN gate ("cancelled capacity can
-- be tracked from vacancy to refill/no-refill and recovered value is
-- auditable") has real fixtures, not just the unit-test fakes.

-- Vacancy 1: refilled — recovered value auditable end to end.
INSERT INTO work_items (id, organisation_id, centre_id, domain, title, current_owner_user_id, priority, due_at, next_action, health_state, status, close_reason, closed_at)
VALUES (
  '00000000-0000-0000-0000-0000000000c5',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1',
  'appointment_vacancy',
  'Vacancy — client_illness',
  '00000000-0000-0000-0000-0000000000a3',
  'normal',
  now() - interval '1 day',
  NULL,
  'green',
  'closed',
  'appointment refilled — recovered value 165.00',
  now() - interval '12 hours'
);
INSERT INTO appointment_vacancies (id, organisation_id, work_item_id, cancellation_reason, original_value_cents, slot_time, refill_outcome, recovered_value_cents)
VALUES (
  '00000000-0000-0000-0000-0000000000f4',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000c5',
  'client_illness',
  18000,
  now() - interval '1 day',
  'refilled',
  16500
);
INSERT INTO action_evidence (organisation_id, work_item_id, evidence_type, reference, note, created_by_user_id)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000c5',
  'outreach_attempt',
  'spoke_to_candidate',
  'waitlist candidate accepted the slot',
  '00000000-0000-0000-0000-0000000000a3'
);

-- Vacancy 2: not refilled — window closed with no replacement found.
INSERT INTO work_items (id, organisation_id, centre_id, domain, title, current_owner_user_id, priority, due_at, next_action, health_state, status, close_reason, closed_at)
VALUES (
  '00000000-0000-0000-0000-0000000000c6',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1',
  'appointment_vacancy',
  'Vacancy — no_show',
  '00000000-0000-0000-0000-0000000000a3',
  'normal',
  now() - interval '2 days',
  NULL,
  'green',
  'closed',
  'vacancy window closed, not refilled',
  now() - interval '1 day'
);
INSERT INTO appointment_vacancies (id, organisation_id, work_item_id, cancellation_reason, original_value_cents, slot_time, refill_outcome, recovered_value_cents)
VALUES (
  '00000000-0000-0000-0000-0000000000f5',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000c6',
  'no_show',
  14000,
  now() - interval '2 days',
  'not_refilled',
  NULL
);

-- Vacancy 3: still open, pending within its refill window.
INSERT INTO work_items (id, organisation_id, centre_id, domain, title, current_owner_user_id, priority, due_at, next_action, health_state, status)
VALUES (
  '00000000-0000-0000-0000-0000000000c7',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1',
  'appointment_vacancy',
  'Vacancy — client_scheduling_conflict',
  '00000000-0000-0000-0000-0000000000a3',
  'normal',
  now() + interval '1 day',
  'Contact waitlist candidates',
  'amber',
  'open'
);
INSERT INTO appointment_vacancies (id, organisation_id, work_item_id, cancellation_reason, original_value_cents, slot_time)
VALUES (
  '00000000-0000-0000-0000-0000000000f6',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000c7',
  'client_scheduling_conflict',
  17000,
  now() + interval '1 day'
);
