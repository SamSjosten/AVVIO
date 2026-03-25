// src/components/shared/ProgressBar.tsx
// Animated progress bar with variant colors

import React from "react";
import { View, Animated, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { radius } from "@/constants/theme";
import { useAppTheme } from "@/providers/ThemeProvider";

export interface ProgressBarProps {
  progress: number; // 0-100
  variant?: "primary" | "energy" | "achievement" | "gradient";
  size?: "small" | "medium" | "large";
  animated?: boolean;
}

export function ProgressBar({
  progress,
  variant = "primary",
  size = "medium",
  animated = true,
}: ProgressBarProps) {
  const { colors } = useAppTheme();
  const animatedWidth = React.useRef(new Animated.Value(0)).current;

  // Clamp progress to 0-100 range to prevent overflow
  const clampedProgress = Math.min(100, Math.max(0, progress));

  React.useEffect(() => {
    if (animated) {
      Animated.timing(animatedWidth, {
        toValue: clampedProgress,
        duration: 300,
        useNativeDriver: false,
      }).start();
    } else {
      animatedWidth.setValue(clampedProgress);
    }
  }, [animated, animatedWidth, clampedProgress]);

  const getVariantColor = () => {
    switch (variant) {
      case "gradient":
        return { bg: colors.primary.subtle, fill: null };
      case "energy":
        return { bg: colors.energy.subtle, fill: colors.energy.main };
      case "achievement":
        return { bg: colors.achievement.subtle, fill: colors.achievement.main };
      default:
        return { bg: colors.primary.subtle, fill: colors.primary.main };
    }
  };

  const getHeight = () => {
    switch (size) {
      case "small":
        return 4;
      case "large":
        return 8;
      default:
        return 6;
    }
  };

  const variantColor = getVariantColor();
  const height = getHeight();

  return (
    <View
      style={{
        height,
        backgroundColor: variantColor.bg,
        borderRadius: radius.progressBar,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={{
          height: "100%",
          borderRadius: radius.progressBar,
          width: animatedWidth.interpolate({
            inputRange: [0, 100],
            outputRange: ["0%", "100%"],
          }),
          overflow: "hidden",
          backgroundColor: variant === "gradient" ? "transparent" : variantColor.fill || "transparent",
        }}
      >
        {variant === "gradient" ? (
          <LinearGradient
            colors={[colors.primary.main, colors.energy.main]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
      </Animated.View>
    </View>
  );
}
