-- Migration 043: Atomic invite & friend-request RPCs + leaderboard limit
--
-- 1a. invite_to_challenge — atomic rewrite (SECURITY DEFINER, notification inside txn)
-- 1b. send_friend_request — new atomic RPC
-- 1c. get_leaderboard — add optional p_limit parameter

-- =============================================================================
-- 1a. invite_to_challenge — atomic rewrite
-- =============================================================================
CREATE OR REPLACE FUNCTION public.invite_to_challenge(
  p_challenge_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_creator_id uuid;
  v_challenge_title text;
  v_max_participants integer;
  v_current_count integer;
BEGIN
  -- Auth gate
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  -- Lock challenge row, validate existence + creator
  SELECT c.creator_id, c.title, c.max_participants
  INTO v_creator_id, v_challenge_title, v_max_participants
  FROM public.challenges c
  WHERE c.id = p_challenge_id
  FOR UPDATE;

  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION 'challenge_not_found';
  END IF;

  IF v_caller_id != v_creator_id THEN
    RAISE EXCEPTION 'not_creator';
  END IF;

  -- Enforce max_participants under lock
  IF v_max_participants IS NOT NULL THEN
    SELECT COUNT(*) INTO v_current_count
    FROM public.challenge_participants
    WHERE challenge_id = p_challenge_id
      AND invite_status IN ('pending', 'accepted');

    IF v_current_count >= v_max_participants THEN
      RAISE EXCEPTION 'challenge_full';
    END IF;
  END IF;

  -- Insert participant (catch duplicate)
  BEGIN
    INSERT INTO public.challenge_participants (challenge_id, user_id, invite_status)
    VALUES (p_challenge_id, p_user_id, 'pending');
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'duplicate_invite';
  END;

  -- Delegate notification to existing helper (single source of truth for payload shape)
  PERFORM public.enqueue_challenge_invite_notification(p_challenge_id, p_user_id);
END;
$$;

-- =============================================================================
-- 1b. send_friend_request — new atomic RPC
-- =============================================================================
CREATE OR REPLACE FUNCTION public.send_friend_request(
  p_target_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
BEGIN
  -- Auth gate
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  -- Self-request check
  IF v_caller_id = p_target_user_id THEN
    RAISE EXCEPTION 'self_request';
  END IF;

  -- Insert friend row (catch duplicate)
  BEGIN
    INSERT INTO public.friends (requested_by, requested_to, status)
    VALUES (v_caller_id, p_target_user_id, 'pending');
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'already_exists';
  END;

  -- Delegate notification to existing helper
  PERFORM public.enqueue_friend_request_notification(p_target_user_id);
END;
$$;

-- =============================================================================
-- 1c. get_leaderboard — add optional p_limit
-- =============================================================================

-- Drop old single-arg signature (migration 033) since CREATE OR REPLACE
-- cannot change parameter lists
DROP FUNCTION IF EXISTS public.get_leaderboard(uuid);

CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_challenge_id uuid,
  p_limit integer DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  current_progress integer,
  current_streak integer,
  rank integer,
  today_change integer,
  username text,
  display_name text,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.challenge_participants cp
    WHERE cp.challenge_id = p_challenge_id
      AND cp.user_id = auth.uid()
      AND cp.invite_status = 'accepted'
  ) THEN
    RETURN;
  END IF;

  IF p_limit IS NULL THEN
    -- Return all rows
    RETURN QUERY
    SELECT
      cp.user_id,
      COALESCE(cp.current_progress, 0)::integer AS current_progress,
      COALESCE(cp.current_streak, 0)::integer AS current_streak,
      RANK() OVER (
        ORDER BY COALESCE(cp.current_progress, 0) DESC, cp.user_id ASC
      )::integer AS rank,
      COALESCE(today_al.today_sum, 0)::integer AS today_change,
      pp.username,
      pp.display_name,
      pp.avatar_url
    FROM public.challenge_participants cp
    INNER JOIN public.profiles_public pp ON pp.id = cp.user_id
    LEFT JOIN (
      SELECT al.user_id AS al_user_id, SUM(al.value)::integer AS today_sum
      FROM public.activity_logs al
      WHERE al.challenge_id = p_challenge_id AND al.recorded_at >= CURRENT_DATE
      GROUP BY al.user_id
    ) today_al ON today_al.al_user_id = cp.user_id
    WHERE cp.challenge_id = p_challenge_id AND cp.invite_status = 'accepted'
    ORDER BY rank ASC, cp.user_id ASC;
  ELSE
    -- Return limited rows
    RETURN QUERY
    SELECT
      cp.user_id,
      COALESCE(cp.current_progress, 0)::integer AS current_progress,
      COALESCE(cp.current_streak, 0)::integer AS current_streak,
      RANK() OVER (
        ORDER BY COALESCE(cp.current_progress, 0) DESC, cp.user_id ASC
      )::integer AS rank,
      COALESCE(today_al.today_sum, 0)::integer AS today_change,
      pp.username,
      pp.display_name,
      pp.avatar_url
    FROM public.challenge_participants cp
    INNER JOIN public.profiles_public pp ON pp.id = cp.user_id
    LEFT JOIN (
      SELECT al.user_id AS al_user_id, SUM(al.value)::integer AS today_sum
      FROM public.activity_logs al
      WHERE al.challenge_id = p_challenge_id AND al.recorded_at >= CURRENT_DATE
      GROUP BY al.user_id
    ) today_al ON today_al.al_user_id = cp.user_id
    WHERE cp.challenge_id = p_challenge_id AND cp.invite_status = 'accepted'
    ORDER BY rank ASC, cp.user_id ASC
    LIMIT p_limit;
  END IF;
END;
$$;
