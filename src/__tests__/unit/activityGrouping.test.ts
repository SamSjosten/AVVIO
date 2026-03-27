const mockGetServerNow = jest.fn();

jest.mock("@/lib/serverTime", () => ({
  getServerNow: () => mockGetServerNow(),
}));

jest.mock("@/lib/workoutCatalog", () => ({
  WORKOUT_CATALOG: [],
  WORKOUT_MULTIPLIER_MAP: new Map(),
}));

import { groupActivitiesByDate, buildActivityRenderModel } from "@/lib/activityGrouping";
import type { DisplayActivity } from "@/hooks/useActivities";

describe("groupActivitiesByDate", () => {
  const fixedNow = new Date("2025-03-20T12:00:00Z");

  beforeEach(() => {
    mockGetServerNow.mockReturnValue(fixedNow);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('groups activities into "Today", "Yesterday", and formatted older dates', () => {
    const olderRecordedAt = new Date(
      fixedNow.getFullYear(),
      fixedNow.getMonth(),
      fixedNow.getDate() - 2,
      12,
      0,
      0,
    ).toISOString();
    const expectedOlderLabel = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    }).format(new Date(olderRecordedAt));

    const grouped = groupActivitiesByDate([
      {
        id: "today",
        recorded_at: new Date(
          fixedNow.getFullYear(),
          fixedNow.getMonth(),
          fixedNow.getDate(),
          9,
          30,
          0,
        ).toISOString(),
      },
      {
        id: "yesterday",
        recorded_at: new Date(
          fixedNow.getFullYear(),
          fixedNow.getMonth(),
          fixedNow.getDate() - 1,
          15,
          0,
          0,
        ).toISOString(),
      },
      {
        id: "older",
        recorded_at: olderRecordedAt,
      },
    ]);

    expect(grouped.Today?.map((activity) => activity.id)).toEqual(["today"]);
    expect(grouped.Yesterday?.map((activity) => activity.id)).toEqual(["yesterday"]);
    expect(grouped[expectedOlderLabel]?.map((activity) => activity.id)).toEqual(["older"]);
  });

  test("keeps near-midnight activities on the correct local day boundary", () => {
    const grouped = groupActivitiesByDate([
      {
        id: "today-early",
        recorded_at: new Date(
          fixedNow.getFullYear(),
          fixedNow.getMonth(),
          fixedNow.getDate(),
          0,
          5,
          0,
        ).toISOString(),
      },
      {
        id: "yesterday-late",
        recorded_at: new Date(
          fixedNow.getFullYear(),
          fixedNow.getMonth(),
          fixedNow.getDate() - 1,
          23,
          55,
          0,
        ).toISOString(),
      },
    ]);

    expect(grouped.Today?.map((activity) => activity.id)).toEqual(["today-early"]);
    expect(grouped.Yesterday?.map((activity) => activity.id)).toEqual(["yesterday-late"]);
  });
});

// =============================================================================
// buildActivityRenderModel
// =============================================================================

function makeActivity(overrides: Partial<DisplayActivity> & { id: string }): DisplayActivity {
  const defaults = {
    user_id: "user-1",
    challenge_id: null,
    activity_type: "steps",
    value: 100,
    unit: "count",
    source: "healthkit",
    source_external_id: null,
    recorded_at: "2025-03-20T12:00:00Z",
    created_at: "2025-03-20T12:00:00Z",
    updated_at: "2025-03-20T12:00:00Z",
    client_event_id: null,
    metadata: null,
    workout_activity_key: null,
    displayDate: "Today",
    displayTime: "12:00 PM",
    points: 1,
    name: "Steps",
  };
  return { ...defaults, ...overrides } as DisplayActivity;
}

describe("buildActivityRenderModel", () => {
  test("empty input returns empty output", () => {
    expect(buildActivityRenderModel([])).toEqual([]);
  });

  test("single manual entry becomes single", () => {
    const result = buildActivityRenderModel([
      makeActivity({ id: "a1", source: "manual" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("single");
  });

  test("single health entry becomes single (not 1-item collapsedRun)", () => {
    const result = buildActivityRenderModel([
      makeActivity({ id: "a1", source: "healthkit" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("single");
  });

  test("5 consecutive health steps same day collapse into 1 run", () => {
    const activities = [
      makeActivity({ id: "a1", value: 200, recorded_at: "2025-03-20T17:00:00Z" }),
      makeActivity({ id: "a2", value: 150, recorded_at: "2025-03-20T16:50:00Z" }),
      makeActivity({ id: "a3", value: 100, recorded_at: "2025-03-20T16:40:00Z" }),
      makeActivity({ id: "a4", value: 80, recorded_at: "2025-03-20T16:30:00Z" }),
      makeActivity({ id: "a5", value: 70, recorded_at: "2025-03-20T16:20:00Z" }),
    ];
    const result = buildActivityRenderModel(activities);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("collapsedRun");
    if (result[0].kind === "collapsedRun") {
      expect(result[0].totalValue).toBe(600);
      expect(result[0].activities).toHaveLength(5);
    }
  });

  test("steps -> manual workout -> steps merges steps across interruption", () => {
    const activities = [
      makeActivity({ id: "s1", value: 200, recorded_at: "2025-03-20T18:00:00Z" }),
      makeActivity({ id: "s2", value: 150, recorded_at: "2025-03-20T17:50:00Z" }),
      makeActivity({
        id: "w1",
        activity_type: "workouts",
        source: "manual",
        value: 30,
        unit: "points",
        recorded_at: "2025-03-20T17:00:00Z",
        name: "Workout",
      }),
      makeActivity({ id: "s3", value: 100, recorded_at: "2025-03-20T16:00:00Z" }),
      makeActivity({ id: "s4", value: 80, recorded_at: "2025-03-20T15:50:00Z" }),
    ];
    const result = buildActivityRenderModel(activities);
    // Full-day merge: all 4 step entries merge into 1 run, workout stays single
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe("collapsedRun");
    if (result[0].kind === "collapsedRun") {
      expect(result[0].totalValue).toBe(530); // 200 + 150 + 100 + 80
      expect(result[0].activities).toHaveLength(4);
    }
    expect(result[1].kind).toBe("single");
  });

  test("health steps spanning midnight produce 2 separate runs", () => {
    const activities = [
      makeActivity({ id: "a1", value: 100, recorded_at: "2025-03-21T00:10:00" }),
      makeActivity({ id: "a2", value: 200, recorded_at: "2025-03-21T00:00:00" }),
      // midnight boundary
      makeActivity({ id: "a3", value: 150, recorded_at: "2025-03-20T23:50:00" }),
      makeActivity({ id: "a4", value: 80, recorded_at: "2025-03-20T23:40:00" }),
    ];
    const result = buildActivityRenderModel(activities);
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe("collapsedRun");
    expect(result[1].kind).toBe("collapsedRun");
    if (result[0].kind === "collapsedRun" && result[1].kind === "collapsedRun") {
      expect(result[0].totalValue).toBe(300);
      expect(result[1].totalValue).toBe(230);
    }
  });

  test("mixed types merge by type and preserve chronological order", () => {
    const activities = [
      makeActivity({ id: "s1", activity_type: "steps", value: 100, recorded_at: "2025-03-20T18:00:00Z" }),
      makeActivity({ id: "c1", activity_type: "calories", value: 50, unit: "kcal", recorded_at: "2025-03-20T17:50:00Z", name: "Calories" }),
      makeActivity({ id: "s2", activity_type: "steps", value: 200, recorded_at: "2025-03-20T17:40:00Z" }),
    ];
    const result = buildActivityRenderModel(activities);
    // Full-day merge: steps merge into 1 run, calories stays single
    expect(result).toHaveLength(2);
    // Steps run (latest at 18:00) comes first, calories single (17:50) second
    expect(result[0].kind).toBe("collapsedRun");
    if (result[0].kind === "collapsedRun") {
      expect(result[0].type).toBe("steps");
      expect(result[0].totalValue).toBe(300);
    }
    expect(result[1].kind).toBe("single");
    if (result[1].kind === "single") {
      expect(result[1].activity.activity_type).toBe("calories");
    }
  });

  test("runKey is unique per run", () => {
    // Two different days of steps + a workout = 2 step runs + 1 single
    const activities = [
      makeActivity({ id: "s1", value: 100, recorded_at: "2025-03-20T18:00:00Z" }),
      makeActivity({ id: "s2", value: 200, recorded_at: "2025-03-20T17:50:00Z" }),
      makeActivity({ id: "w1", activity_type: "workouts", source: "manual", value: 10, unit: "points", recorded_at: "2025-03-20T17:00:00Z", name: "Workout" }),
      makeActivity({ id: "s3", value: 80, recorded_at: "2025-03-19T16:00:00Z" }),
      makeActivity({ id: "s4", value: 70, recorded_at: "2025-03-19T15:50:00Z" }),
    ];
    const result = buildActivityRenderModel(activities);
    const keys = result
      .filter((r) => r.kind === "collapsedRun")
      .map((r) => (r as Extract<typeof r, { kind: "collapsedRun" }>).runKey);
    expect(keys.length).toBe(2); // One run per day
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("workout entries are always singles even from health source", () => {
    const activities = [
      makeActivity({ id: "w1", activity_type: "workouts", source: "healthkit", value: 30, unit: "min", recorded_at: "2025-03-20T18:00:00Z" }),
      makeActivity({ id: "w2", activity_type: "workouts", source: "healthkit", value: 45, unit: "min", recorded_at: "2025-03-20T17:00:00Z" }),
    ];
    const result = buildActivityRenderModel(activities);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.kind === "single")).toBe(true);
  });
});
