-- Synthetic referrals covering the full range of states, so Phase 8's
-- GREEN gate ("every synthetic referral is traceable from receipt to
-- final outcome with no invisible state") has real fixtures to check
-- against, not just one happy-path row.

-- Referral 1: linked to the existing Phase 5 seed work item (still
-- open, waiting, not yet contacted) — receipt without a final outcome yet.
INSERT INTO referrals (id, organisation_id, work_item_id, source, value_estimate_cents)
VALUES (
  '00000000-0000-0000-0000-0000000000e1',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000c1',
  'GP referral',
  15000
);

-- Referral 2: contacted, then booked (closed) — a full happy-path lifecycle.
INSERT INTO work_items (id, organisation_id, centre_id, domain, title, current_owner_user_id, priority, due_at, next_action, health_state, status, close_reason, closed_at)
VALUES (
  '00000000-0000-0000-0000-0000000000c3',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1',
  'referral',
  'Referral — self-referral online form',
  '00000000-0000-0000-0000-0000000000a3',
  'normal',
  now() - interval '2 days',
  NULL,
  'green',
  'closed',
  'referral outcome: booked',
  now() - interval '1 day'
);
INSERT INTO referrals (id, organisation_id, work_item_id, source, contact_status, outcome, value_estimate_cents)
VALUES (
  '00000000-0000-0000-0000-0000000000e2',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000c3',
  'self-referral online form',
  'contacted',
  'booked',
  18000
);
INSERT INTO referral_contact_attempts (organisation_id, referral_id, method, outcome, notes, created_by_user_id)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000e2',
  'phone',
  'spoke to client, booked initial consult',
  NULL,
  '00000000-0000-0000-0000-0000000000a3'
);

-- Referral 3: contacted, then declined (closed, lost) — proves lost-referral reason capture end to end.
INSERT INTO work_items (id, organisation_id, centre_id, domain, title, current_owner_user_id, priority, due_at, next_action, health_state, status, close_reason, closed_at)
VALUES (
  '00000000-0000-0000-0000-0000000000c4',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1',
  'referral',
  'Referral — insurance panel',
  '00000000-0000-0000-0000-0000000000a3',
  'normal',
  now() - interval '3 days',
  NULL,
  'green',
  'closed',
  'referral lost: found another provider closer to home',
  now() - interval '2 days'
);
INSERT INTO referrals (id, organisation_id, work_item_id, source, contact_status, outcome, lost_reason, value_estimate_cents)
VALUES (
  '00000000-0000-0000-0000-0000000000e3',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000c4',
  'insurance panel',
  'contacted',
  'declined',
  'found another provider closer to home',
  12000
);
INSERT INTO referral_contact_attempts (organisation_id, referral_id, method, outcome, notes, created_by_user_id)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000e3',
  'phone',
  'spoke to client, declined',
  'found another provider closer to home',
  '00000000-0000-0000-0000-0000000000a3'
);
