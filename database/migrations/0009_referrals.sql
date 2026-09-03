-- Phase 8 — No Lost Referral™
--
-- Design decision: docs/architecture/DATA_MODEL_BLUEPRINT.md's "Referral
-- domain" is a logical model, not a literal physical schema ("Physical
-- schema design occurs only after the product contract is frozen" —
-- see that file's header). Ownership, due dates/deadlines, transfer,
-- escalation and close/reopen are already fully built by Phase 7's
-- work-ownership engine on `work_items` — a referral does not need its
-- own owner/status-history/escalation tables duplicating that. Each
-- referral is a `work_items` row (domain = 'referral') plus exactly the
-- fields that are genuinely referral-specific: source, contact
-- progress, outcome and value estimate.

CREATE TABLE referrals (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id      uuid NOT NULL,
  work_item_id         uuid NOT NULL,
  source               text NOT NULL,
  received_at          timestamptz NOT NULL DEFAULT now(),
  contact_status       text NOT NULL DEFAULT 'not_yet_contacted' CHECK (contact_status IN ('not_yet_contacted', 'attempting', 'contacted')),
  outcome              text CHECK (outcome IN ('waiting', 'booked', 'declined', 'not_suitable')),
  lost_reason          text,
  value_estimate_cents integer,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  UNIQUE (work_item_id),
  FOREIGN KEY (work_item_id, organisation_id) REFERENCES work_items(id, organisation_id) ON DELETE CASCADE,
  -- Lost-referral reason capture (MODULE_REGISTER.md M01): a declined or
  -- not-suitable outcome — this product's definition of "lost" — always
  -- carries a reason, enforced here as well as in application code.
  CONSTRAINT lost_reason_required CHECK (outcome NOT IN ('declined', 'not_suitable') OR lost_reason IS NOT NULL)
);

-- Append-only, like every other *_attempts/history table in this schema.
CREATE TABLE referral_contact_attempts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL,
  referral_id         uuid NOT NULL,
  attempted_at        timestamptz NOT NULL DEFAULT now(),
  method              text NOT NULL,
  outcome             text NOT NULL,
  notes               text,
  created_by_user_id  uuid,
  FOREIGN KEY (referral_id, organisation_id) REFERENCES referrals(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id, organisation_id) REFERENCES users(id, organisation_id)
);

CREATE INDEX idx_referrals_org ON referrals (organisation_id);
CREATE INDEX idx_referrals_work_item ON referrals (work_item_id);
CREATE INDEX idx_referrals_outcome ON referrals (outcome);
CREATE INDEX idx_referral_contact_attempts_referral ON referral_contact_attempts (referral_id);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON referrals
  USING (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE referral_contact_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON referral_contact_attempts
  USING (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
