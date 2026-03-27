jest.mock("@/lib/workoutCatalog", () => {
  const WORKOUT_CATALOG = [
    { id: "running", name: "Running", category: "cardio", multiplier: 1.3, sortOrder: 10 },
    { id: "yoga", name: "Yoga", category: "flexibility", multiplier: 0.8, sortOrder: 170 },
    { id: "other", name: "Other", category: "sports", multiplier: 1.0, sortOrder: 240 },
  ];
  return {
    WORKOUT_CATALOG,
    WORKOUT_MULTIPLIER_MAP: new Map(WORKOUT_CATALOG.map((e: { id: string; multiplier: number }) => [e.id, e.multiplier])),
  };
});

import { calculateActivityPoints } from "@/lib/activityPoints";

describe("calculateActivityPoints", () => {
  // Steps: 0.01 multiplier
  test("steps: 1 point per 100 steps", () => {
    expect(calculateActivityPoints(10000, "steps")).toBe(100);
  });

  test("steps: rounds correctly", () => {
    expect(calculateActivityPoints(150, "steps")).toBe(2); // 1.5 rounds to 2
    expect(calculateActivityPoints(49, "steps")).toBe(0); // 0.49 rounds to 0
  });

  // Active minutes: 1:1
  test("active_minutes: 1 point per minute", () => {
    expect(calculateActivityPoints(30, "active_minutes")).toBe(30);
  });

  // Calories: 0.01 multiplier
  test("calories: 1 point per 100 kcal", () => {
    expect(calculateActivityPoints(500, "calories")).toBe(5);
  });

  // Distance: unit-aware, 5 pts per mile
  test("distance in meters converts to miles then x5", () => {
    // 1609.34 meters = 1 mile = 5 points
    expect(calculateActivityPoints(1609.34, "distance", "m")).toBe(5);
    expect(calculateActivityPoints(1609.34, "distance", "meters")).toBe(5);
  });

  test("distance in miles uses x5 directly", () => {
    expect(calculateActivityPoints(3, "distance", "miles")).toBe(15);
  });

  test("distance with null unit assumes miles", () => {
    expect(calculateActivityPoints(2, "distance", null)).toBe(10);
  });

  // Workouts: manual (unit='points')
  test("manual workouts: returns pre-calculated value", () => {
    expect(calculateActivityPoints(36, "workouts", "points")).toBe(36);
    expect(calculateActivityPoints(39, "workouts", "points", "running")).toBe(39);
  });

  // Workouts: health-synced with workout_activity_key
  test("health workouts with key: uses catalog multiplier", () => {
    // running: 1.3x, 30 min -> floor(30 * 1.3) = 39
    expect(calculateActivityPoints(30, "workouts", "min", "running")).toBe(39);
  });

  test("health workouts with yoga key: uses 0.8x", () => {
    // yoga: 0.8x, 30 min -> floor(30 * 0.8) = 24
    expect(calculateActivityPoints(30, "workouts", "min", "yoga")).toBe(24);
  });

  test("health workouts with null key: uses 1.0 default", () => {
    // null key -> 1.0x, 30 min -> floor(30 * 1.0) = 30
    expect(calculateActivityPoints(30, "workouts", "min", null)).toBe(30);
  });

  test("health workouts with unknown key: uses 1.0 default", () => {
    expect(calculateActivityPoints(30, "workouts", "min", "unknown_type")).toBe(30);
  });

  // Unknown type fallback
  test("unknown type: uses 1.0 multiplier", () => {
    expect(calculateActivityPoints(10, "unknown_type")).toBe(10);
  });
});
