-- Phase 12 — Staff Time Waste & Duplication
--
-- Two deliberate design decisions, both different from Phase 8/10/11:
--
-- 1. A waste event is NOT a work item. Referrals (Phase 8) and vacancies
--    (Phase 10) each ARE a `work_items` row because they are owned work
--    with a deadline from the moment they exist. A waste event is the
--    opposite: MODULE_REGISTER.md M05 requires "quick waste-event
--    capture", and forcing an owner, a due date and a health state onto
--    a ten-second observation is exactly what stops staff logging it.
--    Waste events are therefore cheap, ownerless observations.
--
-- 2. A process intervention IS a work item (domain =
--    'waste_intervention'). The moment the practice decides to DO
--    something about waste, it is owned work with a deadline and needs
--    escalation, transfer and close-with-reason — so it reuses the
--    Phase 7 engine rather than reimplementing any of it.
--
-- The savings tables below are generic across all four value categories
-- in docs/product/SAVINGS_MEASUREMENT_CONTRACT.md, not Category D only.
-- Phase 12 is the first phase whose GREEN GATE requires a case to reach
-- Verified, so the ledger spine is built here; Phase 16 adds the
-- period roll-ups and dashboard reconstruction on top of these tables
-- rather than replacing them.

-- ---------------------------------------------------------------------
-- Staff-efficiency domain (DATA_MODEL_BLUEPRINT.md "Staff-efficiency domain")
-- ---------------------------------------------------------------------

-- `waste_categories`, `time_estimates` and `root_causes` appear as
-- separate tables in the logical blueprint. They are realised here as
-- frozen CHECK-constrained enumerations plus columns, matching how every
-- other frozen status set in this schema is done (health_state, status,
-- refill_outcome, absence_type) and keeping them in lockstep with
-- packages/shared-types. A user-editable lookup table would let an
-- operator invent a category the savings engine has no formula for.
CREATE TABLE process_interventions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id          uuid NOT NULL,
  work_item_id             uuid NOT NULL,
  title                    text NOT NULL,
  description              text,
  root_cause_category      text NOT NULL CHECK (root_cause_category IN (
                             'no_single_source_of_truth',
                             'manual_process',
                             'unclear_ownership',
                             'system_limitation',
                             'training_gap',
                             'policy_or_approval_step',
                             'external_dependency'
                           )),
  implemented_at           timestamptz,
  implemented_by_user_id   uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  UNIQUE (work_item_id),
  FOREIGN KEY (work_item_id, organisation_id) REFERENCES work_items(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (implemented_by_user_id, organisation_id) REFERENCES users(id, organisation_id),
  -- "Implemented" means someone actually carried the change out
  -- (SAVINGS_MEASUREMENT_CONTRACT.md lifecycle) — it can never be a
  -- timestamp with nobody's name against it.
  CONSTRAINT implemented_has_actor CHECK ((implemented_at IS NULL) = (implemented_by_user_id IS NULL))
);

CREATE TABLE waste_events (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id        uuid NOT NULL,
  centre_id              uuid,
  reported_by_user_id    uuid NOT NULL,
  -- The seven categories frozen by CHRONOLOGICAL_BUILD_PLAN.md Phase 12
  -- item 2 and MODULE_REGISTER.md M05.
  category               text NOT NULL CHECK (category IN (
                           'duplicate_work',
                           'rework',
                           'searching',
                           'waiting',
                           'unnecessary_approval',
                           'wrong_role_work',
                           'avoidable_manual_entry'
                         )),
  -- Which role's time was consumed — the basis for any later labour
  -- valuation, and for M05's "wrong-role work" reporting.
  staff_role             text NOT NULL REFERENCES roles(key),
  description            text NOT NULL,
  estimated_minutes      integer NOT NULL CHECK (estimated_minutes > 0),
  recurrence             text NOT NULL CHECK (recurrence IN ('one_off', 'daily', 'weekly', 'fortnightly', 'monthly')),
  occurred_at            timestamptz NOT NULL DEFAULT now(),
  -- Root-cause review (Phase 12 item 4). Null until reviewed; capture
  -- must never be blocked on knowing the cause.
  root_cause_category    text CHECK (root_cause_category IN (
                           'no_single_source_of_truth',
                           'manual_process',
                           'unclear_ownership',
                           'system_limitation',
                           'training_gap',
                           'policy_or_approval_step',
                           'external_dependency'
                         )),
  root_cause_note        text,
  reviewed_at            timestamptz,
  reviewed_by_user_id    uuid,
  intervention_id        uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  FOREIGN KEY (centre_id, organisation_id) REFERENCES centres(id, organisation_id),
  FOREIGN KEY (reported_by_user_id, organisation_id) REFERENCES users(id, organisation_id),
  FOREIGN KEY (reviewed_by_user_id, organisation_id) REFERENCES users(id, organisation_id),
  FOREIGN KEY (intervention_id, organisation_id) REFERENCES process_interventions(id, organisation_id),
  CONSTRAINT reviewed_has_actor_and_cause CHECK (
    (reviewed_at IS NULL AND reviewed_by_user_id IS NULL AND root_cause_category IS NULL)
    OR (reviewed_at IS NOT NULL AND reviewed_by_user_id IS NOT NULL AND root_cause_category IS NOT NULL)
  ),
  -- An event can only be attached to an intervention once someone has
  -- established what is actually causing it. Otherwise interventions
  -- accumulate events nobody has looked at and the "before" figure they
  -- are measured against means nothing.
  CONSTRAINT intervention_requires_review CHECK (intervention_id IS NULL OR reviewed_at IS NOT NULL)
);

-- ---------------------------------------------------------------------
-- Savings domain (DATA_MODEL_BLUEPRINT.md "Savings domain")
-- ---------------------------------------------------------------------

-- The persisted before-state that anti-double-counting rule 2 requires:
-- "A savings case's baseline must reference a specific, persisted
-- before-state (a savings_baselines record) — never an assumed or
-- estimated figure typed directly into a total."
CREATE TABLE savings_baselines (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id        uuid NOT NULL,
  category               text NOT NULL CHECK (category IN (
                           'recovered_revenue',
                           'avoided_revenue_leakage',
                           'avoided_operating_cost',
                           'released_staff_time'
                         )),
  -- How the figure below was arrived at, in words — the "calculation
  -- method" half of the Phase 2 gate. Free text is minimised elsewhere
  -- in this schema; here it is the point.
  method                 text NOT NULL,
  baseline_minutes       integer CHECK (baseline_minutes >= 0),
  baseline_amount_cents  integer CHECK (baseline_amount_cents >= 0),
  recurrence             text NOT NULL CHECK (recurrence IN ('one_off', 'daily', 'weekly', 'fortnightly', 'monthly')),
  measured_from          timestamptz NOT NULL,
  measured_to            timestamptz NOT NULL,
  source_reference       text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by_user_id     uuid NOT NULL,
  UNIQUE (id, organisation_id),
  FOREIGN KEY (created_by_user_id, organisation_id) REFERENCES users(id, organisation_id),
  CONSTRAINT baseline_has_a_measure CHECK (baseline_minutes IS NOT NULL OR baseline_amount_cents IS NOT NULL),
  CONSTRAINT baseline_period_ordered CHECK (measured_to >= measured_from)
);

CREATE TABLE savings_cases (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id             uuid NOT NULL,
  title                       text NOT NULL,
  category                    text NOT NULL CHECK (category IN (
                                'recovered_revenue',
                                'avoided_revenue_leakage',
                                'avoided_operating_cost',
                                'released_staff_time'
                              )),
  state                       text NOT NULL DEFAULT 'potential' CHECK (state IN (
                                'potential', 'approved', 'implemented', 'measured', 'verified'
                              )),
  baseline_id                 uuid NOT NULL,
  intervention_id             uuid,
  -- The underlying operational event this case claims value from, used
  -- by anti-double-counting rule 1. Generic on purpose: Phase 14 points
  -- it at a recurring cost, Phase 15 at a systemic pattern.
  source_entity_type          text NOT NULL,
  source_entity_id            uuid NOT NULL,

  -- The "after" half of before_after_measurements. Written when the
  -- intervention's effect is actually observed, never guessed at
  -- approval time.
  post_minutes                integer CHECK (post_minutes >= 0),
  post_amount_cents           integer CHECK (post_amount_cents >= 0),
  post_measured_at            timestamptz,

  -- Results computed by packages/savings-engine from the baseline and
  -- the post measurement. Never a manual dashboard entry
  -- (SAVINGS_MEASUREMENT_CONTRACT.md: "System calculation, from
  -- persisted before/after data — never a manual dashboard override").
  measured_minutes_released   integer,
  measured_amount_cents       integer,
  -- Annualised run-rate, stored separately and never summed into a
  -- verified total (contract, "Dashboard totals").
  annualised_minutes_released integer,
  annualised_amount_cents     integer,
  -- Only set when time was converted to money, so the original time
  -- measure always stays visible alongside it (Category D rule).
  labour_rate_cents_per_hour  integer CHECK (labour_rate_cents_per_hour > 0),

  approved_by_user_id         uuid,
  approved_at                 timestamptz,
  implemented_by_user_id      uuid,
  implemented_at              timestamptz,
  measured_at                 timestamptz,
  verified_by_user_id         uuid,
  verified_at                 timestamptz,
  close_reason                text,
  closed_at                   timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by_user_id          uuid NOT NULL,
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (id, organisation_id),
  FOREIGN KEY (baseline_id, organisation_id) REFERENCES savings_baselines(id, organisation_id),
  FOREIGN KEY (intervention_id, organisation_id) REFERENCES process_interventions(id, organisation_id),
  FOREIGN KEY (created_by_user_id, organisation_id) REFERENCES users(id, organisation_id),
  FOREIGN KEY (approved_by_user_id, organisation_id) REFERENCES users(id, organisation_id),
  FOREIGN KEY (implemented_by_user_id, organisation_id) REFERENCES users(id, organisation_id),
  FOREIGN KEY (verified_by_user_id, organisation_id) REFERENCES users(id, organisation_id),

  -- Defence in depth behind the engine's lifecycle guards: a case that
  -- claims a state must carry that state's evidence of having happened.
  CONSTRAINT approved_has_actor CHECK ((approved_at IS NULL) = (approved_by_user_id IS NULL)),
  CONSTRAINT implemented_has_actor CHECK ((implemented_at IS NULL) = (implemented_by_user_id IS NULL)),
  CONSTRAINT verified_has_actor CHECK ((verified_at IS NULL) = (verified_by_user_id IS NULL)),
  CONSTRAINT closed_requires_reason CHECK ((closed_at IS NULL) = (close_reason IS NULL)),
  CONSTRAINT measured_state_has_measurement CHECK (
    state NOT IN ('measured', 'verified')
    OR (measured_at IS NOT NULL AND (measured_minutes_released IS NOT NULL OR measured_amount_cents IS NOT NULL))
  ),
  -- A verifier who is nobody, or a verified case nobody implemented,
  -- cannot exist. The "not the same person who implemented it" half of
  -- the rule needs the actor's role, so it lives in
  -- packages/permissions canVerifySavingsCase().
  CONSTRAINT verified_state_is_complete CHECK (
    state <> 'verified' OR (verified_at IS NOT NULL AND implemented_at IS NOT NULL)
  )
);

-- Anti-double-counting rule 1: one underlying operational event may back
-- at most one open savings case per value category. A case closed with a
-- reason (rejected, superseded) releases the slot; it is never deleted.
CREATE UNIQUE INDEX uniq_savings_case_per_source_and_category
  ON savings_cases (organisation_id, source_entity_type, source_entity_id, category)
  WHERE closed_at IS NULL;

-- Append-only lifecycle history, same pattern as work_item_status_history.
-- The contract requires every transition to be recoverable with actor,
-- timestamp, prior state, new state and reason.
CREATE TABLE savings_case_state_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL,
  savings_case_id     uuid NOT NULL,
  changed_at          timestamptz NOT NULL DEFAULT now(),
  changed_by_user_id  uuid,
  from_state          text,
  to_state            text NOT NULL,
  reason              text,
  FOREIGN KEY (savings_case_id, organisation_id) REFERENCES savings_cases(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_user_id, organisation_id) REFERENCES users(id, organisation_id)
);

CREATE TABLE savings_evidence (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL,
  savings_case_id     uuid NOT NULL,
  -- The evidence hierarchy frozen in SAVINGS_MEASUREMENT_CONTRACT.md.
  evidence_type       text NOT NULL CHECK (evidence_type IN (
                        'invoice',
                        'subscription_bill',
                        'appointment_outcome',
                        'booking_record',
                        'payment_record',
                        'measured_process_time',
                        'system_event',
                        'staffing_cost_baseline'
                      )),
  reference           text,
  note                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by_user_id  uuid,
  FOREIGN KEY (savings_case_id, organisation_id) REFERENCES savings_cases(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id, organisation_id) REFERENCES users(id, organisation_id)
);

CREATE INDEX idx_waste_events_org ON waste_events (organisation_id);
CREATE INDEX idx_waste_events_category ON waste_events (organisation_id, category);
CREATE INDEX idx_waste_events_intervention ON waste_events (intervention_id);
CREATE INDEX idx_waste_events_unreviewed ON waste_events (organisation_id) WHERE reviewed_at IS NULL;
CREATE INDEX idx_process_interventions_org ON process_interventions (organisation_id);
CREATE INDEX idx_process_interventions_work_item ON process_interventions (work_item_id);
CREATE INDEX idx_savings_baselines_org ON savings_baselines (organisation_id);
CREATE INDEX idx_savings_cases_org ON savings_cases (organisation_id);
CREATE INDEX idx_savings_cases_state ON savings_cases (organisation_id, state);
CREATE INDEX idx_savings_cases_source ON savings_cases (source_entity_type, source_entity_id);
CREATE INDEX idx_savings_cases_intervention ON savings_cases (intervention_id);
CREATE INDEX idx_savings_case_state_history_case ON savings_case_state_history (savings_case_id);
CREATE INDEX idx_savings_evidence_case ON savings_evidence (savings_case_id);

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

ALTER TABLE waste_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON waste_events
  USING (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE process_interventions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON process_interventions
  USING (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE savings_baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON savings_baselines
  USING (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE savings_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON savings_cases
  USING (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE savings_case_state_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON savings_case_state_history
  USING (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE savings_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON savings_evidence
  USING (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- ---------------------------------------------------------------------
-- Least-privilege grants
-- ---------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON
  waste_events,
  process_interventions,
  savings_baselines,
  savings_cases
TO psych_savings_runtime;

-- Append-only: insert + read only, never update or delete.
GRANT SELECT, INSERT ON
  savings_case_state_history,
  savings_evidence
TO psych_savings_runtime;

-- Corrective, not new Phase 12 scope: migrations 0007 and 0009-0011
-- added tables (and one column write) that the least-privilege runtime
-- role was never granted, so every phase from 6 onward would fail with
-- "permission denied for table" against any environment using
-- `psych_savings_runtime` rather than the owner credential. Verified
-- against what apps/api/src/db/*.ts actually reads and writes.
-- Migrations are append-only after release, so the fix belongs here.
GRANT SELECT, INSERT, UPDATE ON
  sessions,
  mfa_secrets,
  referrals,
  appointment_vacancies,
  absences
TO psych_savings_runtime;

GRANT SELECT, INSERT ON
  login_attempts,
  referral_contact_attempts,
  handovers
TO psych_savings_runtime;

-- work_item_owners is an append-only pair of rows (assigned/unassigned),
-- so 0006 granted INSERT only — but closing an ownership period means
-- writing `unassigned_at` on the existing row, which the Phase 7 engine
-- does on every accepted transfer. A column-level grant allows exactly
-- that one write and nothing else, keeping the rest of the row immutable.
GRANT UPDATE (unassigned_at) ON work_item_owners TO psych_savings_runtime;
