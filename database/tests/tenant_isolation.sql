-- Tenant/role isolation test — Phase 5 GREEN gate evidence.
--
-- Run with any standard multi-statement client (psql, a CI job). The
-- core logic is one DO block so that it also runs unmodified over a
-- connection that only allows one statement per round trip (as used
-- during this build — see CHANGELOG.md "[Phase 5]" — with a permanent
-- table standing in for the temporary one, since a temp table does not
-- survive across separate connections). It requires:
--   1. database/migrations 0001-0006 applied;
--   2. database/seed/0001_synthetic_practice.sql applied;
--   3. the calling role to have been granted `SET` on psych_savings_runtime
--      (`GRANT psych_savings_runtime TO <caller> WITH SET TRUE;`), since the
--      migration/owner role otherwise cannot SET ROLE into a role it does
--      not have SET privilege on (PostgreSQL 16+ role model).
--
-- Verified results (2026-09-03, calm-cake-37228033 dev branch):
--   no_org_set_visible_count              = 0     (fail-closed, no error)
--   org_a_visible_count                   = 1     (sees only its own work item)
--   org_a_session_sees_org_b_users_count  = 0     (cannot read the other org's users)
--   org_b_visible_count                   = 1     (sees only its own work item)
--   cross_tenant_insert_blocked           = true  (RLS WITH CHECK rejects it)
--   audit_delete_blocked                  = true  (no DELETE grant; append-only)

CREATE TEMPORARY TABLE _isolation_test_results (label text, value jsonb);

DO $$
DECLARE
  cnt int;
BEGIN
  SET ROLE psych_savings_runtime;

  SELECT count(*) INTO cnt FROM work_items;
  INSERT INTO _isolation_test_results VALUES ('no_org_set_visible_count', to_jsonb(cnt));

  PERFORM set_config('app.current_org_id', '00000000-0000-0000-0000-000000000001', true);
  SELECT count(*) INTO cnt FROM work_items;
  INSERT INTO _isolation_test_results VALUES ('org_a_visible_count', to_jsonb(cnt));

  SELECT count(*) INTO cnt FROM users WHERE organisation_id = '00000000-0000-0000-0000-000000000002';
  INSERT INTO _isolation_test_results VALUES ('org_a_session_sees_org_b_users_count', to_jsonb(cnt));

  PERFORM set_config('app.current_org_id', '00000000-0000-0000-0000-000000000002', true);
  SELECT count(*) INTO cnt FROM work_items;
  INSERT INTO _isolation_test_results VALUES ('org_b_visible_count', to_jsonb(cnt));

  PERFORM set_config('app.current_org_id', '00000000-0000-0000-0000-000000000001', true);
  BEGIN
    INSERT INTO work_items (organisation_id, domain, title)
      VALUES ('00000000-0000-0000-0000-000000000002', 'referral', 'cross-tenant insert attempt');
    INSERT INTO _isolation_test_results VALUES ('cross_tenant_insert_blocked', to_jsonb(false));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _isolation_test_results VALUES ('cross_tenant_insert_blocked', to_jsonb(true));
  END;

  BEGIN
    DELETE FROM audit_events WHERE organisation_id = '00000000-0000-0000-0000-000000000001';
    INSERT INTO _isolation_test_results VALUES ('audit_delete_blocked', to_jsonb(false));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _isolation_test_results VALUES ('audit_delete_blocked', to_jsonb(true));
  END;

  RESET ROLE;
END $$;

SELECT label, value FROM _isolation_test_results ORDER BY label;

DROP TABLE _isolation_test_results;
