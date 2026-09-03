-- Phase 11 — Leave, Handover & Absence Continuity
--
-- A handover is NOT a separate ownership mechanism — it IS a
-- work_item_transfer (Phase 7), requested from the absent user to a
-- temporary owner. Ownership does not move until the temporary owner
-- accepts (docs/product/PRODUCT_CONTRACT.md §5.2), which is exactly why
-- no active priority work is ever orphaned during an absence: the
-- absent user remains the recorded owner, visibly, until someone
-- explicitly accepts the handover — never silently. This table links an
-- absence to the transfers it created, rather than reimplementing
-- acceptance.

-- work_item_transfers (Phase 7) never needed a composite unique key
-- until now — nothing referenced it via composite FK before handovers.
-- Additive, non-breaking (migrations are append-only after release).
ALTER TABLE work_item_transfers ADD CONSTRAINT work_item_transfers_id_organisation_id_key UNIQUE (id, organisation_id);

CREATE TABLE absences (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id                uuid NOT NULL,
  user_id                        uuid NOT NULL,
  absence_type                   text NOT NULL CHECK (absence_type IN ('planned_leave', 'unexpected')),
  starts_at                      timestamptz NOT NULL,
  ends_at                        timestamptz,
  created_at                     timestamptz NOT NULL DEFAULT now(),
  return_briefing_completed_at   timestamptz,
  UNIQUE (id, organisation_id),
  FOREIGN KEY (user_id, organisation_id) REFERENCES users(id, organisation_id)
);

CREATE TABLE handovers (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id          uuid NOT NULL,
  absence_id               uuid NOT NULL,
  work_item_id             uuid NOT NULL,
  transfer_id              uuid NOT NULL,
  temporary_owner_user_id  uuid NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organisation_id),
  FOREIGN KEY (absence_id, organisation_id) REFERENCES absences(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (work_item_id, organisation_id) REFERENCES work_items(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (transfer_id, organisation_id) REFERENCES work_item_transfers(id, organisation_id) ON DELETE CASCADE,
  FOREIGN KEY (temporary_owner_user_id, organisation_id) REFERENCES users(id, organisation_id)
);

CREATE INDEX idx_absences_org ON absences (organisation_id);
CREATE INDEX idx_absences_user ON absences (user_id);
CREATE INDEX idx_handovers_org ON handovers (organisation_id);
CREATE INDEX idx_handovers_absence ON handovers (absence_id);
CREATE INDEX idx_handovers_transfer ON handovers (transfer_id);

ALTER TABLE absences ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON absences
  USING (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE handovers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON handovers
  USING (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
