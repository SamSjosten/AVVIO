-- Migration 040: cancel_challenge RPC
-- Replaces raw .update({ status: 'cancelled' }) with server-side validation.
-- Validates: caller is creator, challenge is not already completed/cancelled.

CREATE OR REPLACE FUNCTION public.cancel_challenge(p_challenge_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_creator_id uuid;
  v_status text;
BEGIN
  -- Lock the row to prevent concurrent state changes
  SELECT creator_id, status INTO v_creator_id, v_status
  FROM public.challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION 'Challenge not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_creator_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the challenge creator can cancel' USING ERRCODE = 'P0001';
  END IF;

  IF v_status IN ('completed', 'cancelled', 'archived') THEN
    RAISE EXCEPTION 'Challenge cannot be cancelled (current status: %)', v_status
      USING ERRCODE = 'P0003';
  END IF;

  UPDATE public.challenges
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_challenge_id;
END;
$$;
