-- ═══════════════════════════════════════════════════════════════════════════
-- THE HEADQUARTERS — dashboard_state nuke & rebuild
-- À exécuter si un 401 Unauthorized persiste sur POST /rest/v1/dashboard_state
-- malgré le re-run du schema.sql complet. Reset total : drop, recreate, RLS,
-- grants. La donnée est regénérée au prochain syncDashboardState() côté app.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Drop the table entirely (CASCADE wipes any dependent policies) ──────
DROP TABLE IF EXISTS public.dashboard_state CASCADE;

-- ── 2. Recreate from scratch ────────────────────────────────────────────────
-- Mirrors src/lib/sync.js syncDashboardState / fetchDashboardState.
-- state JSONB shape : { annualGoal, monthlyRevenue[], retainers[], oneTimeRevenues[], pipeline{} }
CREATE TABLE public.dashboard_state (
  user_id    text PRIMARY KEY DEFAULT 'samuel',
  state      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Explicit privileges ─────────────────────────────────────────────────
-- Even with RLS, PostgREST also requires base GRANTs. A 401 that survives
-- "open" RLS policies is almost always a missing GRANT on anon. Belt + braces.
GRANT USAGE  ON SCHEMA public                       TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_state TO anon, authenticated;

-- ── 4. Enable Row Level Security ───────────────────────────────────────────
ALTER TABLE public.dashboard_state ENABLE ROW LEVEL SECURITY;

-- Make sure no leftover policy from a previous broken state survives
DROP POLICY IF EXISTS dashboard_state_open_all      ON public.dashboard_state;
DROP POLICY IF EXISTS dashboard_state_select        ON public.dashboard_state;
DROP POLICY IF EXISTS dashboard_state_insert        ON public.dashboard_state;
DROP POLICY IF EXISTS dashboard_state_update        ON public.dashboard_state;
DROP POLICY IF EXISTS dashboard_state_delete        ON public.dashboard_state;
DROP POLICY IF EXISTS "Enable read access for all"  ON public.dashboard_state;
DROP POLICY IF EXISTS "Enable insert for all"       ON public.dashboard_state;

-- ── 5. Open policy — single-user app, anon key writes directly ─────────────
-- Permissive on purpose. When you wire Supabase Auth later, replace with
--   USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id)
CREATE POLICY dashboard_state_open_all
  ON public.dashboard_state
  AS PERMISSIVE
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ── 6. Sanity check — read back what we just created ───────────────────────
-- (Comment out if you don't want the diagnostic output.)
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dashboard_state') AS policy_count
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'dashboard_state';
