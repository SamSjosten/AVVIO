# Narrative Adventures Implementation Plan

## Purpose

This document defines the recommended implementation plan for AVVIO's `Narrative Adventures` feature.

It is intentionally narrower than the original concept. The goal is to ship a differentiated, marketable feature without introducing avoidable architectural debt.

Primary product bet:

- `Narrative Adventures` are the differentiator.
- `Badges` are a supporting retention mechanic, not the core feature.

Core marketing message:

> Turn your steps into epic journeys.

Secondary message for later phases:

> Earn proof you were there.

---

## Executive Summary

### Recommendation

Ship `Narrative Adventures` first as a persisted, server-backed feature with one polished vertical slice.

Do **not** ship Phase 1 as a client-only feature that relies on AsyncStorage to remember which adventure a challenge belongs to.

### Why

AVVIO's architecture is now mature enough that challenge identity should remain server-owned. A local-only `challengeId -> adventureTemplateId` mapping will create immediate issues:

- breaks across reinstall
- breaks across multiple devices
- breaks consistency for invited participants
- creates fallback UX on challenge detail
- forces later migration work for a concept we already know needs persistence

### Final recommendation

Build in this order:

1. Minimal schema support for persisted adventure identity
2. One adventure vertical slice end-to-end
3. Adventure-specific badge unlocks only
4. Generalized badge system later

---

## Product Positioning

### Market read

`Virtual route challenge` products already exist in the broader market. This is not a new category.

However, it is still differentiated enough against AVVIO's direct comparison set:

- Strava emphasizes challenge galleries, segments, progress bars, and leaderboards
- Nike Run Club offers challenge types and social competition, but not immersive route journeys
- Fitbit removed its old Challenges and Adventures experience in 2023

### Implication

This is not a uniqueness play at the category level.

It **is** a valid differentiation play for AVVIO if the feature feels:

- visual
- emotional
- shareable
- route-specific

If it ships as a prettier progress bar, it will not hold up.

---

## Scope Decision

### What AVVIO should ship first

Ship one route-based adventure system with:

- persisted adventure identity
- adventure creation flow
- route visualization on challenge detail
- waypoint progress
- waypoint celebration
- completion celebration
- one shareable progress card

### What AVVIO should not ship in the first release

Do not include these in the first implementation:

- AsyncStorage as the source of truth for adventure identity
- generalized badge engine
- badge rarity
- social badges
- streak badges
- lifetime milestone badges
- seasonal adventure merchandising
- stand-alone adventure catalog screen
- home feed adventure rewrites
- climb-style step conversions like Everest

These are all reasonable later, but they should not be part of the first merge train.

---

## Architectural Decisions

## 1. Adventure is not a new `challenge_type`

Keep adventure as a template layer on top of existing challenge types.

Reason:

- current services and validation are already structured around fixed `challenge_type` values
- adding a new backend challenge enum would create more cross-cutting changes than needed
- adventure is a presentation + route template concern, not a logging primitive

Practical rule:

- adventure challenges will still use an existing underlying challenge type
- v1 should use `distance` only

---

## 2. Persist adventure identity on the challenge record

Add `challenges.adventure_template_id`.

Reason:

- challenge detail rendering needs server truth
- participants must see the same adventure
- query results should carry enough data to render the correct UI

Practical rule:

- if a challenge has `adventure_template_id`, render adventure UI
- if it does not, render the standard UI

---

## 3. Keep template definitions server-backed, even if seeded statically first

The first rollout can seed one or two templates, but the application model should still assume templates are first-class data.

Reason:

- enables seasonal content later
- avoids reworking identifiers after launch
- keeps template IDs stable across clients

---

## 4. Treat badges as unlock records first, not a full collectible system

AVVIO already has an `achievements` table that stores unlocked achievement instances by `achievement_type`.

Use that existing storage in the first badge pass.

Do not attempt to launch a full metadata system with:

- rarity
- percentages
- complex criteria engine
- badge economy

Instead:

- keep badge definitions client-side for the first badge pass
- write unlocks to `achievements`
- limit v1 badges to adventure waypoint/completion unlocks

---

## Release Strategy

## Phase A: Minimal persisted adventure slice

### Goal

Ship one polished, server-backed adventure challenge.

### Recommended starter adventure

Use one of:

- `hadrians-wall`
- `camino-de-santiago`

Recommendation: `Hadrian's Wall`

Reason:

- shorter route
- easier onboarding
- easier to test waypoint progression quickly
- still visually distinctive

### Tracking mode

Use `distance` only for the first release.

Do not support step-based adventure templates in the first production slice.

---

## Phase B: Adventure badges only

### Goal

Add lightweight collectible feedback without expanding into a generalized achievement platform.

Allowed badge types in this phase:

- waypoint badge
- adventure completion badge

Do not add:

- streak badges
- social badges
- lifetime milestone badges
- rarity

---

## Phase C: Generalized badge platform

Only start this after adventure adoption is proven.

Possible additions:

- badge metadata tables
- rarity computation
- profile showcase expansion
- milestone and streak unlocks
- social unlocks
- meta-badges across multiple adventures

---

## Data Model

## Phase A schema changes

### New table: `adventure_templates`

Suggested columns:

```sql
create table public.adventure_templates (
  id text primary key,
  name text not null,
  subtitle text not null,
  region text not null,
  tracking_type text not null check (tracking_type in ('distance')),
  total_distance numeric not null check (total_distance > 0),
  difficulty text not null check (difficulty in ('easy', 'moderate', 'challenging', 'epic')),
  estimated_days integer not null check (estimated_days > 0),
  accent_color text not null,
  cover_image_key text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### New table: `adventure_waypoints`

Suggested columns:

```sql
create table public.adventure_waypoints (
  id text primary key,
  adventure_template_id text not null references public.adventure_templates(id) on delete cascade,
  title text not null,
  description text not null,
  distance_from_start numeric not null check (distance_from_start >= 0),
  sort_order integer not null,
  badge_key text null,
  fun_fact text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (adventure_template_id, sort_order)
);
```

### Change table: `challenges`

Suggested column:

```sql
alter table public.challenges
add column adventure_template_id text null
references public.adventure_templates(id);
```

### RPC and query changes

Extend all challenge-fetching paths that power the client with `adventure_template_id`.

Minimum required:

- `get_my_challenges`
- single challenge detail query path
- any mapped `ChallengeWithParticipation` response shape

---

## Phase B schema changes

### Reuse existing `achievements` table

Current table shape is enough for simple unlock recording:

- `user_id`
- `achievement_type`
- `unlocked_at`

Suggested convention:

- store adventure waypoint unlocks as stable keys
- store completion unlocks as stable keys

Examples:

- `adventure.hadrians-wall.waypoint.vindolanda`
- `adventure.hadrians-wall.complete`

### Optional server support for adventure badge unlocks

If unlocks are computed on the server, add a trigger or RPC that awards these achievement keys when the participant crosses waypoint thresholds.

This can wait until after the core adventure surface ships.

---

## TypeScript Models

## Client-side template types

Suggested shape:

```ts
export interface AdventureWaypoint {
  id: string;
  title: string;
  description: string;
  distanceFromStart: number;
  badgeKey?: string | null;
  funFact?: string | null;
}

export interface AdventureTemplate {
  id: string;
  name: string;
  subtitle: string;
  region: string;
  trackingType: "distance";
  totalDistance: number;
  difficulty: "easy" | "moderate" | "challenging" | "epic";
  estimatedDays: number;
  accentColor: string;
  coverImageKey?: string | null;
  completionBadgeKey?: string | null;
  waypoints: AdventureWaypoint[];
}
```

### Important constraint

Keep `trackingType` limited to `"distance"` until the first slice is proven.

---

## Client Architecture

## Feature flag

Recommended:

- add a lightweight feature flag for adventures
- keep it easy to disable while integrating

This can be a local config flag at first if AVVIO does not already have remote flagging for this feature.

---

## Source of truth

The correct ownership model is:

- database owns challenge-to-adventure identity
- client owns presentation logic
- server or seeded data owns template catalog

The client should not infer adventure identity from local cache.

---

## File-by-File Plan

## 1. Schema and generated types

Files to change:

- `supabase/migrations/<new_migration>.sql`
- `src/types/database.ts`
- `src/types/database-helpers.ts`

Tasks:

- add `adventure_templates`
- add `adventure_waypoints`
- add `challenges.adventure_template_id`
- regenerate Supabase types
- expose any new helper aliases if needed

---

## 2. Challenge services and query mapping

Files to change:

- `src/services/challenges.ts`
- `src/hooks/useChallenges.ts`
- any RPC SQL or Supabase query definitions involved in challenge fetches

Tasks:

- include `adventure_template_id` in challenge-fetch response validation
- thread `adventure_template_id` into `ChallengeWithParticipation`
- ensure create challenge accepts optional `adventure_template_id`
- invalidate challenge queries normally after create

Notes:

- do not create a new challenge service path just for adventures
- extend the existing challenge pipeline

---

## 3. Adventure constants and selectors

Files to add:

- `src/constants/adventures.ts`

Tasks:

- define starter templates
- export lookup helpers by template ID
- keep one source of client-side display metadata

Notes:

- even if templates are seeded in DB, client display helpers are still useful
- if server fetches are not yet built for catalog browsing, seed one or two templates in this file temporarily

---

## 4. Create challenge flow

Files to change:

- `src/components/create-challenge/types.ts`
- `src/components/create-challenge/CreateChallengeOrchestrator.tsx`
- `src/components/create-challenge/StepType.tsx`
- `src/components/create-challenge/StepReview.tsx`
- `src/components/create-challenge/StepDetails.tsx`

Files to add:

- `src/components/create-challenge/StepAdventureGallery.tsx`
- `src/components/create-challenge/AdventurePreviewCard.tsx`

Tasks:

- add `"adventure"` to `CreateStep`
- add `adventureTemplateId: string | null` to `CreateFormData`
- add an Adventure option card in `StepType`
- route `Adventure` selections to a gallery step
- auto-fill:
  - challenge type
  - goal value
  - goal unit
  - title
  - description
  - suggested duration
- pass `adventure_template_id` into the create mutation
- display adventure summary data in review step

Decision:

- adventure should behave like a creation preset, not like a new base activity type

---

## 5. Challenge detail adventure rendering

Files to change:

- `src/components/challenge-detail/ChallengeDetailScreen.tsx`
- `src/components/challenge-detail/types.ts`

Files to add:

- `src/components/adventure/AdventureHeaderCard.tsx`
- `src/components/adventure/RouteProgressMap.tsx`
- `src/components/adventure/WaypointMarker.tsx`
- `src/components/adventure/ParticipantMarker.tsx`

Tasks:

- detect adventure challenges using `challenge.adventure_template_id`
- resolve template metadata
- swap the standard header UI for adventure UI
- render route progress using existing challenge progress and leaderboard data
- keep the rest of the detail screen intact

Design rule:

- only replace the hero area first
- do not rewrite the rest of challenge detail unnecessarily

---

## 6. Adventure progress computation

Files to add:

- `src/hooks/useAdventureProgress.ts`

Tasks:

- compute percent along route
- compute reached waypoints
- compute next waypoint
- detect newly crossed waypoint since last render
- expose data for route markers and celebration modals

Recommended temporary local persistence:

- use AsyncStorage only for local UI dismissal state like `lastSeenWaypoint`
- do not use AsyncStorage to determine which template a challenge belongs to

---

## 7. Adventure celebrations

Files to add:

- `src/components/adventure/WaypointReachedModal.tsx`
- `src/components/adventure/AdventureCompleteModal.tsx`

Tasks:

- show celebration when a waypoint is newly crossed
- show completion state when route is finished
- include title, description, optional fun fact, and CTA to share

Notes:

- keep these as UI-only state transitions in the first pass
- push notifications can wait

---

## 8. Sharing

Files to add:

- `src/components/adventure/ShareCard.tsx`
- `src/hooks/useShareAdventure.ts`

Dependencies:

- `react-native-view-shot`
- `expo-sharing`

Tasks:

- render a share-safe card component
- capture card as an image
- invoke native share sheet

Recommended first share format:

- one square card

Defer:

- separate story layout
- QR code
- multiple themes

---

## 9. Lightweight adventure badge support

Files to add:

- `src/constants/badges.ts`
- `src/hooks/useAdventureBadges.ts`

Optional files to add later:

- `src/components/profile/BadgeGrid.tsx`
- `src/components/profile/BadgeDetailModal.tsx`

Tasks:

- define only adventure badge display metadata
- map waypoint/completion events to stable `achievement_type` keys
- read earned keys from `achievements`

Important:

- do not build a generalized `useBadges` system in the first pass
- keep this narrowly scoped to adventure unlocks

---

## 10. Profile integration

Files to change later:

- `app/(tabs)/profile.tsx`

Recommended v1 decision:

- do not block adventure launch on profile badge UI

Recommended v1.1:

- add a compact `Adventure Badges` section below existing profile stats
- show a simple grid of earned adventure badges only

Reason:

The current profile screen is intentionally still light. Adventure should not be delayed by trying to turn profile into a collection hub immediately.

---

## API and Validation Changes

## Create challenge input

Extend create challenge validation to accept:

```ts
adventure_template_id?: string;
```

Rules:

- optional
- valid only when challenge type and template tracking type match
- for v1, template must require `distance`

### Validation behavior

- if a client passes an unknown template ID, reject
- if a client passes an incompatible type/template combination, reject

---

## UI and Design Rules

### Design goals

- route should feel iconic, not generic
- visual identity should be obviously different from normal challenges
- waypoint celebrations should feel rewarding, not noisy

### Route visualization rules

- use stylized SVG, not a real map SDK
- keep route shapes hand-authored per adventure if needed
- support solo and group marker rendering
- keep avatar clustering simple in v1

### Motion rules

- animate marker movement subtly
- animate waypoint unlock state
- animate completion state
- avoid overbuilding micro-interactions

---

## Badge Strategy

## What badges should exist in the first badge pass

Allowed:

- waypoint unlock badges
- completion badge

Examples:

- `Wall Walker`
- `Vindolanda Reached`
- `Camino Finisher`

## What should not exist yet

Do not build these yet:

- `7-day streak`
- `100k steps`
- `5 friends invited`
- `10 challenges won`
- badge rarity percentages

Reason:

Those features require either:

- a real criteria engine
- more reliable source data aggregation
- more profile and notification surface area

They are a separate product track.

---

## Merge Order

This is the recommended implementation order for Claude.

## PR 1: Schema and service plumbing

Includes:

- migrations
- generated types
- challenge service validation
- challenge fetch response updates
- create mutation support for `adventure_template_id`

Exit criteria:

- a challenge can be created with an `adventure_template_id`
- a fetched challenge returns that value correctly

---

## PR 2: Adventure catalog and create flow

Includes:

- `src/constants/adventures.ts`
- adventure gallery step
- create form state changes
- review step adventure summary

Exit criteria:

- user can create an adventure challenge from the wizard

---

## PR 3: Adventure detail hero

Includes:

- adventure hero components
- route visualization
- challenge detail swap logic

Exit criteria:

- created adventure challenge renders a route hero instead of standard header

---

## PR 4: Waypoint progress and celebration

Includes:

- `useAdventureProgress`
- waypoint modal
- completion modal

Exit criteria:

- logging progress updates route state
- crossing a waypoint shows correct celebration

---

## PR 5: Sharing

Includes:

- share card
- screenshot capture
- native share flow

Exit criteria:

- user can share progress from adventure detail

---

## PR 6: Adventure badge unlocks

Includes:

- adventure badge metadata
- unlock mapping to `achievements`
- optional lightweight profile section

Exit criteria:

- waypoint and completion unlocks can be displayed consistently

---

## Verification Plan

## Functional checks

1. Create a solo adventure challenge and verify auto-filled values are correct
2. Create a social adventure challenge and verify invite flow still works
3. Open the created challenge and verify the route hero renders
4. Log activity and verify route progress updates
5. Cross a waypoint threshold and verify celebration appears once
6. Finish an adventure and verify completion UI appears
7. Share progress and verify image capture plus native share sheet

## Data integrity checks

1. Reinstall app or clear local storage and verify adventure challenge still renders correctly after refetch
2. Open same adventure challenge on a second device and verify the same template renders
3. Verify invited participants see the same adventure UI as the creator

## Regression checks

1. Standard non-adventure challenges still create normally
2. Standard challenge detail still renders normally
3. Leaderboard behavior is unchanged for non-adventure challenges
4. Query invalidation after create still refreshes active challenges

---

## Risks and Mitigations

## Risk: feature feels cosmetic

Mitigation:

- include waypoint progression and celebration in the first slice
- do not ship only a route header

## Risk: over-scoped badge system delays launch

Mitigation:

- limit badge scope to adventure waypoint and completion unlocks only

## Risk: inconsistent rendering across devices

Mitigation:

- persist `adventure_template_id` on the server from day one

## Risk: unclear semantics for steps vs distance vs climbs

Mitigation:

- use `distance` only in the first release

## Risk: challenge detail becomes too complex

Mitigation:

- swap only the hero area first
- keep existing sections below the fold

---

## Explicit Non-Goals

These are out of scope for the first implementation:

- a complete badge economy
- rarity and percentile ownership
- generalized achievement criteria engine
- map SDK or geospatial route rendering
- downloadable route media pipeline
- multiple tracking modes per adventure
- full profile overhaul
- home screen personalization around adventures

---

## Claude Execution Notes

If Claude is implementing this plan, it should follow these constraints:

1. Do not introduce AsyncStorage as the source of truth for adventure identity.
2. Reuse the current challenge pipeline rather than creating a parallel adventure challenge pipeline.
3. Keep v1 to `distance` adventures only.
4. Build the vertical slice in the merge order defined above.
5. Do not expand into generalized badges until adventure creation and rendering are working end-to-end.

---

## Final Decision

AVVIO should build `Narrative Adventures` now.

But the correct implementation is:

- persisted
- narrow
- route-first
- one-adventure-first
- badges-later

That is the highest-leverage version of the feature for both product differentiation and architectural health.
