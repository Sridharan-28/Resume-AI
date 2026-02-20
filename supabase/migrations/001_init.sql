-- ============================================
-- ResumeAI — Supabase Database Migration
-- ============================================
-- Users are managed by Supabase Auth (Google OAuth)
-- This migration creates tables for usage tracking and subscriptions

-- Usage logs — tracks each analysis a user performs
CREATE TABLE IF NOT EXISTS public.usage_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  score_before int,
  score_after int
);

-- Subscriptions — tracks Pro subscription status
CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  is_active boolean DEFAULT false,
  plan_name text DEFAULT 'free',
  amount_inr int DEFAULT 0,
  started_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_usage_user_id ON public.usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_created_at ON public.usage_logs(created_at);

-- Enable Row Level Security
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies — users can only see/modify their own data
CREATE POLICY "Users can view their own usage logs"
  ON public.usage_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own usage logs"
  ON public.usage_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own subscription"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Function to count user analyses
CREATE OR REPLACE FUNCTION public.get_user_analysis_count(target_user_id uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::int FROM public.usage_logs WHERE user_id = target_user_id;
$$;

-- Function to check if user has active subscription
CREATE OR REPLACE FUNCTION public.has_active_subscription(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = target_user_id
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;
