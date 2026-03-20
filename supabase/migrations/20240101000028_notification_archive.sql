-- Migration: 028_notification_archive.sql
-- Description: Adds archive/restore capability for notifications
--
-- Adds dismissed_at column and RPCs for archiving and restoring notifications.
-- Archive marks a notification as both read and dismissed; restore clears dismissed_at
-- but preserves read_at.
--
-- Service contract (src/services/notifications.ts):
--   archiveNotification(id) → sets read_at + dismissed_at
--   restoreNotification(id) → clears dismissed_at only
--   getUnreadCount() → filters on read_at IS NULL AND dismissed_at IS NULL
--   getNotifications() → returns all (UI filters by dismissed_at)

-- =============================================================================
-- ADD dismissed_at COLUMN
-- =============================================================================
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

-- =============================================================================
-- ARCHIVE NOTIFICATION
-- =============================================================================
-- Marks a notification as read (if not already) and dismissed.
-- Only the owning user can archive their own notifications (auth.uid() check).
CREATE OR REPLACE FUNCTION public.archive_notification(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
  SET
    read_at = COALESCE(read_at, now()),
    dismissed_at = now()
  WHERE id = p_notification_id
    AND user_id = auth.uid()
    AND dismissed_at IS NULL;
END;
$$;

-- =============================================================================
-- RESTORE NOTIFICATION
-- =============================================================================
-- Clears dismissed_at to restore a notification back to active.
-- Preserves read_at — restoring does not mark as unread.
CREATE OR REPLACE FUNCTION public.restore_notification(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
  SET dismissed_at = NULL
  WHERE id = p_notification_id
    AND user_id = auth.uid()
    AND dismissed_at IS NOT NULL;
END;
$$;
