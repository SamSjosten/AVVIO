-- =============================================================================
-- MIGRATION 042: INCLUDE notification_id IN PUSH PAYLOADS
-- =============================================================================
-- Updates enqueue_challenge_invite_notification and
-- enqueue_friend_request_notification to capture the notification row ID
-- via INSERT ... RETURNING and include it in the push payload data column.
-- This allows the client to mark notifications as read on tap.
-- =============================================================================

-- =============================================================================
-- CHALLENGE INVITE NOTIFICATION (with notification_id)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enqueue_challenge_invite_notification(
  p_challenge_id uuid,
  p_invited_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id uuid;
  v_creator_name text;
  v_challenge_title text;
  v_notification_id uuid;
BEGIN
  -- Fetch challenge and verify caller is creator
  SELECT c.creator_id, c.title
  INTO v_creator_id, v_challenge_title
  FROM public.challenges c
  WHERE c.id = p_challenge_id;

  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION 'challenge_not_found';
  END IF;

  IF auth.uid() != v_creator_id THEN
    RAISE EXCEPTION 'not_creator';
  END IF;

  -- Get creator display name from profiles_public (safe, public data)
  SELECT COALESCE(pp.display_name, pp.username)
  INTO v_creator_name
  FROM public.profiles_public pp
  WHERE pp.id = v_creator_id;

  -- Create notification record and capture ID
  INSERT INTO public.notifications(user_id, type, title, body, data)
  VALUES (
    p_invited_user_id,
    'challenge_invite_received',
    'New challenge invite',
    v_creator_name || ' invited you to "' || v_challenge_title || '".',
    jsonb_build_object('challenge_id', p_challenge_id)
  )
  RETURNING id INTO v_notification_id;

  -- Backfill notification_id into the data column for client-side mark-read
  UPDATE public.notifications
  SET data = data || jsonb_build_object('notification_id', v_notification_id)
  WHERE id = v_notification_id;
END;
$$;

COMMENT ON FUNCTION public.enqueue_challenge_invite_notification IS
'Server-side challenge invite notification. V2: includes notification_id in payload for client-side mark-read on tap.';


-- =============================================================================
-- FRIEND REQUEST NOTIFICATION (with notification_id)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enqueue_friend_request_notification(
  p_recipient_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_name text;
  v_notification_id uuid;
BEGIN
  -- Get requester display name from profiles_public
  SELECT COALESCE(pp.display_name, pp.username)
  INTO v_requester_name
  FROM public.profiles_public pp
  WHERE pp.id = auth.uid();

  -- Create notification record and capture ID
  INSERT INTO public.notifications(user_id, type, title, body, data)
  VALUES (
    p_recipient_user_id,
    'friend_request_received',
    'New friend request',
    v_requester_name || ' wants to be your friend.',
    jsonb_build_object('requester_id', auth.uid())
  )
  RETURNING id INTO v_notification_id;

  -- Backfill notification_id into the data column for client-side mark-read
  UPDATE public.notifications
  SET data = data || jsonb_build_object('notification_id', v_notification_id)
  WHERE id = v_notification_id;
END;
$$;

COMMENT ON FUNCTION public.enqueue_friend_request_notification IS
'Server-side friend request notification. V2: includes notification_id in payload for client-side mark-read on tap.';
