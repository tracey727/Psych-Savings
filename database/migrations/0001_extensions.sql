-- Phase 5 — Authoritative Database Spine
-- Extensions required by every later migration (non-guessable UUID primary keys).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
