-- Phase 12 GREEN GATE evidence — "At least one end-to-end synthetic
-- waste case reaches Verified savings with evidence."
--
-- Two halves:
--   1. the seeded synthetic case really is Verified, with a persisted
--      baseline, a post-intervention measurement, evidence, and a
--      verifier who is not the implementer;
--   2. the database itself refuses the shortcuts that would let an
--      unsupported figure reach a total.
--
-- Same shape as tenant_isolation.sql: one DO block, so it also runs over
-- a connection that allows only one statement per round trip. Requires
--   1. database/migrations 0001-0012 applied;
--   2. database/seed 0001-0007 applied.
--
-- Verified results (2026-09-03, PostgreSQL 16.13, migrations+seed from zero):
--   verified_case_count                   = 1
--   verified_case_minutes_released        = 8      (baseline 12 - post 4)
--   verified_case_evidence_count          = 1
--   verifier_is_not_implementer           = true
--   lifecycle_transitions                 = ["potential","approved","implemented","measured","verified"]
--   second_case_same_source_blocked       = true   (anti-double-counting rule 1)
--   review_without_root_cause_blocked     = true
--   verified_without_implementation_blocked = true
--   measured_without_measurement_blocked  = true
--   unreviewed_event_attach_blocked       = true
--   invented_waste_category_blocked       = true

CREATE TEMPORARY TABLE _waste_savings_test_results (label text, value jsonb);

DO $$
DECLARE
  cnt int;
  val int;
  flag boolean;
  states jsonb;
BEGIN
  -- 1. The synthetic case reached Verified, and its figure is reconstructable.
  SELECT count(*) INTO cnt FROM savings_cases WHERE state = 'verified';
  INSERT INTO _waste_savings_test_results VALUES ('verified_case_count', to_jsonb(cnt));

  SELECT c.measured_minutes_released INTO val
  FROM savings_cases c WHERE c.state = 'verified' LIMIT 1;
  INSERT INTO _waste_savings_test_results VALUES ('verified_case_minutes_released', to_jsonb(val));

  SELECT count(*) INTO cnt
  FROM savings_evidence e
  JOIN savings_cases c ON c.id = e.savings_case_id
  WHERE c.state = 'verified';
  INSERT INTO _waste_savings_test_results VALUES ('verified_case_evidence_count', to_jsonb(cnt));

  SELECT bool_and(c.verified_by_user_id <> c.implemented_by_user_id) INTO flag
  FROM savings_cases c WHERE c.state = 'verified';
  INSERT INTO _waste_savings_test_results VALUES ('verifier_is_not_implementer', to_jsonb(flag));

  SELECT jsonb_agg(h.to_state ORDER BY h.changed_at) INTO states
  FROM savings_case_state_history h
  JOIN savings_cases c ON c.id = h.savings_case_id
  WHERE c.state = 'verified';
  INSERT INTO _waste_savings_test_results VALUES ('lifecycle_transitions', states);

  -- 2. The shortcuts the database must refuse.
  BEGIN
    INSERT INTO savings_cases (organisation_id, title, category, baseline_id, source_entity_type, source_entity_id, created_by_user_id)
    VALUES ('00000000-0000-0000-0000-000000000001', 'double count attempt', 'released_staff_time',
            '00000000-0000-0000-0000-000000000041', 'process_intervention',
            '00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-0000000000a4');
    INSERT INTO _waste_savings_test_results VALUES ('second_case_same_source_blocked', to_jsonb(false));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _waste_savings_test_results VALUES ('second_case_same_source_blocked', to_jsonb(true));
  END;

  BEGIN
    UPDATE waste_events
    SET reviewed_at = now(), reviewed_by_user_id = '00000000-0000-0000-0000-0000000000a4', root_cause_category = NULL
    WHERE id = '00000000-0000-0000-0000-0000000000d4';
    INSERT INTO _waste_savings_test_results VALUES ('review_without_root_cause_blocked', to_jsonb(false));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _waste_savings_test_results VALUES ('review_without_root_cause_blocked', to_jsonb(true));
  END;

  BEGIN
    INSERT INTO savings_cases (organisation_id, title, category, state, baseline_id, source_entity_type,
                               source_entity_id, created_by_user_id, verified_at, verified_by_user_id,
                               measured_at, measured_minutes_released)
    VALUES ('00000000-0000-0000-0000-000000000001', 'verified without doing it', 'released_staff_time', 'verified',
            '00000000-0000-0000-0000-000000000041', 'waste_event', '00000000-0000-0000-0000-0000000000d4',
            '00000000-0000-0000-0000-0000000000a4', now(), '00000000-0000-0000-0000-0000000000a2', now(), 99);
    INSERT INTO _waste_savings_test_results VALUES ('verified_without_implementation_blocked', to_jsonb(false));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _waste_savings_test_results VALUES ('verified_without_implementation_blocked', to_jsonb(true));
  END;

  BEGIN
    INSERT INTO savings_cases (organisation_id, title, category, state, baseline_id, source_entity_type,
                               source_entity_id, created_by_user_id)
    VALUES ('00000000-0000-0000-0000-000000000001', 'measured with no numbers', 'released_staff_time', 'measured',
            '00000000-0000-0000-0000-000000000041', 'waste_event', '00000000-0000-0000-0000-0000000000d4',
            '00000000-0000-0000-0000-0000000000a4');
    INSERT INTO _waste_savings_test_results VALUES ('measured_without_measurement_blocked', to_jsonb(false));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _waste_savings_test_results VALUES ('measured_without_measurement_blocked', to_jsonb(true));
  END;

  BEGIN
    UPDATE waste_events SET intervention_id = '00000000-0000-0000-0000-000000000031'
    WHERE id = '00000000-0000-0000-0000-0000000000d4';
    INSERT INTO _waste_savings_test_results VALUES ('unreviewed_event_attach_blocked', to_jsonb(false));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _waste_savings_test_results VALUES ('unreviewed_event_attach_blocked', to_jsonb(true));
  END;

  BEGIN
    INSERT INTO waste_events (organisation_id, reported_by_user_id, category, staff_role, description,
                              estimated_minutes, recurrence)
    VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'vibes',
            'reception_admin', 'not a real category', 5, 'weekly');
    INSERT INTO _waste_savings_test_results VALUES ('invented_waste_category_blocked', to_jsonb(false));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _waste_savings_test_results VALUES ('invented_waste_category_blocked', to_jsonb(true));
  END;
END $$;

SELECT label, value FROM _waste_savings_test_results;
