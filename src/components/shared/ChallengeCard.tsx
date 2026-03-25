import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, ImageBackground } from "react-native";
import { router } from "expo-router";
import { useAppTheme } from "@/providers/ThemeProvider";
import { useAuth } from "@/hooks/useAuth";
import { Avatar } from "./Avatar";
import { ProgressBar } from "./ProgressBar";
import { getChallengeTypeImage } from "@/constants/challengeTypeImages";
import type { ChallengeWithParticipation } from "@/services/challenges";

export interface ChallengeCardProps {
  challenge: ChallengeWithParticipation;
  variant?: "featured" | "standard";
  onPress?: () => void;
}

export interface CompletedChallengeRowProps {
  challenge: ChallengeWithParticipation;
  onPress?: () => void;
}

function getRankText(rank: number): string {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `${rank}th`;
}

function getRankMedal(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "";
}

function getRankColor(rank: number, fallback: string): string {
  if (rank === 1) return "#FFB800";
  if (rank === 2) return "#94A3B8";
  if (rank === 3) return "#CD7C2F";
  return fallback;
}

function getProgressPercent(progress: number, goalValue: number): number {
  if (goalValue <= 0) return 0;
  return Math.min((progress / goalValue) * 100, 100);
}

function formatGoalUnit(goalUnit: string): string {
  return goalUnit.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function RankBadge({
  rank,
  rankColor,
  avatarUri,
  avatarName,
}: {
  rank: number;
  rankColor: string;
  avatarUri?: string | null;
  avatarName?: string;
}) {
  return (
    <View
      style={styles.rankBadgeContainer}
      accessibilityLabel={`${getRankMedal(rank)} ${getRankText(rank)} place`}
    >
      <View style={[styles.rankBadgeCircle, { backgroundColor: rankColor }]}>
        <Text style={styles.rankBadgeText}>{getRankText(rank)}</Text>
      </View>
      <Avatar uri={avatarUri} name={avatarName} size="xs" style={styles.rankBadgeAvatar} />
    </View>
  );
}

export function ChallengeCard({ challenge, variant = "standard", onPress }: ChallengeCardProps) {
  const { colors, shadows, spacing, radius } = useAppTheme();
  const { profile } = useAuth();

  const progress = challenge.my_participation?.current_progress || 0;
  const progressPercent = getProgressPercent(progress, challenge.goal_value);
  const rank = challenge.my_rank || 1;
  const rankColor = getRankColor(rank, colors.primary.main);
  const imageSource = getChallengeTypeImage(challenge.challenge_type, challenge.id);
  const avatarName = profile?.display_name || profile?.username || "You";
  const cardPress = onPress || (() => router.push(`/challenge/${challenge.id}`));

  if (variant === "featured") {
    return (
      <TouchableOpacity
        style={[styles.cardShadow, shadows.card]}
        onPress={cardPress}
        activeOpacity={0.92}
        accessibilityRole="button"
        accessibilityLabel={`Open ${challenge.title}`}
      >
        <View
          style={[
            styles.featuredCard,
            {
              backgroundColor: colors.surface,
              borderRadius: radius["2xl"],
            },
          ]}
        >
          <Image source={imageSource} style={styles.featuredImage} resizeMode="cover" />

          <View style={[styles.featuredContent, { padding: spacing.lg }]}>
            <Text style={[styles.featuredTitle, { color: colors.textPrimary }]} numberOfLines={2}>
              {challenge.title}
            </Text>

            <ProgressBar progress={progressPercent} variant="gradient" size="large" />

            <View style={[styles.featuredStatsRow, { marginTop: spacing.md }]}>
              <View style={styles.featuredStatsText}>
                <Text style={[styles.featuredProgressValue, { color: colors.textPrimary }]}>
                  {progress.toLocaleString()}/{challenge.goal_value.toLocaleString()}
                </Text>
                <Text style={[styles.featuredProgressMeta, { color: colors.textMuted }]}>
                  {Math.round(progressPercent)}% Complete
                </Text>
              </View>

              <RankBadge
                rank={rank}
                rankColor={rankColor}
                avatarUri={profile?.avatar_url}
                avatarName={avatarName}
              />
            </View>

            <View
              style={[
                styles.featuredButton,
                {
                  backgroundColor: colors.primary.main,
                  borderRadius: radius.lg,
                  marginTop: spacing.lg,
                },
              ]}
            >
              <Text style={styles.featuredButtonText}>View Challenge</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.cardShadow, shadows.card]}
      onPress={cardPress}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`Open ${challenge.title}`}
    >
      <ImageBackground
        source={imageSource}
        style={styles.standardCard}
        imageStyle={{ borderRadius: radius["2xl"] }}
      >
        <View
          style={[
            styles.standardOverlay,
            {
              backgroundColor: colors.overlay,
              borderRadius: radius["2xl"],
              padding: spacing.lg,
            },
          ]}
        >
          <Text style={styles.standardTitle} numberOfLines={2}>
            {challenge.title}
          </Text>

          <View style={styles.standardFooter}>
            <Text style={styles.standardProgress} numberOfLines={1}>
              {progress.toLocaleString()}/{challenge.goal_value.toLocaleString()}{" "}
              {formatGoalUnit(challenge.goal_unit)}
            </Text>

            <View
              style={[
                styles.standardButton,
                {
                  backgroundColor: colors.primary.main,
                  borderRadius: radius.full,
                },
              ]}
            >
              <Text style={styles.standardButtonText}>View Challenge</Text>
            </View>
          </View>
        </View>
      </ImageBackground>
    </TouchableOpacity>
  );
}

export function CompletedChallengeRow({ challenge, onPress }: CompletedChallengeRowProps) {
  const { colors, spacing, radius } = useAppTheme();
  const rank = challenge.my_rank || 1;
  const participantCount = challenge.participant_count || 1;
  const friendCount = Math.max(0, participantCount - 1);
  const rankColor = getRankColor(rank, colors.achievement.main);
  const imageSource = getChallengeTypeImage(challenge.challenge_type, challenge.id);

  const endDate = new Date(challenge.end_date);
  const endDateStr = endDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const cardPress = onPress || (() => router.push(`/challenge/${challenge.id}`));

  return (
    <TouchableOpacity
      style={[
        styles.completedRow,
        {
          backgroundColor: colors.surface,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: colors.border,
          padding: spacing.md,
        },
      ]}
      onPress={cardPress}
      activeOpacity={0.7}
    >
      <Image source={imageSource} style={[styles.completedThumb, { borderRadius: radius.lg }]} />

      <View style={styles.completedContent}>
        <Text style={[styles.completedTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {challenge.title}
        </Text>
        <Text style={[styles.completedMeta, { color: colors.textMuted }]}>
          Ended {endDateStr} •{" "}
          {friendCount > 0 ? `${friendCount} friend${friendCount > 1 ? "s" : ""}` : "Solo"}
        </Text>
      </View>

      <Text style={[styles.completedRank, { color: rankColor }]}>{getRankText(rank)}</Text>
    </TouchableOpacity>
  );
}

export { getRankText, getRankMedal };

const styles = StyleSheet.create({
  cardShadow: {
    borderRadius: 16,
  },
  featuredCard: {
    overflow: "hidden",
  },
  featuredImage: {
    width: "100%",
    height: 180,
  },
  featuredContent: {
    gap: 14,
  },
  featuredTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  featuredStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  featuredStatsText: {
    flex: 1,
    gap: 2,
  },
  featuredProgressValue: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  featuredProgressMeta: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
  },
  featuredButton: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  featuredButtonText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#FFFFFF",
  },
  rankBadgeContainer: {
    width: 54,
    height: 54,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  rankBadgeCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  rankBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  rankBadgeAvatar: {
    position: "absolute",
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  standardCard: {
    minHeight: 160,
    justifyContent: "flex-end",
  },
  standardOverlay: {
    minHeight: 160,
    justifyContent: "space-between",
  },
  standardTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    lineHeight: 24,
    fontFamily: "PlusJakartaSans_700Bold",
    maxWidth: "82%",
  },
  standardFooter: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  standardProgress: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 18,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  standardButton: {
    minHeight: 36,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  standardButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  completedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  completedThumb: {
    width: 48,
    height: 48,
  },
  completedContent: {
    flex: 1,
  },
  completedTitle: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_600SemiBold",
    marginBottom: 4,
  },
  completedMeta: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
  },
  completedRank: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_700Bold",
  },
});
