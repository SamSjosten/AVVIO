// src/__tests__/unit/AuthProvider.breadcrumbs.test.ts
// Tests that the auth state handler emits correct Sentry breadcrumbs.
//
// Strategy: Import createAuthStateHandler (pure .ts, no JSX/RN deps),
// inject mock dependencies, call the handler with each auth event,
// and assert addBreadcrumb is called with the correct message.

import {
  createAuthStateHandler,
  type AuthStateHandlerDeps,
} from "@/providers/authStateHandler";
import type { Session } from "@supabase/supabase-js";

// =============================================================================
// HELPERS
// =============================================================================

function createMockDeps(): AuthStateHandlerDeps {
  return {
    mountedRef: { current: true },
    loadProfileAndSetState: jest.fn().mockResolvedValue(undefined),
    setState: jest.fn(),
    queryClient: { clear: jest.fn() },
    addBreadcrumb: jest.fn(),
    resetHealthService: jest.fn(),
  };
}

const mockSession = {
  user: { id: "u1", email: "test@test.com" },
} as unknown as Session;

// =============================================================================
// TESTS
// =============================================================================

describe("Auth state handler breadcrumbs", () => {
  let deps: AuthStateHandlerDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  it("emits auth_session_restored on INITIAL_SESSION with session", async () => {
    const handler = createAuthStateHandler(deps);
    await handler("INITIAL_SESSION", mockSession);

    expect(deps.addBreadcrumb).toHaveBeenCalledWith("auth_session_restored");
    expect(deps.loadProfileAndSetState).toHaveBeenCalledWith(mockSession);
  });

  it("emits auth_no_session on INITIAL_SESSION without session", async () => {
    const handler = createAuthStateHandler(deps);
    await handler("INITIAL_SESSION", null);

    expect(deps.addBreadcrumb).toHaveBeenCalledWith("auth_no_session");
    expect(deps.setState).toHaveBeenCalled();
  });

  it("emits auth_signed_out on SIGNED_OUT", async () => {
    const handler = createAuthStateHandler(deps);
    // Bootstrap first
    await handler("INITIAL_SESSION", mockSession);
    (deps.addBreadcrumb as jest.Mock).mockClear();

    await handler("SIGNED_OUT", null);

    expect(deps.addBreadcrumb).toHaveBeenCalledWith("auth_signed_out");
    expect(deps.resetHealthService).toHaveBeenCalled();
    expect(deps.queryClient.clear).toHaveBeenCalled();
  });

  it("emits auth_token_refreshed on TOKEN_REFRESHED after bootstrap", async () => {
    const handler = createAuthStateHandler(deps);
    // Bootstrap first — TOKEN_REFRESHED is gated by bootstrapComplete
    await handler("INITIAL_SESSION", mockSession);
    (deps.addBreadcrumb as jest.Mock).mockClear();

    await handler("TOKEN_REFRESHED", mockSession);

    expect(deps.addBreadcrumb).toHaveBeenCalledWith("auth_token_refreshed");
  });

  it("emits auth_user_updated on USER_UPDATED after bootstrap", async () => {
    const handler = createAuthStateHandler(deps);
    // Bootstrap first — USER_UPDATED is gated by bootstrapComplete
    await handler("INITIAL_SESSION", mockSession);
    (deps.addBreadcrumb as jest.Mock).mockClear();

    await handler("USER_UPDATED", mockSession);

    expect(deps.addBreadcrumb).toHaveBeenCalledWith("auth_user_updated");
  });

  it("skips TOKEN_REFRESHED before bootstrap completes", async () => {
    const handler = createAuthStateHandler(deps);
    // Do NOT trigger INITIAL_SESSION — bootstrapComplete stays false

    await handler("TOKEN_REFRESHED", mockSession);

    expect(deps.addBreadcrumb).not.toHaveBeenCalled();
  });

  it("skips USER_UPDATED before bootstrap completes", async () => {
    const handler = createAuthStateHandler(deps);

    await handler("USER_UPDATED", mockSession);

    expect(deps.addBreadcrumb).not.toHaveBeenCalled();
  });

  it("does not emit breadcrumb for unknown events", async () => {
    const handler = createAuthStateHandler(deps);
    await handler("INITIAL_SESSION", mockSession);
    (deps.addBreadcrumb as jest.Mock).mockClear();

    await handler("SIGNED_IN", mockSession);

    expect(deps.addBreadcrumb).not.toHaveBeenCalled();
  });

  it("no-ops when mountedRef.current is false", async () => {
    deps.mountedRef.current = false;
    const handler = createAuthStateHandler(deps);

    await handler("INITIAL_SESSION", mockSession);

    expect(deps.addBreadcrumb).not.toHaveBeenCalled();
    expect(deps.loadProfileAndSetState).not.toHaveBeenCalled();
  });
});
