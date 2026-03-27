import { getServerNow } from "@/lib/serverTime";
import { calculateActivityPoints } from "@/lib/activityPoints";
import type { DisplayActivity } from "@/hooks/useActivities";

const olderActivityFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
});

export function groupActivitiesByDate<T extends { recorded_at: string }>(
  activities: T[],
): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  const now = getServerNow();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);

  for (const activity of activities) {
    const date = new Date(activity.recorded_at);
    const activityDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    let group: string;
    if (activityDate.getTime() === today.getTime()) {
      group = "Today";
    } else if (activityDate.getTime() === yesterday.getTime()) {
      group = "Yesterday";
    } else {
      group = olderActivityFormatter.format(activityDate);
    }

    if (!groups[group]) {
      groups[group] = [];
    }

    groups[group].push(activity);
  }

  return groups;
}

// =============================================================================
// RENDER MODEL — collapsible runs of same-type health entries
// =============================================================================

export type RenderItem =
  | { kind: "single"; activity: DisplayActivity }
  | {
      kind: "collapsedRun";
      runKey: string;
      type: string;
      source: string;
      activities: DisplayActivity[];
      totalValue: number;
      totalPoints: number;
      unit: string;
      latestRecordedAt: string;
      earliestRecordedAt: string;
    };

/** Extract YYYY-MM-DD from an ISO timestamp in local time. */
function toLocalDateKey(isoString: string): string {
  const d = new Date(isoString);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whether an activity can be part of a collapsible run. */
function isCollapsible(activity: DisplayActivity): boolean {
  return (
    activity.source !== "manual" &&
    activity.activity_type !== "workouts"
  );
}

/**
 * Build a render model from a sorted list of display activities.
 *
 * Merges all same-day, same-type, same-source health entries into a single
 * collapsible summary row per (day, type, source) bucket — regardless of
 * whether they are contiguous in the input. Workouts and manual entries are
 * always rendered as singles.
 *
 * Output is ordered by the latest `recorded_at` of each bucket or single,
 * descending, so chronological ordering is preserved.
 *
 * @precondition `activities` must be sorted by `recorded_at` DESC (matches
 * `getRecentActivities` ordering). This function does NOT re-sort the input.
 */
export function buildActivityRenderModel(
  activities: DisplayActivity[],
): RenderItem[] {
  if (activities.length === 0) return [];

  // Phase 1: Bucket collapsible entries by (day, type, source).
  // Non-collapsible entries (workouts, manual) are kept as standalone singles.
  const buckets = new Map<string, DisplayActivity[]>();
  const singles: { activity: DisplayActivity; latestAt: string }[] = [];

  for (const activity of activities) {
    if (!isCollapsible(activity)) {
      singles.push({ activity, latestAt: activity.recorded_at });
      continue;
    }

    const dateKey = toLocalDateKey(activity.recorded_at);
    const bucketKey = `${dateKey}:${activity.activity_type}:${activity.source}`;

    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, []);
    }
    buckets.get(bucketKey)!.push(activity);
  }

  // Phase 2: Convert buckets into RenderItems.
  type SortableItem = { item: RenderItem; latestAt: string };
  const sortable: SortableItem[] = [];

  for (const [bucketKey, group] of buckets) {
    if (group.length === 1) {
      sortable.push({ item: { kind: "single", activity: group[0] }, latestAt: group[0].recorded_at });
      continue;
    }

    const first = group[0]; // Earliest in DESC order = latest timestamp
    const totalValue = group.reduce((sum, a) => sum + a.value, 0);
    const rawUnit = first.unit;
    const displayUnit =
      rawUnit === "m" || rawUnit === "meters" ? "meters" : rawUnit;

    sortable.push({
      item: {
        kind: "collapsedRun",
        runKey: bucketKey,
        type: first.activity_type,
        source: first.source,
        activities: group,
        totalValue,
        totalPoints: calculateActivityPoints(
          totalValue,
          first.activity_type,
          first.unit,
          first.workout_activity_key,
        ),
        unit: displayUnit,
        latestRecordedAt: first.recorded_at,
        earliestRecordedAt: group[group.length - 1].recorded_at,
      },
      latestAt: first.recorded_at,
    });
  }

  for (const s of singles) {
    sortable.push({ item: { kind: "single", activity: s.activity }, latestAt: s.latestAt });
  }

  // Phase 3: Sort by latestAt descending to preserve chronological output.
  sortable.sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());

  return sortable.map((s) => s.item);
}
