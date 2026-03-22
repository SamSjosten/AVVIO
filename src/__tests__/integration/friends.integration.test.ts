// src/__tests__/integration/friends.integration.test.ts
// Integration tests for friends RLS - directional model enforcement

import {
  validateTestConfig,
  getTestUser1,
  getTestUser2,
  createServiceClient,
  type TestUser,
} from "./setup";

beforeAll(() => {
  validateTestConfig();
});

// Helper to assert non-null ID in tests
function requireId(id: string | null): string {
  if (!id) throw new Error("Expected non-null id in test");
  return id;
}

describe("Friends RLS Integration Tests", () => {
  let user1: TestUser;
  let user2: TestUser;
  let friendshipId: string | null = null;

  beforeAll(async () => {
    user1 = await getTestUser1();
    user2 = await getTestUser2();
  }, 30000);

  afterEach(async () => {
    // Cleanup any created friendships
    if (friendshipId) {
      const serviceClient = createServiceClient();
      await serviceClient.from("friends").delete().eq("id", friendshipId);
      friendshipId = null;
    }
  });

  afterAll(async () => {
    // Guard against beforeAll failure
    if (!user1?.id || !user2?.id) return;

    // Final cleanup - remove any friendships between test users
    const serviceClient = createServiceClient();
    await serviceClient
      .from("friends")
      .delete()
      .or(
        `and(requested_by.eq.${user1.id},requested_to.eq.${user2.id}),and(requested_by.eq.${user2.id},requested_to.eq.${user1.id})`,
      );
  });

  describe("Friend request creation", () => {
    it("should allow user to send friend request", async () => {
      const { data, error } = await user1.client
        .from("friends")
        .insert({
          requested_by: user1.id,
          requested_to: user2.id,
          status: "pending",
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.requested_by).toBe(user1.id);
      expect(data?.requested_to).toBe(user2.id);
      expect(data?.status).toBe("pending");

      friendshipId = data?.id ?? null;
    });

    it("should reject friend request with wrong requested_by", async () => {
      // User1 tries to create request "from" user2
      const { error } = await user1.client.from("friends").insert({
        requested_by: user2.id, // Wrong! Should be user1.id
        requested_to: user1.id,
        status: "pending",
      });

      expect(error).not.toBeNull();
      // RLS should reject this
    });

    it("should reject friend request with non-pending status", async () => {
      // Try to insert as already accepted (bypassing pending state)
      const { error } = await user1.client.from("friends").insert({
        requested_by: user1.id,
        requested_to: user2.id,
        status: "accepted", // Should be rejected - must start as pending
      });

      expect(error).not.toBeNull();
    });

    it("should prevent self-friend request", async () => {
      const { error } = await user1.client.from("friends").insert({
        requested_by: user1.id,
        requested_to: user1.id,
        status: "pending",
      });

      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/friends_no_self_request|constraint/i);
    });

    it("should prevent duplicate friend requests", async () => {
      // First request
      const { data: first, error: firstError } = await user1.client
        .from("friends")
        .insert({
          requested_by: user1.id,
          requested_to: user2.id,
          status: "pending",
        })
        .select()
        .single();

      expect(firstError).toBeNull();
      friendshipId = first?.id ?? null;

      // Second request (same direction)
      const { error: secondError } = await user1.client.from("friends").insert({
        requested_by: user1.id,
        requested_to: user2.id,
        status: "pending",
      });

      expect(secondError).not.toBeNull();
      expect(secondError?.message).toMatch(/duplicate|unique|already exists/i);
    });

    it("should prevent bidirectional duplicate (A→B when B→A exists)", async () => {
      // User1 sends request to user2
      const { data: first, error: firstError } = await user1.client
        .from("friends")
        .insert({
          requested_by: user1.id,
          requested_to: user2.id,
          status: "pending",
        })
        .select()
        .single();

      expect(firstError).toBeNull();
      friendshipId = first?.id ?? null;

      // User2 tries to send request to user1 (reverse direction)
      const { error: reverseError } = await user2.client.from("friends").insert({
        requested_by: user2.id,
        requested_to: user1.id,
        status: "pending",
      });

      expect(reverseError).not.toBeNull();
      // Should fail due to friends_unique_pair_bidirectional index
    });
  });

  describe("Friend request acceptance (recipient-only)", () => {
    beforeEach(async () => {
      // Create a pending friend request from user1 to user2
      const { data, error } = await user1.client
        .from("friends")
        .insert({
          requested_by: user1.id,
          requested_to: user2.id,
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;
      friendshipId = data.id;
    });

    it("should allow recipient to accept friend request", async () => {
      const id = requireId(friendshipId);

      const { error } = await user2.client
        .from("friends")
        .update({ status: "accepted" })
        .eq("id", id);

      expect(error).toBeNull();

      // Verify the update
      const { data } = await user2.client.from("friends").select().eq("id", id).single();

      expect(data?.status).toBe("accepted");
    });

    it("should prevent requester from accepting their own request", async () => {
      const id = requireId(friendshipId);

      // User1 (requester) tries to accept
      const { error } = await user1.client
        .from("friends")
        .update({ status: "accepted" })
        .eq("id", id);

      // RLS should reject this - only recipient can update
      // The update should either fail or have no effect
      const { data } = await user1.client.from("friends").select().eq("id", id).single();

      // Status should still be pending (update had no effect due to RLS)
      expect(data?.status).toBe("pending");
    });

    it("should allow recipient to block", async () => {
      const id = requireId(friendshipId);

      const { error } = await user2.client
        .from("friends")
        .update({ status: "blocked" })
        .eq("id", id);

      expect(error).toBeNull();

      const { data } = await user2.client.from("friends").select().eq("id", id).single();

      expect(data?.status).toBe("blocked");
    });
  });

  describe("Friend deletion (either party)", () => {
    beforeEach(async () => {
      // Create an accepted friendship
      const { data, error } = await user1.client
        .from("friends")
        .insert({
          requested_by: user1.id,
          requested_to: user2.id,
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;

      friendshipId = data.id;
      const id = requireId(friendshipId);

      // Accept it
      await user2.client.from("friends").update({ status: "accepted" }).eq("id", id);
    });

    it("should allow requester to delete friendship", async () => {
      const id = requireId(friendshipId);

      const { error } = await user1.client.from("friends").delete().eq("id", id);

      expect(error).toBeNull();

      // Verify deleted
      const { data } = await user1.client.from("friends").select().eq("id", id).maybeSingle();

      expect(data).toBeNull();
      friendshipId = null; // Prevent afterEach cleanup
    });

    it("should allow recipient to delete friendship", async () => {
      const id = requireId(friendshipId);

      const { error } = await user2.client.from("friends").delete().eq("id", id);

      expect(error).toBeNull();

      // Verify deleted
      const { data } = await user2.client.from("friends").select().eq("id", id).maybeSingle();

      expect(data).toBeNull();
      friendshipId = null;
    });
  });

  describe("Friend visibility", () => {
    it("should only show friendships user is part of", async () => {
      // Create friendship between user1 and user2
      const { data: friendship } = await user1.client
        .from("friends")
        .insert({
          requested_by: user1.id,
          requested_to: user2.id,
          status: "pending",
        })
        .select()
        .single();

      friendshipId = friendship?.id ?? null;
      const id = requireId(friendshipId);

      // User1 should see it
      const { data: user1Friends } = await user1.client.from("friends").select().eq("id", id);

      expect(user1Friends?.length).toBe(1);

      // User2 should see it
      const { data: user2Friends } = await user2.client.from("friends").select().eq("id", id);

      expect(user2Friends?.length).toBe(1);
    });
  });
});

// =============================================================================
// ATOMIC FRIEND REQUEST RPC TESTS (migration 043)
// =============================================================================

describe("Atomic friend request RPC", () => {
  let user1: TestUser;
  let user2: TestUser;

  beforeAll(async () => {
    user1 = await getTestUser1();
    user2 = await getTestUser2();
  }, 30000);

  afterEach(async () => {
    // Cleanup any friend rows between test users
    const serviceClient = createServiceClient();
    await serviceClient
      .from("friends")
      .delete()
      .or(
        `and(requested_by.eq.${user1.id},requested_to.eq.${user2.id}),and(requested_by.eq.${user2.id},requested_to.eq.${user1.id})`,
      );
    // Cleanup notifications
    await serviceClient
      .from("notifications")
      .delete()
      .eq("user_id", user2.id)
      .eq("type", "friend_request_received");
  });

  it("should create friend row and notification atomically", async () => {
    const { error } = await user1.client.rpc("send_friend_request", {
      p_target_user_id: user2.id,
    });

    expect(error).toBeNull();

    // Verify friend row exists
    const { data: friends } = await user1.client
      .from("friends")
      .select()
      .eq("requested_by", user1.id)
      .eq("requested_to", user2.id);

    expect(friends?.length).toBe(1);
    expect(friends?.[0]?.status).toBe("pending");

    // Verify notification exists (use service client to bypass RLS)
    const serviceClient = createServiceClient();
    const { data: notifications } = await serviceClient
      .from("notifications")
      .select()
      .eq("user_id", user2.id)
      .eq("type", "friend_request_received");

    expect(notifications).not.toBeNull();
    expect(notifications?.length).toBeGreaterThanOrEqual(1);
  });

  it("should reject self-request with self_request", async () => {
    const { error } = await user1.client.rpc("send_friend_request", {
      p_target_user_id: user1.id,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain("self_request");
  });

  it("should reject duplicate request with already_exists", async () => {
    // First request succeeds
    const { error: firstError } = await user1.client.rpc("send_friend_request", {
      p_target_user_id: user2.id,
    });
    expect(firstError).toBeNull();

    // Second request should fail
    const { error } = await user1.client.rpc("send_friend_request", {
      p_target_user_id: user2.id,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain("already_exists");
  });
});

// =============================================================================
// FRIEND ACTION RPC TESTS (migration 045)
// =============================================================================

describe("Friend action RPCs", () => {
  let user1: TestUser;
  let user2: TestUser;

  beforeAll(async () => {
    user1 = await getTestUser1();
    user2 = await getTestUser2();
  }, 30000);

  afterEach(async () => {
    const serviceClient = createServiceClient();
    await serviceClient
      .from("friends")
      .delete()
      .or(
        `and(requested_by.eq.${user1.id},requested_to.eq.${user2.id}),and(requested_by.eq.${user2.id},requested_to.eq.${user1.id})`,
      );
    await serviceClient
      .from("notifications")
      .delete()
      .eq("user_id", user2.id)
      .eq("type", "friend_request_received");
  });

  it("accept_friend_request sets status to accepted and marks notification read", async () => {
    // Setup: create pending request via RPC
    const { error: sendError } = await user1.client.rpc("send_friend_request", {
      p_target_user_id: user2.id,
    });
    expect(sendError).toBeNull();

    // Get friendship ID
    const { data: friendRows } = await user2.client
      .from("friends")
      .select("id")
      .eq("requested_by", user1.id)
      .eq("requested_to", user2.id)
      .single();
    expect(friendRows).not.toBeNull();

    // Accept via RPC
    const { error: acceptError } = await user2.client.rpc("accept_friend_request", {
      p_friendship_id: friendRows!.id,
    });
    expect(acceptError).toBeNull();

    // Verify status
    const { data: accepted } = await user2.client
      .from("friends")
      .select("status")
      .eq("id", friendRows!.id)
      .single();
    expect(accepted?.status).toBe("accepted");

    // Verify trigger-driven notification cleanup: friend_request_received should be marked read
    const serviceClient = createServiceClient();
    const { data: notifications } = await serviceClient
      .from("notifications")
      .select("read_at, type")
      .eq("user_id", user2.id)
      .eq("type", "friend_request_received");
    expect(notifications).not.toBeNull();
    const matchingNotif = notifications?.find((n: any) => n.type === "friend_request_received");
    expect(matchingNotif).toBeDefined();
    expect(matchingNotif!.read_at).not.toBeNull();
  });

  it("decline_friend_request removes the row and marks notification read", async () => {
    const { error: sendError } = await user1.client.rpc("send_friend_request", {
      p_target_user_id: user2.id,
    });
    expect(sendError).toBeNull();

    const { data: friendRows } = await user2.client
      .from("friends")
      .select("id")
      .eq("requested_by", user1.id)
      .eq("requested_to", user2.id)
      .single();
    expect(friendRows).not.toBeNull();

    // Verify notification exists before decline
    const serviceClient = createServiceClient();
    const { data: preNotifs } = await serviceClient
      .from("notifications")
      .select("id, read_at")
      .eq("user_id", user2.id)
      .eq("type", "friend_request_received");
    const preNotif = preNotifs?.find((n: any) => n.read_at === null);
    expect(preNotif).toBeDefined();

    const { error: declineError } = await user2.client.rpc("decline_friend_request", {
      p_friendship_id: friendRows!.id,
    });
    expect(declineError).toBeNull();

    // Verify deleted
    const { data: gone } = await user2.client
      .from("friends")
      .select("id")
      .eq("id", friendRows!.id)
      .maybeSingle();
    expect(gone).toBeNull();

    // Verify notification marked read by trigger
    const { data: postNotifs } = await serviceClient
      .from("notifications")
      .select("read_at")
      .eq("id", preNotif!.id)
      .single();
    expect(postNotifs?.read_at).not.toBeNull();
  });

  it("remove_friend deletes accepted friendship", async () => {
    // Setup: create and accept
    const { error: sendError } = await user1.client.rpc("send_friend_request", {
      p_target_user_id: user2.id,
    });
    expect(sendError).toBeNull();

    const { data: friendRows } = await user2.client
      .from("friends")
      .select("id")
      .eq("requested_by", user1.id)
      .eq("requested_to", user2.id)
      .single();

    await user2.client.rpc("accept_friend_request", {
      p_friendship_id: friendRows!.id,
    });

    // Remove via RPC (user1 = requester can remove)
    const { error: removeError } = await user1.client.rpc("remove_friend", {
      p_friendship_id: friendRows!.id,
    });
    expect(removeError).toBeNull();

    // Verify gone
    const { data: gone } = await user1.client
      .from("friends")
      .select("id")
      .eq("id", friendRows!.id)
      .maybeSingle();
    expect(gone).toBeNull();
  });

  it("non-recipient cannot accept friend request", async () => {
    const { error: sendError } = await user1.client.rpc("send_friend_request", {
      p_target_user_id: user2.id,
    });
    expect(sendError).toBeNull();

    const serviceClient = createServiceClient();
    const { data: friendRows } = await serviceClient
      .from("friends")
      .select("id")
      .eq("requested_by", user1.id)
      .eq("requested_to", user2.id)
      .single();

    // User1 (requester) tries to accept — should fail
    const { error: acceptError } = await user1.client.rpc("accept_friend_request", {
      p_friendship_id: friendRows!.id,
    });
    expect(acceptError).not.toBeNull();
    expect(acceptError?.message).toContain("friend_request_not_found");
  });
});
