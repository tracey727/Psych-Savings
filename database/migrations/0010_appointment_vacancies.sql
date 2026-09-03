-- Phase 10 — Appointment Leakage & Refill
--
-- Same design decision as Phase 8's referrals: a vacancy IS a
-- `work_items` row (domain = 'appointment_vacancy') plus exactly the
-- fields that are genuinely vacancy-specific. Ownership, the refill
-- window deadline, escalation and close/reopen are the Phase 7 engine.
-- Outreach attempts reuse `action_evidence` directly (evidence_type =
-- 'outreach_attempt') — no new table, same mechanism Phase 9 used for
-- reception contact attempts.

CREATE TABLE appointment_vacancies (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id        uuid NOT NULL,
  work_item_id           uuid NOT NULL,
  cancellation_reason    text NOT NULL,
  original_value_cents   integer,
  slot_time              timestamptz,
  refill_outcome         text CHECK (refill_outcome IN ('refilled', 'not_refilled')),
  recovered_value_cents  integer,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  UNIQUE (work_item_id),
  FOREIGN KEY (work_item_id, organisation_id) REFERENCES work_items(id, organisation_id) ON DELETE CASCADE,
  -- Recovered revenue is only ever the verified replacement value
  -- actually achieved (docs/product/SAVINGS_MEASUREMENT_CONTRACT.md
  -- Category A) — never counted merely because a candidate was
  -- contacted, so a "refilled" outcome always carries a value.
  CONSTRAINT recovered_value_required_when_refilled CHECK (refill_outcome <> 'refilled' OR recovered_value_cents IS NOT NULL)
);

CREATE INDEX idx_appointment_vacancies_org ON appointment_vacancies (organisation_id);
CREATE INDEX idx_appointment_vacancies_work_item ON appointment_vacancies (work_item_id);
CREATE INDEX idx_appointment_vacancies_reason ON appointment_vacancies (cancellation_reason);

ALTER TABLE appointment_vacancies ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON appointment_vacancies
  USING (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
