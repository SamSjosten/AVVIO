-- Migration 045: Profile update and friend action RPCs
-- Closes RPC contract gap: these operations were previously direct table writes
-- from the service layer, bypassing the Screen → Hook → Service → Zod → RPC → RLS contract.

-- =============================================================================
-- update_profile
-- =============================================================================
-- Updates the caller's own profile row.
-- NULL params mean "leave unchanged" (via COALESCE).
-- Blank p_avatar_url (after trim) clears the avatar to NULL.
-- Raises 'profile_not_found' if no row is updated.

CREATE OR REPLACE FUNCTION public.update_profile(
  p_username text DEFAULT NULL,
  p_display_name text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile public.profiles;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  UPDATE public.profiles
  SET
    username = COALESCE(p_username, username),
    display_name = COALESCE(p_display_name, display_name),
    avatar_url = CASE
      WHEN p_avatar_url IS NULL THEN avatar_url          -- leave unchanged
      WHEN btrim(p_avatar_url) = '' THEN NULL             -- clear avatar
      ELSE p_avatar_url                                    -- set new value
    END,
    updated_at = now()
  WHERE id = v_user_id
  RETURNING * INTO v_profile;

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  RETURN v_profile;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_profile(text, text, text) TO authenticated;

-- =============================================================================
-- mark_health_setup_complete
-- =============================================================================
-- Sets health_setup_completed_at = now() on the caller's profile.
-- Raises 'profile_not_found' if no row is updated.

CREATE OR REPLACE FUNCTION public.mark_health_setup_complete()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_updated boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  UPDATE public.profiles
  SET health_setup_completed_at = now()
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_health_setup_complete() TO authenticated;

-- =============================================================================
-- accept_friend_request
-- =============================================================================
-- Accepts a pending friend request. Only the recipient (requested_to) can accept.
-- Raises 'friend_request_not_found' if no matching pending row exists.
-- Does not touch notifications directly — existing triggers handle cleanup.

CREATE OR REPLACE FUNCTION public.accept_friend_request(
  p_friendship_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  UPDATE public.friends
  SET
    status = 'accepted',
    updated_at = now()
  WHERE id = p_friendship_id
    AND requested_to = v_user_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'friend_request_not_found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_friend_request(uuid) TO authenticated;

-- =============================================================================
-- decline_friend_request
-- =============================================================================
-- Declines (deletes) a pending friend request. Only the recipient can decline.
-- Raises 'friend_request_not_found' if no matching pending row exists.
-- Relies on delete trigger for notification cleanup.

CREATE OR REPLACE FUNCTION public.decline_friend_request(
  p_friendship_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  DELETE FROM public.friends
  WHERE id = p_friendship_id
    AND requested_to = v_user_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'friend_request_not_found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decline_friend_request(uuid) TO authenticated;

-- =============================================================================
-- remove_friend
-- =============================================================================
-- Removes an accepted friendship. Either party can remove.
-- Raises 'friendship_not_found' if no matching accepted row exists.

CREATE OR REPLACE FUNCTION public.remove_friend(
  p_friendship_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  DELETE FROM public.friends
  WHERE id = p_friendship_id
    AND status = 'accepted'
    AND (requested_by = v_user_id OR requested_to = v_user_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'friendship_not_found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_friend(uuid) TO authenticated;
