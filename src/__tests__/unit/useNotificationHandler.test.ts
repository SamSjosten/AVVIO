// Unit tests for useNotificationHandler utilities
// Tests payload validation and response key generation

// Mock expo-router before any imports that reference it
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
  QueryClient: jest.fn(),
}));

jest.mock("expo-notifications", () => ({
  DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
  clearLastNotificationResponseAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("@/services/notifications", () => ({
  notificationsService: { markAsRead: jest.fn() },
}));

jest.mock("@/lib/queryKeys", () => ({
  notificationsKeys: {
    all: ["notifications"],
    list: () => ["notifications", "list"],
    unreadCount: () => ["notifications", "unreadCount"],
  },
}));

jest.mock("@/lib/sentry", () => ({
  captureError: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

import {
  parseNotificationPayload,
  getResponseKey,
} from "@/hooks/useNotificationHandler";
import * as Notifications from "expo-notifications";

// =============================================================================
// parseNotificationPayload
// =============================================================================

describe("parseNotificationPayload", () => {
  it("parses valid challenge payload", () => {
    const data = {
      challenge_id: "550e8400-e29b-41d4-a716-446655440000",
      notification_type: "challenge_invite",
    };
    const result = parseNotificationPayload(data);
    expect(result).not.toBeNull();
    expect(result!.challenge_id).toBe(data.challenge_id);
  });

  it("parses valid friend request payload", () => {
    const data = { notification_type: "friend_request_received" };
    const result = parseNotificationPayload(data);
    expect(result).not.toBeNull();
    expect(result!.notification_type).toBe("friend_request_received");
  });

  it("rejects non-UUID challenge_id", () => {
    const data = { challenge_id: "not-a-uuid" };
    const result = parseNotificationPayload(data);
    expect(result).toBeNull();
  });

  it("rejects null data", () => {
    const result = parseNotificationPayload(null);
    expect(result).toBeNull();
  });

  it("rejects undefined data", () => {
    const result = parseNotificationPayload(undefined);
    expect(result).toBeNull();
  });

  it("passes through extra fields", () => {
    const data = {
      notification_type: "challenge_invite",
      extra_field: "hello",
    };
    const result = parseNotificationPayload(data);
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).extra_field).toBe("hello");
  });

  it("parses payload with notification_id", () => {
    const data = {
      notification_type: "challenge_invite",
      notification_id: "550e8400-e29b-41d4-a716-446655440000",
    };
    const result = parseNotificationPayload(data);
    expect(result).not.toBeNull();
    expect(result!.notification_id).toBe(data.notification_id);
  });

  it("rejects non-UUID notification_id", () => {
    const data = {
      notification_type: "challenge_invite",
      notification_id: "bad-id",
    };
    const result = parseNotificationPayload(data);
    expect(result).toBeNull();
  });
});

// =============================================================================
// getResponseKey
// =============================================================================

describe("getResponseKey", () => {
  function makeResponse(
    identifier: string,
    actionIdentifier: string,
  ): Notifications.NotificationResponse {
    return {
      notification: {
        request: {
          identifier,
          content: { data: {} },
        },
      },
      actionIdentifier,
    } as unknown as Notifications.NotificationResponse;
  }

  it("produces unique keys for different identifiers", () => {
    const a = getResponseKey(makeResponse("notif-1", Notifications.DEFAULT_ACTION_IDENTIFIER));
    const b = getResponseKey(makeResponse("notif-2", Notifications.DEFAULT_ACTION_IDENTIFIER));
    expect(a).not.toBe(b);
  });

  it("produces unique keys for different action identifiers", () => {
    const a = getResponseKey(makeResponse("notif-1", Notifications.DEFAULT_ACTION_IDENTIFIER));
    const b = getResponseKey(makeResponse("notif-1", "custom_action"));
    expect(a).not.toBe(b);
  });

  it("produces same key for same identifier + action (dedupe)", () => {
    const a = getResponseKey(makeResponse("notif-1", Notifications.DEFAULT_ACTION_IDENTIFIER));
    const b = getResponseKey(makeResponse("notif-1", Notifications.DEFAULT_ACTION_IDENTIFIER));
    expect(a).toBe(b);
  });
});
