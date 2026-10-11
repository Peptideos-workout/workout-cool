import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("proxy issues a real HTTP 307 to PeptideOS SSO for signed-out visitors", () => {
  const proxy = read("proxy.ts");
  assert.match(proxy, /shouldRedirectSignedOutRequest|isSignedOutAllowlistedPath/);
  assert.match(proxy, /peptideOsSignedOutRedirectLocation/);
  assert.match(proxy, /getSessionCookie/);
  assert.match(proxy, /NextResponse\.redirect/);
  assert.match(proxy, /307/);
  assert.doesNotMatch(proxy, /link-peptideos/);
});

test("Better Auth catch-all blocks email and Google sign-in with the generic blocked body", () => {
  const src = read("app/api/auth/[...all]/route.ts");
  assert.match(src, /isPublicBetterAuthSigninRequest/);
  assert.match(src, /publicSigninDisabledBody|PUBLIC_SIGNIN_DISABLED|publicSignupDisabledBody/);
  assert.match(src, /status:\s*403/);
});

test("workout-cool sign-in and sign-up pages and forms are removed", () => {
  assert.throws(() => read("app/[locale]/(app)/auth/(auth-layout)/signin/page.tsx"), /ENOENT/);
  assert.throws(() => read("app/[locale]/(app)/auth/(auth-layout)/signup/page.tsx"), /ENOENT/);
  assert.throws(() => read("src/features/auth/signin/ui/CredentialsLoginForm.tsx"), /ENOENT/);
  assert.throws(() => read("src/features/auth/ui/SignInButton.tsx"), /ENOENT/);
  assert.throws(() => read("src/features/auth/ui/SignUpButton.tsx"), /ENOENT/);
  assert.throws(() => read("src/features/auth/ui/ProviderButton.tsx"), /ENOENT/);
  assert.throws(() => read("app/[locale]/@modal/(.)auth/login/page.tsx"), /ENOENT/);
});

test("header, profile, and program prompts no longer offer workout-cool sign-in or sign-up", () => {
  const header = read("src/features/layout/Header.tsx");
  assert.doesNotMatch(header, /\/auth\/signin/);
  assert.doesNotMatch(header, /\/auth\/signup/);
  assert.match(header, /getConfiguredPeptideOsLoginUrl/);
  assert.match(header, /getConfiguredPeptideOsSignupUrl/);
  assert.match(header, /commons\.login/);
  assert.match(header, /commons\.signup/);
  assert.match(header, /ChangePasswordMenuItem/);

  const profile = read("app/[locale]/(app)/profile/page.tsx");
  assert.doesNotMatch(profile, /LocalAlert/);
  assert.match(profile, /ChangePasswordSection/);

  const programs = read("src/features/programs/ui/session-access-guard.tsx");
  assert.doesNotMatch(programs, /\/auth\/signin/);
  assert.doesNotMatch(programs, /signup_to_continue/);

  const programDetail = read("src/features/programs/ui/program-detail-page.tsx");
  assert.doesNotMatch(programDetail, /\/auth\/signin/);
  assert.match(programDetail, /getConfiguredPeptideOsSignupUrl/);

  const premium = read("src/features/premium/ui/premium-upgrade-card.tsx");
  assert.doesNotMatch(premium, /\/auth\/signin/);
});

test("robots.txt indexes public pages and disallows gated app routes", () => {
  const robots = read("app/robots.txt");
  assert.match(robots, /Allow:\s*\//);
  assert.match(robots, /Disallow:\s*\/profile/);
  assert.match(robots, /Disallow:\s*\/statistics/);
  assert.match(robots, /Disallow:\s*\/onboarding/);
  assert.match(robots, /Disallow:\s*\/admin/);
  assert.match(robots, /Disallow:\s*\/auth/);
  assert.match(robots, /Disallow:\s*\/sponsor/);
  assert.match(robots, /session/);
  assert.doesNotMatch(robots, /Disallow:\s*\/about/);
  assert.doesNotMatch(robots, /Disallow:\s*\/tools/);
  assert.doesNotMatch(robots, /Disallow:\s*\/programs\/?$/m);
});

test("public pages tolerate a missing session (no session-dependent crash)", () => {
  const header = read("src/features/layout/Header.tsx");
  assert.match(header, /!session\.data/);
  assert.match(header, /getConfiguredPeptideOsLoginUrl\(\)/);
  assert.match(header, /getConfiguredPeptideOsSignupUrl\(\)/);

  const programDetail = read("src/features/programs/ui/program-detail-page.tsx");
  assert.match(programDetail, /if \(!isAuthenticated\)/);
  assert.match(programDetail, /getConfiguredPeptideOsSignupUrl/);

  const sessionService = read("src/shared/lib/workout-session/use-workout-session.service.ts");
  assert.match(sessionService, /if \(userId\)/);
  assert.match(sessionService, /workoutSessionLocal\.getAll/);

  const home = read("app/[locale]/(app)/page.tsx");
  assert.doesNotMatch(home, /auth\.api\.getSession|redirect\(/);

  const about = read("app/[locale]/(app)/about/page.tsx");
  assert.doesNotMatch(about, /auth\.api\.getSession|redirect\(/);
});

test("sitemap includes public marketing pages and excludes gated session routes", () => {
  const sitemap = read("app/sitemap.ts");
  assert.match(sitemap, /\/about/);
  assert.match(sitemap, /\/tools/);
  assert.match(sitemap, /\/programs/);
  assert.match(sitemap, /\/premium/);
  assert.match(sitemap, /\/leaderboard/);
  assert.match(sitemap, /\/legal\/privacy/);
  assert.doesNotMatch(sitemap, /\/session\//);
  assert.doesNotMatch(sitemap, /\/profile/);
  assert.doesNotMatch(sitemap, /\/statistics/);
});
