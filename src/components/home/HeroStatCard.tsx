// src/components/home/HeroStatCard.tsx
// Featured challenge hero card with image background and gradient overlay
//
// Promoted from activeChallenges[0] (ending soonest). Shows:
// - Full-width challenge-type background image
// - Dark gradient overlay for text legibility
// - Frosted progress disc with animated counting stat
// - Challenge title and meta (days left, participant count)

import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ImageBackground } from "react-native";
import {
  useSharedValue,
  useAnimatedReaction,
  runOnJS,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { router } from "expo-router";
import { useAppTheme } from "@/providers/ThemeProvider";
import { getDaysRemaining } from "@/lib/serverTime";
import { getChallengeTypeImage } from "@/constants/challengeTypeImages";
import type { ChallengeWithParticipation } from "@/services/challenges";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CARD_HEIGHT = 140;
const DISC_SIZE = 48;

const COUNTER_DURATION_MS = 2000;
const COUNTER_DELAY_MS = 300;

// ============================================================================
// TYPES
// ============================================================================

export interface HeroStatCardProps {
  challenge: ChallengeWithParticipation;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Animated number counter using reanimated shared values (UI thread).
 */
function AnimatedCounter({
  end,
  duration = COUNTER_DURATION_MS,
  style,
}: {
  end: number;
  duration?: number;
  style: object;
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const isFirstMount = React.useRef(true);
  const animatedValue = useSharedValue(0);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      animatedValue.value = 0;
      animatedValue.value = withDelay(
        COUNTER_DELAY_MS,
        withTiming(end, {
          duration,
          easing: Easing.out(Easing.cubic),
        }),
      );
    } else {
      animatedValue.value = end;
      setDisplayValue(end);
    }
  }, [end, duration]);

  useAnimatedReaction(
    () => Math.floor(animatedValue.value),
    (current, previous) => {
      if (current !== previous) {
        runOnJS(setDisplayValue)(current);
      }
    },
  );

  return <Text style={style}>{displayValue.toLocaleString()}</Text>;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function HeroStatCard({ challenge }: HeroStatCardProps) {
  const { shadows, spacing, radius } = useAppTheme();

  // Derived values
  const progress = challenge.my_participation?.current_progress || 0;
  const daysLeft = getDaysRemaining(challenge.end_date);
  const participantCount = challenge.participant_count || 1;
  const imageSource = getChallengeTypeImage(challenge.challenge_type, challenge.id);

  // Navigation
  const handlePress = useCallback(() => {
    router.push(`/challenge/${challenge.id}`);
  }, [challenge.id]);

  const cardRadius = radius["2xl"];

  return (
    // Outer view: shadow (needs overflow visible)
    <View style={shadows.card}>
      {/* Inner view: clipping (overflow hidden) */}
      <View style={{ borderRadius: cardRadius, overflow: "hidden" }}>
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={`View ${challenge.title} details`}
        >
          <ImageBackground
            source={imageSource}
            style={styles.imageBackground}
            resizeMode="cover"
          >
            {/* Frosted glass bar at bottom */}
            <View style={[styles.frostedBar, { paddingHorizontal: spacing.md, paddingVertical: spacing.sm }]}>
              {/* Progress disc */}
              <View style={styles.disc}>
                <AnimatedCounter end={progress} style={styles.discValue} />
              </View>

              {/* Challenge info — stacked to the right of disc */}
              <View style={styles.infoColumn}>
                <Text style={styles.title} numberOfLines={1}>
                  {challenge.title}
                </Text>
                <Text style={styles.meta}>
                  {daysLeft} day{daysLeft !== 1 ? "s" : ""} left · {participantCount} participant
                  {participantCount !== 1 ? "s" : ""}
                </Text>
              </View>
            </View>
          </ImageBackground>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  imageBackground: {
    height: CARD_HEIGHT,
    justifyContent: "flex-end",
  },

  // Frosted glass bar — semi-transparent overlay
  frostedBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(40,40,40,0.55)",
    gap: 12,
  },

  // Progress disc — frosted dark circle
  disc: {
    width: DISC_SIZE,
    height: DISC_SIZE,
    borderRadius: DISC_SIZE / 2,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 2.5,
    borderColor: "rgba(255,255,255,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  discValue: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#FFFFFF",
  },

  // Info column (title + meta stacked)
  infoColumn: {
    flex: 1,
    gap: 1,
  },

  // Text
  title: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  meta: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "rgba(255,255,255,0.75)",
  },
});
