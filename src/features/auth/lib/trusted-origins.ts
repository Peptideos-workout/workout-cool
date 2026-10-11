export function betterAuthTrustedOrigins(betterAuthUrl: string, nextPublicAppUrl: string): string[] {
  const origins = [betterAuthUrl, nextPublicAppUrl].map((raw) => new URL(raw).origin);
  return [...new Set([...origins, "workoutcool://", "expo://"])];
}
