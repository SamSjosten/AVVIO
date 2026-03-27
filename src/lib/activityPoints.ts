// src/lib/activityPoints.ts
// Single source of truth for client-side activity points calculation.
// Replaces inline pointsMultiplier maps in useActivities.ts and [id].tsx.

import { WORKOUT_MULTIPLIER_MAP } from "@/lib/workoutCatalog";

const POINTS_MULTIPLIER: Record<string, number> = {
  steps: 0.01, // 1 pt per 100 steps
  active_minutes: 1, // 1 pt per minute
  calories: 0.01, // 1 pt per 100 kcal
  custom: 1,
};

const METERS_PER_MILE = 1609.34;

/**
 * Calculate display points for an activity log row.
 *
 * Workout scoring depends on the source:
 * - Manual workouts (unit='points'): value IS pre-calculated points from server
 * - Health-synced workouts (unit='min'): floor(duration × catalog multiplier)
 *
 * Distance scoring is unit-aware:
 * - Health sync stores meters (unit='m'/'meters'): converts to miles first
 * - Manual entries assumed miles
 */
export function calculateActivityPoints(
  value: number,
  type: string,
  unit?: string | null,
  workoutActivityKey?: string | null,
): number {
  // --- Workouts ---
  if (type === "workouts") {
    // Manual: server pre-computed points stored in value (unit='points')
    if (unit === "points") return Math.round(value);
    // Health-synced: duration in minutes × catalog multiplier
    const multiplier =
      (workoutActivityKey && WORKOUT_MULTIPLIER_MAP.get(workoutActivityKey)) || 1.0;
    return Math.floor(value * multiplier);
  }

  // --- Distance: 5 pts per mile ---
  // Health sync stores meters (unit='m'/'meters'), manual may store miles.
  if (type === "distance") {
    const miles =
      unit === "m" || unit === "meters" ? value / METERS_PER_MILE : value;
    return Math.round(miles * 5);
  }

  // --- All other types ---
  return Math.round(value * (POINTS_MULTIPLIER[type] || 1));
}
