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
  assert.doesNotMatch(header, /getConfiguredPeptideOsSignupUrl/);
  assert.doesNotMatch(header, /commons\.login|commons\.register/);
  assert.match(header, /ChangePasswordMenuItem/);

  const profile = read("app/[locale]/(app)/profile/page.tsx");
  assert.doesNotMatch(profile, /LocalAlert/);
  assert.match(profile, /ChangePasswordSection/);

  const programs = read("src/features/programs/ui/session-access-guard.tsx");
  assert.doesNotMatch(programs, /\/auth\/signin/);
  assert.doesNotMatch(programs, /signup_to_continue/);

  const premium = read("src/features/premium/ui/premium-upgrade-card.tsx");
  assert.doesNotMatch(premium, /\/auth\/signin/);
});
