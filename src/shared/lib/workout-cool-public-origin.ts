/** Production workout-cool origin used by robots, sitemap, and PeptideOS pairing. */
export const DEFAULT_WORKOUT_COOL_ORIGIN = "https://workouts.peptideos.us";

export function workoutCoolPublicOrigin(appUrl?: string): string {
  const raw = appUrl?.trim();
  if (!raw) {
    return DEFAULT_WORKOUT_COOL_ORIGIN;
  }

  return new URL(raw).origin;
}
