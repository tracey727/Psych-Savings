-- Synthetic unexpected absence for reception user A3, handing over two
-- of their open items to director A2: one still pending acceptance
-- (proves the absent owner remains the recorded owner — nothing
-- orphaned), one accepted (proves ownership actually moves once
-- accepted). This is also the first live exercise of the Phase 7
-- transfer-with-acceptance mechanism itself, not just the Phase 11
-- wrapper around it.

INSERT INTO absences (id, organisation_id, user_id, absence_type, starts_at, ends_at)
VALUES (
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a3',
  'unexpected',
  now() - interval '1 hour',
  NULL
);

-- Handover 1: referral e1's work item (c1) — left pending.
INSERT INTO work_item_transfers (id, organisation_id, work_item_id, from_user_id, to_user_id, reason)
VALUES (
  '00000000-0000-0000-0000-000000000022',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000c1',
  '00000000-0000-0000-0000-0000000000a3',
  '00000000-0000-0000-0000-0000000000a2',
  'handover for unexpected absence'
);
INSERT INTO handovers (id, organisation_id, absence_id, work_item_id, transfer_id, temporary_owner_user_id)
VALUES (
  '00000000-0000-0000-0000-000000000024',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-0000000000c1',
  '00000000-0000-0000-0000-000000000022',
  '00000000-0000-0000-0000-0000000000a2'
);

-- Handover 2: callback f2's work item — accepted, ownership actually moves.
INSERT INTO work_item_transfers (id, organisation_id, work_item_id, from_user_id, to_user_id, reason, accepted_at)
VALUES (
  '00000000-0000-0000-0000-000000000023',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000f2',
  '00000000-0000-0000-0000-0000000000a3',
  '00000000-0000-0000-0000-0000000000a2',
  'handover for unexpected absence',
  now() - interval '30 minutes'
);
INSERT INTO handovers (id, organisation_id, absence_id, work_item_id, transfer_id, temporary_owner_user_id)
VALUES (
  '00000000-0000-0000-0000-000000000025',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-0000000000f2',
  '00000000-0000-0000-0000-000000000023',
  '00000000-0000-0000-0000-0000000000a2'
);
-- Ownership actually moved for the accepted handover:
UPDATE work_items SET current_owner_user_id = '00000000-0000-0000-0000-0000000000a2'
WHERE id = '00000000-0000-0000-0000-0000000000f2';
UPDATE work_item_owners SET unassigned_at = now() - interval '30 minutes'
WHERE work_item_id = '00000000-0000-0000-0000-0000000000f2' AND unassigned_at IS NULL;
INSERT INTO work_item_owners (organisation_id, work_item_id, user_id, assigned_at)
VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a2', now() - interval '30 minutes');
