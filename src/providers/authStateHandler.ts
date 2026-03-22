// src/providers/authStateHandler.ts
// Extracted auth state change handler — testable without React/JSX
//
// This module contains the onAuthStateChange callback logic extracted from
// AuthProvider.tsx for testability. The unit test environment (testEnvironment: "node")
// cannot render .tsx components, so extracting the callback into a pure .ts module
// allows direct testing of breadcrumb wiring and state transitions.

import type { Session } from "@supabase/supabase-js";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Dependencies injected by AuthProvider into the auth state handler.
 * Each field maps to a closure variable in the original useEffect callback.
 */
export interface AuthStateHandlerDeps {
  /** Tracks whether the React component is still mounted */
  mountedRef: { current: boolean };
  /** Loads user profile and sets auth state after session restore */
  loadProfileAndSetState: (session: Session) => Promise<void>;
  /** React state setter (accepts full state or updater function) */
  setState: (updater: any) => void;
  /** TanStack Query client — .clear() called on sign-out */
  queryClient: { clear: () => void };
  /** Sentry breadcrumb emitter */
  addBreadcrumb: (message: string, data?: Record<string, unknown>) => void;
  /** Resets health service state on sign-out */
  resetHealthService: () => void;
}

// =============================================================================
// HANDLER FACTORY
// =============================================================================

/**
 * Creates the onAuthStateChange callback with injected dependencies.
 *
 * The returned handler manages:
 * - INITIAL_SESSION: bootstrap (profile load or no-session)
 * - SIGNED_OUT: full state clear
 * - TOKEN_REFRESHED: session update (gated by bootstrap)
 * - USER_UPDATED: user metadata update (gated by bootstrap)
 * - All other events: ignored (calling methods own those flows)
 */
export function createAuthStateHandler(deps: AuthStateHandlerDeps) {
  let bootstrapComplete = false;

  return async (event: string, session: Session | null): Promise<void> => {
    console.log(
      `[AuthProvider] 📡 onAuthStateChange: event=${event}, session=${session ? "YES" : "NO"}, bootstrap=${bootstrapComplete}`,
    );

    if (!deps.mountedRef.current) return;

    // =================================================================
    // INITIAL_SESSION: App launch/restore — the ONLY bootstrap path
    // =================================================================
    if (event === "INITIAL_SESSION") {
      bootstrapComplete = true;

      if (session?.user) {
        console.log(
          `[AuthProvider] 🎬 Bootstrap: loading profile for ${session.user.id.substring(0, 8)}`,
        );
        deps.addBreadcrumb("auth_session_restored");
        await deps.loadProfileAndSetState(session);
      } else {
        console.log(`[AuthProvider] 🎬 Bootstrap: no session`);
        deps.addBreadcrumb("auth_no_session");
        deps.setState((prev: any) => ({ ...prev, loading: false }));
      }
      return;
    }

    // =================================================================
    // SIGNED_OUT: Always process — clear all state
    // =================================================================
    if (event === "SIGNED_OUT" || !session) {
      console.log(`[AuthProvider] 🚪 Signed out (event=${event})`);
      deps.addBreadcrumb("auth_signed_out");
      bootstrapComplete = true;
      deps.resetHealthService();
      // Clear in-memory query cache on sign-out to prevent stale data
      deps.queryClient.clear();
      deps.setState({
        session: null,
        user: null,
        profile: null,
        loading: false,
        profileError: null,
        isRefreshingProfile: false,
        error: null,
        pendingEmailConfirmation: false,
      });
      return;
    }

    // =================================================================
    // TOKEN_REFRESHED: Update session silently (no profile reload)
    // =================================================================
    if (event === "TOKEN_REFRESHED") {
      if (!bootstrapComplete) {
        console.log(`[AuthProvider] ⏭️ Skipping TOKEN_REFRESHED before bootstrap`);
        return;
      }
      console.log(`[AuthProvider] 🔄 Token refreshed — updating session`);
      deps.addBreadcrumb("auth_token_refreshed");
      deps.setState((prev: any) => ({
        ...prev,
        session,
        user: session.user,
      }));
      return;
    }

    // =================================================================
    // USER_UPDATED: Update session/user when metadata changes.
    // =================================================================
    if (event === "USER_UPDATED") {
      if (!bootstrapComplete) {
        console.log(`[AuthProvider] ⏭️ Skipping USER_UPDATED before bootstrap`);
        return;
      }
      console.log(`[AuthProvider] 📝 User updated — updating session`);
      deps.addBreadcrumb("auth_user_updated");
      deps.setState((prev: any) => ({
        ...prev,
        session,
        user: session!.user,
      }));
      return;
    }

    // =================================================================
    // ALL OTHER EVENTS: Ignored.
    // =================================================================
    console.log(`[AuthProvider] ⏭️ Ignoring ${event} — caller owns this flow`);
  };
}
