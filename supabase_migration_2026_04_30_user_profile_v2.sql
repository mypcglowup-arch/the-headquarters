-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : user_profile v2 — personalization layer for agent calibration
-- Apply once : adds 9 nullable columns to user_profile for stage / experience /
-- strength / challenges / past failures / coaching style / primary agent /
-- sensitive topics / availability.
--
-- All columns are NULLABLE — existing rows continue to work, agents fall back
-- to generic behavior when a field is empty.
--
-- Safe to re-run : every ALTER uses IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS stage            text;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS experience       text;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS strength         text;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS challenges       text[];
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS past_failures    text;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS coaching_style   smallint;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS primary_agent    text;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS sensitive_topics text;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS availability     text[];

-- Domain validation — reject typos at the DB layer rather than silently storing junk.
ALTER TABLE user_profile DROP CONSTRAINT IF EXISTS user_profile_stage_check;
ALTER TABLE user_profile ADD  CONSTRAINT user_profile_stage_check
  CHECK (stage IS NULL OR stage IN ('starting', 'first_revenue', 'growing', 'established'));

ALTER TABLE user_profile DROP CONSTRAINT IF EXISTS user_profile_experience_check;
ALTER TABLE user_profile ADD  CONSTRAINT user_profile_experience_check
  CHECK (experience IS NULL OR experience IN ('lt1y', '1to3y', '3to5y', '5plus'));

ALTER TABLE user_profile DROP CONSTRAINT IF EXISTS user_profile_strength_check;
ALTER TABLE user_profile ADD  CONSTRAINT user_profile_strength_check
  CHECK (strength IS NULL OR strength IN ('builder', 'closer', 'strategist', 'executor', 'creator', 'networker'));

ALTER TABLE user_profile DROP CONSTRAINT IF EXISTS user_profile_coaching_style_check;
ALTER TABLE user_profile ADD  CONSTRAINT user_profile_coaching_style_check
  CHECK (coaching_style IS NULL OR coaching_style BETWEEN 1 AND 5);

ALTER TABLE user_profile DROP CONSTRAINT IF EXISTS user_profile_primary_agent_check;
ALTER TABLE user_profile ADD  CONSTRAINT user_profile_primary_agent_check
  CHECK (primary_agent IS NULL OR primary_agent IN ('HORMOZI', 'CARDONE', 'ROBBINS', 'GARYV', 'NAVAL', 'VOSS'));
