-- ═══════════════════════════════════════════════════════════════════════════
-- THE HEADQUARTERS — Supabase schema (full create, idempotent, single-shot)
-- All schemas mirror src/lib/sync.js exactly. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. user_profile ──────────────────────────────────────────────────────
-- Single-row table partitioned on id='samuel'.
CREATE TABLE IF NOT EXISTS public.user_profile (
  id               text PRIMARY KEY DEFAULT 'samuel',
  name             text,
  role             text,
  annual_goal      numeric,
  sector           text,
  sector_custom    text,
  audience         text,
  language         text,
  stage            text,
  experience       text,
  strength         text,
  challenges       text[],
  past_failures    text,
  coaching_style   smallint,
  primary_agent    text,
  sensitive_topics text,
  availability     text[],
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profile DROP CONSTRAINT IF EXISTS user_profile_stage_check;
ALTER TABLE public.user_profile ADD  CONSTRAINT user_profile_stage_check
  CHECK (stage IS NULL OR stage IN ('starting', 'first_revenue', 'growing', 'established'));

ALTER TABLE public.user_profile DROP CONSTRAINT IF EXISTS user_profile_experience_check;
ALTER TABLE public.user_profile ADD  CONSTRAINT user_profile_experience_check
  CHECK (experience IS NULL OR experience IN ('lt1y', '1to3y', '3to5y', '5plus'));

ALTER TABLE public.user_profile DROP CONSTRAINT IF EXISTS user_profile_strength_check;
ALTER TABLE public.user_profile ADD  CONSTRAINT user_profile_strength_check
  CHECK (strength IS NULL OR strength IN ('builder', 'closer', 'strategist', 'executor', 'creator', 'networker'));

ALTER TABLE public.user_profile DROP CONSTRAINT IF EXISTS user_profile_coaching_style_check;
ALTER TABLE public.user_profile ADD  CONSTRAINT user_profile_coaching_style_check
  CHECK (coaching_style IS NULL OR coaching_style BETWEEN 1 AND 5);

ALTER TABLE public.user_profile DROP CONSTRAINT IF EXISTS user_profile_primary_agent_check;
ALTER TABLE public.user_profile ADD  CONSTRAINT user_profile_primary_agent_check
  CHECK (primary_agent IS NULL OR primary_agent IN ('HORMOZI', 'CARDONE', 'ROBBINS', 'GARYV', 'NAVAL', 'VOSS'));


-- ─── 2. victories ─────────────────────────────────────────────────────────
-- Append-only journal of business wins. Upsert by client-generated id.
CREATE TABLE IF NOT EXISTS public.victories (
  id            text PRIMARY KEY,
  description   text,
  value_monthly numeric NOT NULL DEFAULT 0,
  category      text             DEFAULT 'other',
  roi_annual    numeric NOT NULL DEFAULT 0,
  roi_percent   numeric NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS victories_created_at_idx
  ON public.victories (created_at DESC);


-- ─── 3. situation_favorites ───────────────────────────────────────────────
-- Per-situation pin from the Situations library.
CREATE TABLE IF NOT EXISTS public.situation_favorites (
  situation_id text PRIMARY KEY,
  added_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS situation_favorites_added_at_idx
  ON public.situation_favorites (added_at DESC);


-- ─── 4. retainers ─────────────────────────────────────────────────────────
-- Recurring monthly revenue contracts. Updated by client; weekly fetcher
-- queries on updated_at to detect new/cancelled retainers.
CREATE TABLE IF NOT EXISTS public.retainers (
  id         text PRIMARY KEY,
  name       text,
  amount     numeric NOT NULL DEFAULT 0,
  started_at timestamptz,
  workflow   text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS retainers_updated_at_idx
  ON public.retainers (updated_at DESC);


-- ─── 5. one_time_revenues ─────────────────────────────────────────────────
-- Append-only ledger of single-shot revenue entries.
CREATE TABLE IF NOT EXISTS public.one_time_revenues (
  id          text PRIMARY KEY,
  client_name text,
  amount      numeric NOT NULL DEFAULT 0,
  month_idx   smallint,
  year        smallint,
  date        timestamptz NOT NULL DEFAULT now(),
  session_id  text
);

ALTER TABLE public.one_time_revenues DROP CONSTRAINT IF EXISTS one_time_revenues_month_idx_check;
ALTER TABLE public.one_time_revenues ADD  CONSTRAINT one_time_revenues_month_idx_check
  CHECK (month_idx IS NULL OR month_idx BETWEEN 0 AND 11);

CREATE INDEX IF NOT EXISTS one_time_revenues_date_idx
  ON public.one_time_revenues (date DESC);


-- ─── 6. followup_log ──────────────────────────────────────────────────────
-- Append-only ledger of every follow-up email sent. Used to prevent
-- double-relancing + response-rate analytics.
CREATE TABLE IF NOT EXISTS public.followup_log (
  id            text PRIMARY KEY,
  prospect_id   text,
  prospect_name text,
  subject       text,
  body          text,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  batch_id      text,
  status        text NOT NULL DEFAULT 'sent',
  session_id    text
);

ALTER TABLE public.followup_log DROP CONSTRAINT IF EXISTS followup_log_status_check;
ALTER TABLE public.followup_log ADD  CONSTRAINT followup_log_status_check
  CHECK (status IN ('sent', 'failed', 'skipped'));

CREATE INDEX IF NOT EXISTS followup_log_sent_at_idx
  ON public.followup_log (sent_at DESC);

CREATE INDEX IF NOT EXISTS followup_log_prospect_id_idx
  ON public.followup_log (prospect_id);


-- ─── 7. dashboard_state ───────────────────────────────────────────────────
-- Single-row snapshot of the user's financial state — cross-device source of
-- truth for finances. Granular tables above (retainers, one_time_revenues)
-- remain as append-only ledgers; this is the rolled-up snapshot.
-- Mirrors syncDashboardState() / fetchDashboardState() in src/lib/sync.js.
-- state JSONB shape:
--   { annualGoal, monthlyRevenue[], retainers[], oneTimeRevenues[], pipeline{} }
CREATE TABLE IF NOT EXISTS public.dashboard_state (
  user_id    text PRIMARY KEY DEFAULT 'samuel',
  state      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);


-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — single-user app for now. Anon key has full access to all tables.
-- When you add Supabase Auth later, replace `USING (true)` with
-- `USING (auth.uid()::text = <owner_column>)`.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.user_profile        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.victories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.situation_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retainers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_time_revenues   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_state     ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_profile',
    'victories',
    'situation_favorites',
    'retainers',
    'one_time_revenues',
    'followup_log',
    'dashboard_state'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_open_all ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_open_all ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      t, t
    );
  END LOOP;
END$$;
