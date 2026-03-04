// src/services/health/providers/HealthKitProvider.ts
// =============================================================================
// HealthKit Provider Implementation (iOS)
// Uses @kingstinct/react-native-healthkit (Nitro Modules)
// =============================================================================

import { Platform } from "react-native";
import { HealthProvider } from "./HealthProvider";
import type {
  HealthProvider as HealthProviderType,
  HealthSample,
  ChallengeType,
  HealthPermission,
  PermissionResult,
} from "../types";

// Type-only imports — erased at runtime, validated at compile time
import type {
  QuantityTypeIdentifier,
  ObjectTypeIdentifier,
} from "@kingstinct/react-native-healthkit";

// Runtime import — WorkoutActivityType is a numeric enum, needed for key mapping
import { WorkoutActivityType } from "@kingstinct/react-native-healthkit";

// =============================================================================
// LAZY MODULE LOADER
// =============================================================================

let _hk: typeof import("@kingstinct/react-native-healthkit") | null = null;

async function getHK() {
  if (Platform.OS !== "ios") return null;
  if (_hk) return _hk;
  try {
    _hk = await import("@kingstinct/react-native-healthkit");
    return _hk;
  } catch (error) {
    console.warn("[HealthKitProvider] Module not available:", error);
    return null;
  }
}

// =============================================================================
// SINGLE SOURCE OF TRUTH
//
// One config per ChallengeType. Authorization and querying both derive from
// this same structure. If you add a new type here, both authorization and
// fetching automatically include it. No two maps that can drift apart.
// =============================================================================

interface HealthKitTypeConfig {
  /** Identifiers used for BOTH authorization and querying */
  readonly identifiers: readonly ObjectTypeIdentifier[];
  /** How to fetch data: "quantity" uses queryQuantitySamples, "workout" uses queryWorkoutSamples */
  readonly fetchMode: "quantity" | "workout" | "none";
  /** Default unit when the sample doesn't specify one */
  readonly defaultUnit: string;
}

const HEALTHKIT_CONFIG: Record<ChallengeType, HealthKitTypeConfig> = {
  steps: {
    identifiers: ["HKQuantityTypeIdentifierStepCount"],
    fetchMode: "quantity",
    defaultUnit: "count",
  },
  active_minutes: {
    identifiers: ["HKQuantityTypeIdentifierAppleExerciseTime"],
    fetchMode: "quantity",
    defaultUnit: "min",
  },
  calories: {
    identifiers: ["HKQuantityTypeIdentifierActiveEnergyBurned"],
    fetchMode: "quantity",
    defaultUnit: "kcal",
  },
  distance: {
    identifiers: [
      "HKQuantityTypeIdentifierDistanceWalkingRunning",
      "HKQuantityTypeIdentifierDistanceCycling",
      "HKQuantityTypeIdentifierDistanceSwimming",
    ],
    fetchMode: "quantity",
    defaultUnit: "m",
  },
  workouts: {
    identifiers: ["HKWorkoutTypeIdentifier" as ObjectTypeIdentifier],
    fetchMode: "workout",
    defaultUnit: "count",
  },
  custom: {
    identifiers: [],
    fetchMode: "none",
    defaultUnit: "count",
  },
};

// =============================================================================
// HEALTH PERMISSION → CHALLENGE TYPE MAPPING
//
// Maps our HealthPermission names to ChallengeType keys in HEALTHKIT_CONFIG.
// heartRate and sleep are standalone permissions (no ChallengeType) — they
// get their own identifiers below.
// =============================================================================

const PERMISSION_TO_CHALLENGE_TYPE: Partial<Record<HealthPermission, ChallengeType>> = {
  steps: "steps",
  activeMinutes: "active_minutes",
  workouts: "workouts",
  distance: "distance",
  calories: "calories",
};

const STANDALONE_PERMISSION_IDENTIFIERS: Partial<
  Record<HealthPermission, readonly ObjectTypeIdentifier[]>
> = {
  heartRate: ["HKQuantityTypeIdentifierHeartRate"],
  sleep: ["HKCategoryTypeIdentifierSleepAnalysis" as ObjectTypeIdentifier],
};

// =============================================================================
// WORKOUT ACTIVITY KEY MAP
//
// Maps HealthKit WorkoutActivityType enum → stable string key.
// These keys are stored in activity_logs and used for challenge filtering.
// Adding a new workout type = one line here. No migrations.
// =============================================================================

const WORKOUT_ACTIVITY_KEY: Partial<Record<WorkoutActivityType, string>> = {
  // Tier 1 — Core fitness activities
  [WorkoutActivityType.running]: "running",
  [WorkoutActivityType.cycling]: "cycling",
  [WorkoutActivityType.swimming]: "swimming",
  [WorkoutActivityType.walking]: "walking",
  [WorkoutActivityType.hiking]: "hiking",
  [WorkoutActivityType.yoga]: "yoga",

  // Tier 2 — Gym / home workouts
  [WorkoutActivityType.traditionalStrengthTraining]: "strength_training",
  [WorkoutActivityType.functionalStrengthTraining]: "strength_training",
  [WorkoutActivityType.highIntensityIntervalTraining]: "hiit",
  [WorkoutActivityType.coreTraining]: "core_training",
  [WorkoutActivityType.pilates]: "pilates",
  [WorkoutActivityType.elliptical]: "elliptical",
  [WorkoutActivityType.rowing]: "rowing",
  [WorkoutActivityType.stairClimbing]: "stair_climbing",
  [WorkoutActivityType.dance]: "dance",
  [WorkoutActivityType.barre]: "barre",
  [WorkoutActivityType.flexibility]: "flexibility",
  [WorkoutActivityType.mixedCardio]: "mixed_cardio",
  [WorkoutActivityType.jumpRope]: "jump_rope",
  [WorkoutActivityType.kickboxing]: "kickboxing",
  [WorkoutActivityType.crossTraining]: "cross_training",

  // Tier 3 — Popular sports
  [WorkoutActivityType.basketball]: "basketball",
  [WorkoutActivityType.soccer]: "soccer",
  [WorkoutActivityType.tennis]: "tennis",
  [WorkoutActivityType.golf]: "golf",
  [WorkoutActivityType.boxing]: "boxing",
  [WorkoutActivityType.martialArts]: "martial_arts",
  [WorkoutActivityType.pickleball]: "pickleball",

  // Tier 3 — Snow / water / other
  [WorkoutActivityType.snowboarding]: "snowboarding",
  [WorkoutActivityType.downhillSkiing]: "downhill_skiing",
  [WorkoutActivityType.crossCountrySkiing]: "cross_country_skiing",
  [WorkoutActivityType.surfingSports]: "surfing",
  [WorkoutActivityType.mindAndBody]: "mind_and_body",
  [WorkoutActivityType.preparationAndRecovery]: "recovery",
  [WorkoutActivityType.cooldown]: "cooldown",
  [WorkoutActivityType.swimBikeRun]: "triathlon",
  // Unmapped types → "other"
};

/**
 * Collect all HealthKit identifiers needed for a set of HealthPermissions.
 * Derives from HEALTHKIT_CONFIG for challenge-mapped permissions,
 * and STANDALONE_PERMISSION_IDENTIFIERS for extras.
 */
function collectAuthIdentifiers(permissions: HealthPermission[]): ObjectTypeIdentifier[] {
  const identifiers = new Set<ObjectTypeIdentifier>();

  for (const perm of permissions) {
    // Check if this permission maps to a ChallengeType config
    const challengeType = PERMISSION_TO_CHALLENGE_TYPE[perm];
    if (challengeType) {
      for (const id of HEALTHKIT_CONFIG[challengeType].identifiers) {
        identifiers.add(id);
      }
    }

    // Check for standalone identifiers (heartRate, sleep)
    const standalone = STANDALONE_PERMISSION_IDENTIFIERS[perm];
    if (standalone) {
      for (const id of standalone) {
        identifiers.add(id);
      }
    }
  }

  return Array.from(identifiers);
}

// =============================================================================
// PROVIDER
// =============================================================================

export class HealthKitProvider extends HealthProvider {
  readonly provider: HealthProviderType = "healthkit";

  async isAvailable(): Promise<boolean> {
    if (Platform.OS !== "ios") return false;
    const hk = await getHK();
    if (!hk) return false;
    try {
      return hk.isHealthDataAvailable();
    } catch (error) {
      console.error("[HealthKitProvider] isAvailable error:", error);
      return false;
    }
  }

  async getAuthorizationStatus(): Promise<PermissionResult> {
    const hk = await getHK();
    const allPerms = Object.keys(PERMISSION_TO_CHALLENGE_TYPE) as HealthPermission[];
    if (!hk) {
      return { granted: [], denied: [], notDetermined: allPerms };
    }

    const granted: HealthPermission[] = [];
    const denied: HealthPermission[] = [];
    const notDetermined: HealthPermission[] = [];

    for (const perm of allPerms) {
      const identifiers = collectAuthIdentifiers([perm]);
      if (identifiers.length === 0) {
        notDetermined.push(perm);
        continue;
      }

      try {
        // Check first identifier — if any is authorized, consider permission granted
        // Note: iOS never reveals read denial; notDetermined and denied look the same
        const status = hk.authorizationStatusFor(identifiers[0]);
        if (status === 2) {
          granted.push(perm);
        } else if (status === 1) {
          denied.push(perm);
        } else {
          notDetermined.push(perm);
        }
      } catch {
        notDetermined.push(perm);
      }
    }

    return { granted, denied, notDetermined };
  }

  async requestAuthorization(permissions: HealthPermission[]): Promise<PermissionResult> {
    const hk = await getHK();
    if (!hk) {
      return { granted: [], denied: permissions, notDetermined: [] };
    }

    const toRead = collectAuthIdentifiers(permissions);

    try {
      console.log("[HealthKitProvider] Requesting authorization for:", toRead);
      await hk.requestAuthorization({ toRead });
      console.log("[HealthKitProvider] Authorization request completed");

      // iOS never reveals which read permissions were denied.
      // If no error thrown, we report all as granted.
      return { granted: permissions, denied: [], notDetermined: [] };
    } catch (error) {
      console.error("[HealthKitProvider] Authorization failed:", error);
      return { granted: [], denied: permissions, notDetermined: [] };
    }
  }

  async fetchSamples(
    startDate: Date,
    endDate: Date,
    types: ChallengeType[],
  ): Promise<HealthSample[]> {
    this.validateDateRange(startDate, endDate);
    const hk = await getHK();
    if (!hk) return [];

    const allSamples: HealthSample[] = [];

    for (const type of types) {
      const config = HEALTHKIT_CONFIG[type];
      if (!config || config.fetchMode === "none") continue;

      if (config.fetchMode === "workout") {
        try {
          const workouts = await hk.queryWorkoutSamples({
            limit: 1000,
            filter: { date: { startDate, endDate } },
          });

          console.log(`[HealthKitProvider] Fetched ${workouts.length} workouts`);

          for (const w of workouts) {
            const activityKey = WORKOUT_ACTIVITY_KEY[w.workoutActivityType] ?? "other";
            const rawDuration = w.duration?.quantity ?? 0;
            const durationUnit = w.duration?.unit ?? "unknown";

            // HealthKit duration may be seconds or minutes — log raw for Phase 1 verification
            const durationMinutes =
              durationUnit === "s" || durationUnit === "sec" || durationUnit === "seconds"
                ? rawDuration / 60
                : rawDuration; // If already minutes, use as-is

            console.log(
              `[HealthKitProvider] Workout: ${activityKey} (type=${w.workoutActivityType}), ` +
                `raw=${rawDuration.toFixed(1)} ${durationUnit}, minutes=${durationMinutes.toFixed(1)}`,
            );

            allSamples.push({
              id: w.uuid,
              type: "workouts",
              value: Math.max(1, Math.round(durationMinutes)),
              unit: "min",
              startDate: new Date(w.startDate),
              endDate: new Date(w.endDate),
              sourceName: w.sourceRevision?.source?.name ?? "Unknown",
              sourceId: w.sourceRevision?.source?.bundleIdentifier ?? "",
              metadata: {
                workout_activity_key: activityKey,
                workout_activity_type: w.workoutActivityType,
                total_distance_meters: w.totalDistance?.quantity,
                total_energy_burned_kcal: w.totalEnergyBurned?.quantity,
              },
            });
          }
        } catch (error) {
          console.error("[HealthKitProvider] Error fetching workouts:", error);
        }
        continue;
      }

      // fetchMode === "quantity"
      for (const identifier of config.identifiers) {
        try {
          const samples = await hk.queryQuantitySamples(identifier as QuantityTypeIdentifier, {
            limit: 1000,
            filter: { date: { startDate, endDate } },
          });

          console.log(`[HealthKitProvider] Fetched ${samples.length} samples for ${identifier}`);

          for (const s of samples) {
            allSamples.push({
              id: s.uuid,
              type,
              value: s.quantity,
              unit: s.unit || config.defaultUnit,
              startDate: new Date(s.startDate),
              endDate: new Date(s.endDate),
              sourceName: s.sourceRevision?.source?.name ?? "Unknown",
              sourceId: s.sourceRevision?.source?.bundleIdentifier ?? "",
            });
          }
        } catch (error) {
          console.error(`[HealthKitProvider] Error fetching ${identifier}:`, error);
        }
      }
    }

    return this.sortSamplesByDate(this.deduplicateSamples(allSamples));
  }

  async enableBackgroundDelivery(types: ChallengeType[]): Promise<boolean> {
    // Requires background: true in app.json plugin.
    // Shipping with foreground sync for v1.
    return false;
  }

  protected override mapPermissionsToProvider(permissions: HealthPermission[]): string[] {
    return collectAuthIdentifiers(permissions);
  }

  protected override mapProviderTypeToChallenge(providerType: string): ChallengeType | null {
    for (const [challengeType, config] of Object.entries(HEALTHKIT_CONFIG)) {
      if (config.identifiers.includes(providerType as ObjectTypeIdentifier)) {
        return challengeType as ChallengeType;
      }
    }
    return null;
  }
}
