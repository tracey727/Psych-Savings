-- Synthetic reception callbacks (domain = 'callback'), covering the
-- range Phase 9's queue needs to sort correctly: overdue, due soon, and
-- one escalated — so getQueue's ordering has real fixtures to check,
-- not just the unit-test fakes.

INSERT INTO work_items (id, organisation_id, centre_id, domain, title, current_owner_user_id, priority, due_at, next_action, health_state, status)
VALUES
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'callback', 'Callback — client asked about fees', '00000000-0000-0000-0000-0000000000a3', 'normal', now() - interval '1 hour', 'Call back with fee schedule', 'red', 'open'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'callback', 'Callback — reschedule request', '00000000-0000-0000-0000-0000000000a3', 'normal', now() + interval '2 hours', 'Confirm new time', 'amber', 'open'),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'callback', 'Callback — general enquiry', '00000000-0000-0000-0000-0000000000a3', 'low', now() + interval '3 days', 'Call back when convenient', 'green', 'open');

INSERT INTO action_evidence (organisation_id, work_item_id, evidence_type, reference, note, created_by_user_id)
VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'contact_attempt', 'no_answer', 'tried this morning', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f2', 'contact_attempt', 'left_message', NULL, '00000000-0000-0000-0000-0000000000a3');

INSERT INTO escalations (organisation_id, work_item_id, escalated_to_user_id, reason)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000f1',
  '00000000-0000-0000-0000-0000000000a2',
  'no answer after 3 attempts, client is time-sensitive'
);
