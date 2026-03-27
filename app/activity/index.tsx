// app/activity/index.tsx
// Activity History Screen - Lists all user activities
// Design System v2.0

import React, { useState, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { router, useFocusEffect, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppTheme } from "@/providers/ThemeProvider";
import { useRecentActivities, toDisplayActivity, getActivityTypeName } from "@/hooks/useActivities";
import { LoadingState, EmptyState } from "@/components/shared";
import { ActivityListItem, ActivityRunSummary } from "@/components/shared/ActivityCard";
import { ChevronLeftIcon } from "react-native-heroicons/outline";
import { groupActivitiesByDate, buildActivityRenderModel } from "@/lib/activityGrouping";
import type { RenderItem } from "@/lib/activityGrouping";
import type { ActivityType } from "@/components/icons/ActivityIcons";

export default function ActivityHistoryScreen() {
  const { colors, spacing, radius } = useAppTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());

  const { data: activities, isLoading, refetch } = useRecentActivities(50);

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  // Transform and group activities
  const displayActivities = useMemo(() => {
    if (!activities) return [];
    return activities.map(toDisplayActivity);
  }, [activities]);

  const groupedActivities = useMemo(() => {
    return groupActivitiesByDate(displayActivities);
  }, [displayActivities]);

  // Build render model per group
  const groupedRenderItems = useMemo(() => {
    const result: Record<string, RenderItem[]> = {};
    for (const [group, items] of Object.entries(groupedActivities)) {
      result[group] = buildActivityRenderModel(items);
    }
    return result;
  }, [groupedActivities]);

  // Get ordered group keys (most recent first)
  const groupOrder = useMemo(() => {
    const keys = Object.keys(groupedActivities);
    return keys.sort((a, b) => {
      if (a === "Today") return -1;
      if (b === "Today") return 1;
      if (a === "Yesterday") return -1;
      if (b === "Yesterday") return 1;
      const dateA = new Date(groupedActivities[a][0].recorded_at);
      const dateB = new Date(groupedActivities[b][0].recorded_at);
      return dateB.getTime() - dateA.getTime();
    });
  }, [groupedActivities]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleActivityPress = (activityId: string) => {
    router.push(`/activity/${activityId}`);
  };

  const toggleRun = useCallback((runKey: string) => {
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(runKey)) {
        next.delete(runKey);
      } else {
        next.add(runKey);
      }
      return next;
    });
  }, []);

  // Loading state
  if (isLoading && !activities) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={["top"]}
      >
        <Stack.Screen
          options={{
            headerShown: false,
          }}
        />
        <LoadingState variant="content" message="Loading activity history..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Activity History</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Activity list */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary.main}
          />
        }
      >
        {!activities || activities.length === 0 ? (
          <View style={{ padding: spacing.lg }}>
            <EmptyState
              variant="generic"
              title="No Activity Yet"
              message="Your workout history will appear here after you log some activity"
            />
          </View>
        ) : (
          <>
            {groupOrder.map((group) => {
              const renderItems = groupedRenderItems[group];
              if (!renderItems || renderItems.length === 0) return null;

              return (
                <View key={group} style={{ marginTop: spacing.md }}>
                  {/* Group header */}
                  <Text
                    style={[
                      styles.groupHeader,
                      {
                        color: colors.textSecondary,
                        paddingHorizontal: spacing.lg,
                        marginBottom: spacing.sm,
                      },
                    ]}
                  >
                    {group.toUpperCase()}
                  </Text>

                  {/* Activity items */}
                  <View
                    style={[
                      styles.activityGroup,
                      {
                        backgroundColor: colors.surface,
                        marginHorizontal: spacing.lg,
                        borderRadius: radius.xl,
                        overflow: "hidden",
                      },
                    ]}
                  >
                    {renderItems.map((item, index) => {
                      const isLast = index === renderItems.length - 1;

                      if (item.kind === "single") {
                        return (
                          <ActivityListItem
                            key={item.activity.id}
                            type={item.activity.activity_type as ActivityType}
                            name={item.activity.name}
                            value={item.activity.value}
                            unit={item.activity.unit}
                            recordedAt={new Date(item.activity.recorded_at)}
                            onPress={() => handleActivityPress(item.activity.id)}
                            showBorder={!isLast}
                          />
                        );
                      }

                      // collapsedRun
                      const isExpanded = expandedRuns.has(item.runKey);
                      return (
                        <View key={item.runKey}>
                          <ActivityRunSummary
                            type={item.type as ActivityType}
                            name={getActivityTypeName(item.type)}
                            totalValue={item.totalValue}
                            unit={item.unit}
                            expanded={isExpanded}
                            onToggle={() => toggleRun(item.runKey)}
                            showBorder={!isLast || isExpanded}
                          />
                          {isExpanded &&
                            item.activities.map((child, childIdx) => (
                              <ActivityListItem
                                key={child.id}
                                type={child.activity_type as ActivityType}
                                name={child.name}
                                value={child.value}
                                unit={child.unit}
                                recordedAt={new Date(child.recorded_at)}
                                onPress={() => handleActivityPress(child.id)}
                                showBorder={
                                  childIdx < item.activities.length - 1 || !isLast
                                }
                              />
                            ))}
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* Bottom spacing */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  headerRight: {
    width: 32, // Balance the back button
  },
  scrollContent: {
    flexGrow: 1,
  },
  groupHeader: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  activityGroup: {},
});
