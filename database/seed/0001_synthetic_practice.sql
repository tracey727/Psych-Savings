-- Synthetic seed data for development/preview/CI only
-- (docs/product/DIRECTIVE_FREEZE.md §8). Two organisations are seeded
-- specifically to prove tenant isolation — never seed only one, or an
-- isolation bug can hide behind "there's nothing else to leak".

INSERT INTO organisations (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Synthetic Practice A'),
  ('00000000-0000-0000-0000-000000000002', 'Synthetic Practice B');

INSERT INTO centres (id, organisation_id, name) VALUES
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 'Practice A - Main Centre'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000002', 'Practice B - Main Centre');

INSERT INTO users (id, organisation_id, email, display_name) VALUES
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000001', 'irene.a@example-synthetic.test', 'Irene A (synthetic director)'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000001', 'reception.a@example-synthetic.test', 'Reception A (synthetic)'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000002', 'director.b@example-synthetic.test', 'Director B (synthetic)');

INSERT INTO user_role_assignments (organisation_id, user_id, role_key) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'director'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'reception_admin'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2', 'director');

INSERT INTO work_items (id, organisation_id, centre_id, domain, title, current_owner_user_id, due_at, next_action) VALUES
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'referral', 'Synthetic referral A1 - first contact', '00000000-0000-0000-0000-0000000000a3', now() + interval '1 day', 'Call client back'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'referral', 'Synthetic referral B1 - first contact', '00000000-0000-0000-0000-0000000000b2', now() + interval '1 day', 'Call client back');
