# Baseline Recovery Implementation Plan

This document is the execution plan for restoring a trustworthy local baseline after the March 2026 audit/review.

It is written to be implementation-oriented:

- fix the repo in a sequence that restores signal quickly
- avoid mixing baseline repair with unrelated improvements
- keep architecture cleanup scoped to issues already confirmed in code

## Objective

Restore a green and trustworthy local baseline:

1. `npx tsc --noEmit` passes
2. `npm test` passes for the current unit project
3. critical architectural drift is reduced where it already causes behavioral divergence
4. core documentation no longer points to missing files, commands, or unsupported features

## Confirmed Problems

These are already verified in the current repository state.

### Static verification failures

- `npx tsc --noEmit` fails
- `src/components/notifications/NotificationsScreen.tsx` uses the old `showToast(message, "error")` call style
- `src/components/shared/LoadingScreen.tsx` imports a non-existent `useTheme`
- `src/lib/__tests__/sentry.test.ts` has stale typing around `__DEV__`
- `src/__tests__/integration/challenges.integration.test.ts` passes `null` for optional RPC params typed as `undefined | T`

### Unit test failures

- Jest config is not robust for Expo/React Native module imports
- some suites fail before assertions due to test harness/module parsing
- `src/__tests__/unit/health/healthService.test.ts` has a broken hoisted mock
- `src/services/challenges.ts` rejects RPC rows when `is_solo` is absent

### Architectural drift

- offline replay in `src/stores/offlineStore.ts` bypasses service-layer behavior for invite acceptance and friend requests
- onboarding completion writes auth metadata directly from `app/(auth)/onboarding.tsx`
- stale theme color `#00D26A` remains in runtime code and docs after the emerald migration

### Documentation drift

- `docs/TESTING.md` documents a component-test tier that does not exist
- `README.md` references `docs/testing.md` instead of `docs/TESTING.md`
- `.env.test.example` is referenced but does not exist
- `docs/api/hooks.md` and `docs/api/services.md` describe files/methods that do not exist
- health docs contradict runtime reality about Android/Google Fit support

## Delivery Rules

These rules matter as much as the task list.

1. Do not expand scope during the baseline pass.
2. Do not add new architectural features just because nearby code is messy.
3. Prefer the smallest change that restores correctness and verification.
4. Keep behavior changes explicit and testable.
5. Separate "baseline recovery" from "nice-to-have hardening".

## Non-Goals For Phase 1

Do not include these in the first pass unless they are required to get green:

- adding a new global app error boundary
- broad UI redesign
- large theme-system redesign
- sweeping unused-import cleanup across every file
- speculative refactors not tied to a current failure

These can be tackled later if still desired.

## Phase Structure

Implementation is split into three phases. Phase 1 must finish cleanly before Phase 2 begins.

---

## Phase 1: Restore Local Verification

### Goal

Get TypeScript and unit tests back to a trustworthy green baseline.

### 1. Fix `showToast` call sites

#### Files

- `src/components/notifications/NotificationsScreen.tsx`

#### Problem

`showToast` now accepts `ToastOptions`, but the screen still passes a raw variant string.

#### Required change

Replace all current forms like:

```ts
showToast("Failed to load notifications", "error");
```

with:

```ts
showToast("Failed to load notifications", { variant: "error" });
```

#### Acceptance criteria

- all `showToast(..., "error")` usage in this file is removed
- `tsc` no longer reports `ToastOptions` errors from this file

---

### 2. Fix `LoadingScreen` import

#### Files

- `src/components/shared/LoadingScreen.tsx`

#### Problem

Imports `useTheme` from `@/constants/theme`, but that hook does not exist.

#### Required change

- import `useAppTheme` from `@/providers/ThemeProvider`
- replace the local usage accordingly

#### Acceptance criteria

- file compiles
- no theme-hook import error remains

---

### 3. Fix stale `__DEV__` typing in Sentry test

#### Files

- `src/lib/__tests__/sentry.test.ts`

#### Problem

The current test uses a stale `@ts-expect-error` and writes `globalThis.__DEV__` without a valid type path.

#### Required change

Use a simple, explicit test-safe pattern. Example:

```ts
(global as typeof global & { __DEV__?: boolean }).__DEV__ = true;
```

Also remove the stale `@ts-expect-error`.

#### Acceptance criteria

- file compiles under `tsc`
- no unused `@ts-expect-error` remains

---

### 4. Fix integration test RPC argument typing

#### Files

- `src/__tests__/integration/challenges.integration.test.ts`

#### Problem

The failing TypeScript errors here are caused by `null` being passed to optional RPC arguments that are typed as `undefined | T`.

This is not the same issue as the `is_solo` schema default.

#### Required change

For optional RPC args:

- omit the key entirely when not needed, or
- pass `undefined`, not `null`

Specifically inspect:

- `p_custom_activity_name`
- `p_daily_target`

#### Acceptance criteria

- file no longer contributes TS2322 errors

---

### 5. Make challenge RPC parsing resilient to absent `is_solo`

#### Files

- `src/services/challenges.ts`

#### Problem

`get_my_challenges` parsing currently requires `is_solo`, which breaks current unit fixtures and older environments.

#### Required change

Change:

```ts
is_solo: z.boolean()
```

to:

```ts
is_solo: z.boolean().default(false)
```

#### Acceptance criteria

- current unit failures related to missing `is_solo` are resolved
- existing behavior remains `false` when field is absent

---

### 6. Repair Jest configuration for current RN/Expo unit surface

#### Files

- `jest.config.js`
- add `jest.setup.js` or `jest.setup.ts` if needed

#### Problem

Current Jest setup is too bare for the actual module graph in this repo. Some tests fail before running because Expo/RN-related imports are not handled consistently.

#### Important note

Do not claim this is fixed merely by moving one hook out of `serverTime.ts`. The failures involve the broader module/import boundary, including `supabase.ts` and Expo/RN imports.

#### Required change

Adjust Jest only enough to execute the current unit surface reliably. Likely needs:

- a setup file for globals and stable cleanup
- explicit mocks for RN/Expo modules used by tests
- transform/setup changes so currently imported modules stop failing at parse time

Keep this minimal. Do not redesign the entire test stack unless necessary.

#### Acceptance criteria

- `npm test` runs the current unit project without parse-time module failures

---

### 7. Fix health service unit test mock shape and hoisting bug

#### Files

- `src/__tests__/unit/health/healthService.test.ts`

#### Problem

The mock is both hoisting incorrectly and mocking the wrong exported API shape from `@/lib/supabase`.

`healthService.ts` imports:

- `getSupabaseClient`
- `getUserId`

It also uses chained RPC forms including `.single()` and `.maybeSingle()`.

#### Required change

- replace the current hoisted factory pattern with a safe mock arrangement
- mock the actual exports used by production code
- ensure RPC mocks support:
  - plain awaitable RPC responses
  - `.single()`
  - `.maybeSingle()`

#### Acceptance criteria

- the health service unit suite executes
- it fails only on real assertions, not mock setup

---

### 8. Fix the dead `getStoredEmail()` try/catch

#### Files

- `src/lib/biometricSignIn.ts`

#### Problem

The current function returns `null` inside `try`, making `catch` unreachable.

#### Required change

Simplify the function to a direct return:

```ts
export async function getStoredEmail(): Promise<string | null> {
  return null;
}
```

#### Acceptance criteria

- unreachable-code lint warning for this block is gone

---

### 9. Minimal lint cleanup only where needed for touched files

#### Files

- touched files from Phase 1

#### Rule

Do not run a repo-wide warning cleanup in the baseline pass unless specifically requested.

Only remove obvious unused imports/vars in files already being edited so the changed surface stays clean.

#### Acceptance criteria

- no new lint issues introduced in touched files
- baseline verification remains focused

---

## Phase 2: Fix Confirmed Architectural Drift

### Goal

Resolve behavior divergence already confirmed by the review, without broad redesign.

### 10. Refactor offline replay to delegate where behavior currently diverges

#### Files

- `src/stores/offlineStore.ts`

#### Problem

The queue currently reimplements mutations directly and bypasses service-layer behavior.

The highest-value drift points are:

- `ACCEPT_INVITE`
- `SEND_FRIEND_REQUEST`

#### Required change

Delegate these cases to:

- `challengeService.respondToInvite(...)`
- `friendsService.sendRequest(...)`

Keep current direct RPC behavior for `LOG_ACTIVITY` if it already matches service semantics closely.

For `LOG_WORKOUT`, only change if necessary to align recorded-time behavior cleanly and safely.

#### Important behavior rule

Offline replay still needs idempotent handling. If service-layer behavior surfaces "already done" conditions that should count as success during replay, treat those cases as success and remove the queue item.

#### Acceptance criteria

- offline invite acceptance uses the same RPC path as online acceptance
- offline friend request replay uses the same validation/error mapping path as online requests
- queue replay does not regress idempotent success handling

---

### 11. Move onboarding-completion auth write into service layer

#### Files

- `app/(auth)/onboarding.tsx`
- `src/services/auth.ts`

#### Problem

The onboarding screen writes auth metadata directly, violating the intended layering and duplicating ownership.

#### Required change

Add a service method:

```ts
markOnboardingComplete(): Promise<void>
```

Then use it from the onboarding screen.

#### Acceptance criteria

- onboarding screen no longer calls `supabase.auth.updateUser(...)` directly for completion
- behavior remains unchanged

---

### 12. Reset singleton health service on sign-out

#### Files

- `src/providers/AuthProvider.tsx`

#### Problem

`resetHealthService()` exists but is not called on sign-out, leaving singleton state alive across accounts.

#### Required change

Call `resetHealthService()` in the sign-out cleanup path.

The best place is the `SIGNED_OUT` handling flow, not an unrelated UI callback.

#### Acceptance criteria

- health singleton is reset on sign-out
- no cross-account health service state survives logout

---

## Phase 3: Align Runtime Colors and Documentation

### Goal

Remove known stale runtime theme references and prune docs that actively misdescribe the repo.

### 13. Replace stale runtime `#00D26A` usage

#### Files

- `src/components/challenge-detail/CompletedBanner.tsx`
- `src/components/ProfileErrorBoundary.tsx`
- `src/lib/notifications.ts`

#### Required change

Use the current emerald theme consistently.

Notes:

- `CompletedBanner` already has `useAppTheme()`, so use theme values directly.
- `ProfileErrorBoundary` is a function component, so it can also use `useAppTheme()` directly.
- `src/lib/notifications.ts` is non-React code, so use a stable constant from `src/constants/theme.ts`.

#### Acceptance criteria

- no runtime `#00D26A` remains in those files unless intentionally preserved and documented

---

### 14. Prune fake testing/docs surface

#### Files

- `docs/TESTING.md`
- `README.md`

#### Required change

- remove the phantom component-test section from `docs/TESTING.md`
- replace it with a short note that component tests are planned, not implemented
- fix `README.md` link from `docs/testing.md` to `docs/TESTING.md`
- correct or remove `.env.test.example` instructions unless that file is actually added

#### Acceptance criteria

- docs no longer reference missing test tiers, scripts, or setup files as if they already exist

---

### 15. Audit stale API docs against the actual codebase

#### Files

- `docs/api/hooks.md`
- `docs/api/services.md`

#### Required change

Remove or rewrite entries for missing files and methods, including examples like:

- `src/hooks/useBiometricAuth.ts`
- `src/hooks/useProfile.ts`
- `src/lib/featureFlags.ts`
- `src/hooks/v2/useHomeScreenData.ts`
- `src/hooks/v2/useChallengeFilters.ts`
- `src/lib/queryClient.ts`
- service methods that do not exist in current code

Only document files and methods that actually exist now.

#### Acceptance criteria

- every referenced hook/service path exists
- every documented method exists with roughly matching behavior/signature

---

### 16. Fix health-support documentation contradiction

#### Files

- `docs/architecture/health-integration.md`
- `docs/guides/healthkit-setup.md`
- related README copy if needed

#### Required change

Align docs to current runtime reality:

- HealthKit support exists on iOS
- Android/Google Fit is not implemented as a real provider yet

#### Acceptance criteria

- docs do not claim supported Android health integration that the code does not provide

---

## Explicitly Deferred Items

These are reasonable follow-up tasks, but they should not block baseline recovery unless requested separately.

- global app-level error boundary
- broad `ThemeProvider` type/interface expansion
- repo-wide lint warning elimination
- larger `serverTime` architecture split beyond what is required for testability

## Recommended Commit Sequence

Use small commits that keep the repo understandable.

1. `fix: restore typecheck baseline`
2. `fix: repair jest/unit test harness`
3. `fix: harden challenge rpc parsing`
4. `refactor: align offline replay with service contracts`
5. `refactor: move onboarding completion into auth service`
6. `fix: reset health singleton on logout`
7. `fix: replace stale emerald migration leftovers`
8. `docs: prune stale testing and api references`

## Verification Checklist

Run after each phase, not only at the end.

### After Phase 1

- `npx tsc --noEmit`
- `npm test`
- `npm run lint`

Expected result:

- TypeScript passes
- unit tests pass
- touched files do not introduce new lint errors

### After Phase 2

Re-run:

- `npx tsc --noEmit`
- `npm test`
- targeted behavioral verification for offline replay

Suggested targeted checks:

- offline accept-invite replay marks the invite accepted through the same path as online flow
- offline friend-request replay uses service validation behavior
- sign-out resets health service singleton state

### After Phase 3

Re-run:

- `npx tsc --noEmit`
- `npm test`
- `npm run lint`

Manual doc sanity check:

- every referenced file exists
- every referenced script exists
- platform support claims match current code

## Implementation Notes For Claude

When executing this plan:

1. Finish Phase 1 before taking architectural follow-up work.
2. Do not fold unrelated cleanup into commits that are supposed to restore verification.
3. If Jest still fails after minimal config fixes, document the exact remaining blocker before expanding scope.
4. Prefer editing tests to match actual typed APIs rather than weakening production types unless runtime compatibility requires the change.
5. Keep docs honest, even if that means documenting less.
