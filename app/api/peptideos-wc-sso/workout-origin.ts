/**
 * SSO Set-Cookie / Location origin. Always the configured app URL — never Host or X-Forwarded-*.
 */
export function configuredWorkoutOrigin(betterAuthUrl?: string, nextPublicAppUrl?: string): string {
  const raw = betterAuthUrl?.trim() || nextPublicAppUrl?.trim();
  if (!raw) {
    throw new Error("BETTER_AUTH_URL or NEXT_PUBLIC_APP_URL is required for SSO redirects");
  }

  return new URL(raw).origin;
}
