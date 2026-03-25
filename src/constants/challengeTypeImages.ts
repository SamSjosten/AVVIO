import type { ImageSourcePropType } from "react-native";
import type { ChallengeType } from "@/types/database-helpers";

const CHALLENGE_TYPE_IMAGE_SETS: Record<ChallengeType, ImageSourcePropType[]> = {
  steps: [
    require("../../assets/images/challenge-types/steps_1.jpg"),
    require("../../assets/images/challenge-types/steps_2.jpg"),
    require("../../assets/images/challenge-types/steps_3.jpg"),
    require("../../assets/images/challenge-types/steps_4.jpg"),
    require("../../assets/images/challenge-types/steps_5.jpg"),
  ],
  workouts: [
    require("../../assets/images/challenge-types/workouts_1.jpg"),
    require("../../assets/images/challenge-types/workouts_2.jpg"),
    require("../../assets/images/challenge-types/workouts_3.jpg"),
    require("../../assets/images/challenge-types/workouts_4.jpg"),
    require("../../assets/images/challenge-types/workouts_5.jpg"),
  ],
  distance: [
    require("../../assets/images/challenge-types/distance_1.jpg"),
    require("../../assets/images/challenge-types/distance_2.jpg"),
    require("../../assets/images/challenge-types/distance_3.jpg"),
    require("../../assets/images/challenge-types/distance_4.jpg"),
    require("../../assets/images/challenge-types/distance_5.jpg"),
  ],
  active_minutes: [
    require("../../assets/images/challenge-types/active_minutes_1.jpg"),
    require("../../assets/images/challenge-types/active_minutes_2.jpg"),
    require("../../assets/images/challenge-types/active_minutes_3.jpg"),
    require("../../assets/images/challenge-types/active_minutes_4.jpg"),
    require("../../assets/images/challenge-types/active_minutes_5.jpg"),
  ],
  custom: [
    require("../../assets/images/challenge-types/custom_1.jpg"),
    require("../../assets/images/challenge-types/custom_2.jpg"),
    require("../../assets/images/challenge-types/custom_3.jpg"),
    require("../../assets/images/challenge-types/custom_4.jpg"),
    require("../../assets/images/challenge-types/custom_5.jpg"),
  ],
  calories: [
    require("../../assets/images/challenge-types/calories_1.jpg"),
    require("../../assets/images/challenge-types/calories_2.jpg"),
    require("../../assets/images/challenge-types/calories_3.jpg"),
    require("../../assets/images/challenge-types/calories_4.jpg"),
    require("../../assets/images/challenge-types/calories_5.jpg"),
  ],
};

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getChallengeTypeImage(
  challengeType: string,
  challengeId?: string,
): ImageSourcePropType {
  const images =
    CHALLENGE_TYPE_IMAGE_SETS[challengeType as ChallengeType] ||
    CHALLENGE_TYPE_IMAGE_SETS.custom;
  if (!challengeId) return images[0];
  return images[hashId(challengeId) % images.length];
}

export { CHALLENGE_TYPE_IMAGE_SETS };
