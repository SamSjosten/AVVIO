// src/lib/workoutCatalog.ts
// Client-side mirror of workout_type_catalog (migration 034).
// Authoritative for client-side display AND scoring.
// If the DB catalog changes, update HERE — this is the single source.

export interface WorkoutCatalogEntry {
  id: string;
  name: string;
  category: "cardio" | "strength" | "flexibility" | "sports";
  multiplier: number;
  sortOrder: number;
}

export const WORKOUT_CATALOG: WorkoutCatalogEntry[] = [
  // Cardio
  {
    id: "running",
    name: "Running",
    category: "cardio",
    multiplier: 1.3,
    sortOrder: 10,
  },
  {
    id: "walking",
    name: "Walking",
    category: "cardio",
    multiplier: 0.9,
    sortOrder: 20,
  },
  {
    id: "cycling",
    name: "Cycling",
    category: "cardio",
    multiplier: 1.1,
    sortOrder: 30,
  },
  {
    id: "swimming",
    name: "Swimming",
    category: "cardio",
    multiplier: 1.3,
    sortOrder: 40,
  },
  {
    id: "rowing",
    name: "Rowing",
    category: "cardio",
    multiplier: 1.3,
    sortOrder: 50,
  },
  {
    id: "elliptical",
    name: "Elliptical",
    category: "cardio",
    multiplier: 1.1,
    sortOrder: 60,
  },
  {
    id: "stair_climbing",
    name: "Stair Climbing",
    category: "cardio",
    multiplier: 1.1,
    sortOrder: 70,
  },
  {
    id: "hiking",
    name: "Hiking",
    category: "cardio",
    multiplier: 1.1,
    sortOrder: 80,
  },
  {
    id: "dance",
    name: "Dance",
    category: "cardio",
    multiplier: 1.1,
    sortOrder: 90,
  },
  {
    id: "jump_rope",
    name: "Jump Rope",
    category: "cardio",
    multiplier: 1.3,
    sortOrder: 100,
  },
  // Strength & Conditioning
  {
    id: "strength_training",
    name: "Strength Training",
    category: "strength",
    multiplier: 1.0,
    sortOrder: 110,
  },
  {
    id: "hiit",
    name: "HIIT",
    category: "strength",
    multiplier: 1.3,
    sortOrder: 120,
  },
  {
    id: "functional_training",
    name: "Functional Training",
    category: "strength",
    multiplier: 1.0,
    sortOrder: 130,
  },
  {
    id: "core_training",
    name: "Core Training",
    category: "strength",
    multiplier: 0.8,
    sortOrder: 140,
  },
  {
    id: "kickboxing",
    name: "Kickboxing",
    category: "strength",
    multiplier: 1.3,
    sortOrder: 150,
  },
  {
    id: "martial_arts",
    name: "Martial Arts",
    category: "strength",
    multiplier: 1.1,
    sortOrder: 160,
  },
  // Flexibility & Mind/Body
  {
    id: "yoga",
    name: "Yoga",
    category: "flexibility",
    multiplier: 0.8,
    sortOrder: 170,
  },
  {
    id: "pilates",
    name: "Pilates",
    category: "flexibility",
    multiplier: 0.8,
    sortOrder: 180,
  },
  {
    id: "stretching",
    name: "Stretching",
    category: "flexibility",
    multiplier: 0.7,
    sortOrder: 190,
  },
  {
    id: "cooldown",
    name: "Cooldown",
    category: "flexibility",
    multiplier: 0.7,
    sortOrder: 200,
  },
  // Sports
  {
    id: "tennis",
    name: "Tennis",
    category: "sports",
    multiplier: 1.1,
    sortOrder: 210,
  },
  {
    id: "basketball",
    name: "Basketball",
    category: "sports",
    multiplier: 1.1,
    sortOrder: 220,
  },
  {
    id: "soccer",
    name: "Soccer",
    category: "sports",
    multiplier: 1.1,
    sortOrder: 230,
  },
  {
    id: "other",
    name: "Other",
    category: "sports",
    multiplier: 1.0,
    sortOrder: 240,
  },
];

// Pre-built lookup for scoring: workout_activity_key → multiplier
export const WORKOUT_MULTIPLIER_MAP = new Map(
  WORKOUT_CATALOG.map((e) => [e.id, e.multiplier]),
);
