import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppTheme } from "@/providers/ThemeProvider";
import { useActiveChallenges, useCompletedChallenges, usePendingInvites } from "@/hooks/useChallenges";
import { syncServerTime } from "@/lib/serverTime";
import {
  LoadingState,
  EmptyState,
  ChallengeCard,
  CompletedChallengeRow,
  InviteRow,
} from "@/components/shared";
import { TestIDs } from "@/constants/testIDs";

type TabType = "active" | "completed";

export default function ChallengesScreenV2() {
  const { colors, spacing } = useAppTheme();
  const [activeTab, setActiveTab] = useState<TabType>("active");
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: activeChallenges,
    isLoading: loadingActive,
    isError: activeError,
    refetch: refetchActive,
  } = useActiveChallenges();

  const {
    data: completedChallenges,
    isLoading: loadingCompleted,
    isError: completedError,
    refetch: refetchCompleted,
  } = useCompletedChallenges();

  const { data: pendingInvites, refetch: refetchPending } = usePendingInvites();

  useFocusEffect(
    useCallback(() => {
      syncServerTime().catch(() => {});
      refetchActive();
      refetchCompleted();
      refetchPending();
    }, [refetchActive, refetchCompleted, refetchPending]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchActive(), refetchCompleted(), refetchPending()]);
    setRefreshing(false);
  };

  if (loadingActive && loadingCompleted) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={["top"]}
      >
        <View style={[styles.headerContainer, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Challenges</Text>
        </View>
        <LoadingState variant="content" message="Loading challenges..." />
      </SafeAreaView>
    );
  }

  if (activeError || completedError) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={["top"]}
      >
        <View style={[styles.headerContainer, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Challenges</Text>
        </View>
        <EmptyState
          variant="generic"
          message="Failed to load challenges"
          actionLabel="Retry"
          onAction={() => {
            refetchActive();
            refetchCompleted();
            refetchPending();
          }}
        />
      </SafeAreaView>
    );
  }

  const activeCount = activeChallenges?.length || 0;
  const completedCount = completedChallenges?.length || 0;
  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top"]}
      testID={TestIDs.screensV2?.challenges || "challenges-screen-v2"}
    >
      <LinearGradient
        colors={[colors.backgroundGradient.start, colors.backgroundGradient.end]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />

      <View style={[styles.headerContainer, { backgroundColor: colors.surface }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Challenges</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { padding: spacing.lg }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary.main}
          />
        }
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScrollContent}
          style={{ marginBottom: spacing.lg }}
        >
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[
                styles.pillTab,
                {
                  backgroundColor: activeTab === "active" ? colors.primary.main : colors.surface,
                  borderColor: activeTab === "active" ? colors.primary.main : colors.border,
                },
              ]}
              onPress={() => setActiveTab("active")}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === "active" }}
              accessibilityLabel={`Active tab, ${activeCount} challenges`}
            >
              <Text
                style={[
                  styles.pillTabText,
                  { color: activeTab === "active" ? colors.textInverse : colors.textSecondary },
                ]}
              >
                Active
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.pillTab,
                {
                  backgroundColor:
                    activeTab === "completed" ? colors.primary.main : colors.surface,
                  borderColor: activeTab === "completed" ? colors.primary.main : colors.border,
                },
              ]}
              onPress={() => setActiveTab("completed")}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === "completed" }}
              accessibilityLabel={`Completed tab, ${completedCount} challenges`}
            >
              <Text
                style={[
                  styles.pillTabText,
                  {
                    color: activeTab === "completed" ? colors.textInverse : colors.textSecondary,
                  },
                ]}
              >
                Completed
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {activeTab === "active" ? (
          <View style={{ gap: spacing.sm }}>
            {pendingInvites?.map((invite) => (
              <InviteRow
                key={invite.challenge.id}
                invite={invite}
                onPress={() => router.push(`/challenge/${invite.challenge.id}`)}
              />
            ))}

            {activeCount === 0 ? (
              <EmptyState
                variant="challenges"
                actionLabel="Create Challenge"
                onAction={() => router.push("/challenge/create")}
              />
            ) : (
              activeChallenges?.map((challenge, index) => (
                <ChallengeCard
                  key={challenge.id}
                  challenge={challenge}
                  variant={index === 0 ? "featured" : "standard"}
                />
              ))
            )}
          </View>
        ) : completedCount === 0 ? (
          <EmptyState
            variant="generic"
            title="No Completed Challenges"
            message="Completed challenges will appear here after they end."
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {completedChallenges?.map((challenge) => (
              <CompletedChallengeRow key={challenge.id} challenge={challenge} />
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 24,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  scrollContent: {
    flexGrow: 1,
  },
  tabScrollContent: {
    paddingRight: 12,
  },
  tabRow: {
    flexDirection: "row",
    gap: 10,
  },
  pillTab: {
    minHeight: 42,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  pillTabText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
});
