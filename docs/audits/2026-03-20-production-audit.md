# AVVIO Production Audit

Date: 2026-03-20
Workspace: `/Users/sam/Documents/GitHub/AVVIO`

## Executive Summary
AVVIO is structurally stronger than a typical Expo + Supabase app: the security boundary is mostly respected, RLS coverage is substantial, offline replay is persisted and serialized, and the repo already has meaningful integration tests around auth, notifications, activities, and privacy. The highest-risk issues are in edge flows rather than the core CRUD path: notification deep links can route before an authenticated session exists, and social challenge creation can report success even when every invite fails. The next priority tier is time correctness and boundary behavior: challenge status is snapshot-based in key screens, challenge end dates are built with DST-sensitive local calendar arithmetic, and one auth focus effect has a stale-closure risk. Dependency hygiene is otherwise decent, but `@supabase/supabase-js` is materially behind the current registry release.

## Critical Findings (P0)
No P0 findings found.

## High Priority (P1)
1. Severity: P1
   Location: `app/_layout.tsx:191`, `src/hooks/useNotificationHandler.ts:139`, `src/hooks/useNotificationHandler.ts:146`
   Description: notification tap handling is gated only on `!isLoading`, not on an authenticated session. On a cold start from a push notification, buffered intents are flushed as soon as auth hydration finishes even when `session` is `null`.
   Risk: protected deep links can fire before auth is restored, causing redirect churn or dropped notification intent for invite and challenge routes.
   Fix:
   ```ts
   // app/_layout.tsx
   useNotificationHandler(!isLoading && !!session?.user?.id);
   ```
   Or make the hook accept both `isHydrated` and `session` and only flush pending responses once both are ready.

2. Severity: P1
   Location: `src/components/create-challenge/CreateChallengeOrchestrator.tsx:255`
   Description: social challenge creation treats invites as best-effort with `Promise.allSettled(...)` and always advances to the success screen, even if every invite rejects.
   Risk: the core social flow can silently degrade into "solo challenge plus zero invites", while the creator is told the operation succeeded.
   Fix:
   ```ts
   const inviteResults = await Promise.allSettled(
     selectedFriendIds.map((friendId) =>
       inviteUser.mutateAsync({ challenge_id: result.id, user_id: friendId }),
     ),
   );

   const failed = inviteResults.filter((r) => r.status === "rejected");
   if (failed.length > 0) {
     Alert.alert(
       "Challenge created",
       `${failed.length} invite${failed.length === 1 ? "" : "s"} failed. Review and resend them from the challenge screen.`,
     );
   }
   ```

## Medium Priority (P2)
1. Severity: P2
   Location: `src/components/challenge-detail/ChallengeDetailScreen.tsx:127`, `src/components/challenge-detail/ChallengeDetailScreen.tsx:140`, `src/components/challenge-detail/ChallengeDetailScreen.tsx:186`
   Description: challenge detail derives `serverNow` once per render and never ticks. `effectiveStatus`, `daysLeft`, and `canLog` stay frozen until some unrelated rerender occurs.
   Risk: around start/end boundaries the UI can continue showing an active state and enabled log CTA after the challenge has ended. The server still rejects the write, but the user sees stale state.
   Fix: move time derivation behind a ticking hook keyed to the cached server offset, for example a 30s or 60s interval that updates `serverNow`.

2. Severity: P2
   Location: `src/hooks/useHomeScreenData.ts:71`, `src/hooks/useHomeScreenData.ts:81`
   Description: the home feed also snapshots `getServerNow()` only when the challenge query or auth context changes. Challenge cards can remain in the wrong "starting soon" or "in progress" bucket while the app stays open across a time boundary.
   Risk: stale home-screen categorization and inconsistent status between screens until focus/refetch.
   Fix: reuse the same ticking server-time hook used for challenge detail, and include that value in `splitChallengesByStatus`.

3. Severity: P2
   Location: `src/components/create-challenge/CreateChallengeOrchestrator.tsx:222`
   Description: challenge duration is built with `endDate.setDate(endDate.getDate() + durationDays)`, which uses local calendar arithmetic.
   Risk: scheduled challenges that cross a daylight-saving boundary can end an hour early or late relative to the UTC timestamps enforced by Supabase RPC validation and half-open challenge windows.
   Fix:
   ```ts
   const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
   ```

4. Severity: P2
   Location: `app/(auth)/auth.tsx:281`, `app/(auth)/auth.tsx:303`, `app/(auth)/auth.tsx:307`
   Description: the biometric auto-trigger `useFocusEffect` depends only on `form.mode` even though it invokes `handleAutoBiometricSignIn`, which closes over mutable auth/loading state.
   Risk: resume/focus can execute a stale sign-in callback and duplicate the biometric flow while lock or loading state has already changed.
   Fix: wrap `handleAutoBiometricSignIn` in `useCallback` with full dependencies and include it in the focus effect dependency list.

5. Severity: P2
   Location: `package.json:34`
   Description: `@supabase/supabase-js` is pinned to `^2.49.1`. On 2026-03-20, `npm view @supabase/supabase-js version` returned `2.99.3`.
   Risk: missing a large backlog of auth, storage, realtime, and React Native fixes in the most security-sensitive client dependency in the app.
   Fix: schedule a controlled upgrade to the current 2.x line and rerun auth, offline queue, and realtime regression tests.

## Low / Advisory (P3 + Info)
1. Severity: P3
   Location: `src/components/challenge-detail/ChallengeDetailScreen.tsx:81`, `src/components/challenge-detail/ChallengeDetailScreen.tsx:82`
   Description: leaderboard and recent-activity queries are read without corresponding section-level `isError` handling.
   Risk: partial fetch failures degrade into empty UI, which looks like "no data" rather than "failed to load".
   Fix: surface per-section retry/error states for leaderboard and activity blocks.

2. Severity: P3
   Location: `src/hooks/useActivities.ts:113`, `src/hooks/useActivities.ts:118`, `app/activity/[id].tsx:48`, `app/activity/[id].tsx:58`
   Description: date/time rendering uses `toLocaleDateString(undefined, ...)` and `toLocaleTimeString(undefined, ...)` with implicit locale selection.
   Risk: inconsistent formatting between devices and harder-to-reproduce timezone/locale regressions.
   Fix: use an explicit locale or centralized formatter helper.

3. Severity: Info
   Location: `src/lib/supabase.ts`, `src/services/*`, `supabase/migrations/*`
   Description: the major architectural contracts are mostly intact. App screens do not talk to Supabase directly, notification writes stay server-side, offline queue replay is persisted and serial, and RLS/privacy tests are stronger than average.
   Risk: none immediate.
   Fix: preserve these boundaries while addressing the edge-case issues above.

4. Severity: Info
   Location: repo-wide verification
   Description: `npm audit --omit=dev --json` returned zero prod vulnerabilities, `.env` files are gitignored, and only `.env.example` is tracked.
   Risk: none immediate.
   Fix: none.

## Architecture Health Score
### Core
- Security & RLS: 4/5
- Data Integrity: 4/5
- React Query: 3/5
- Layering: 4/5
- Type Safety: 4/5
- Error Handling: 3/5
- Performance: 4/5
- Migrations: 4/5
Core Score: 30/40

### Production Readiness
- Secrets & Env Hygiene: 5/5
- Concurrency & Race Cond.: 3/5
- Push Notif. & Deep Links: 3/5
- Offline / Sync Correctness: 4/5
- Logging & Observability: 4/5
- Memory Leaks: 4/5
- Date / Time Correctness: 3/5
- Rate Limiting & Abuse: 3/5
- App Store Readiness: 4/5
- Dependency & Supply Chain: 4/5
- Testing Coverage: 4/5
- Accessibility: 3/5
Production Score: 44/60

Overall Score: 74/100

## Verification Notes
- `npm run lint` completed with 0 errors and 242 warnings.
- `npm audit --omit=dev --json` reported 0 prod vulnerabilities.
- `git ls-files .env .env.local .env.test .env.e2e .env.example` showed only `.env.example` tracked.
