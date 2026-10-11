import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("Better Auth Google config blocks OAuth new-user creation and email-match linking", () => {
  const src = read("src/features/auth/lib/better-auth.ts");
  assert.match(src, /disableImplicitSignUp:\s*true/);
  assert.match(src, /disableSignUp:\s*true/);
  assert.match(src, /google:\s*\{[\s\S]*enabled:\s*false/);
  assert.match(src, /autoSignInAfterVerification:\s*false/);
  assert.match(src, /accountLinking/);
  assert.match(src, /databaseHooks/);
  assert.match(src, /shouldAllowBetterAuthUserCreate/);
  assert.match(src, /shouldAllowOAuthNewUser/);
  assert.match(src, /allowBetterAuthUserCreate|isSsoUserCreateAllowed/);
  assert.doesNotMatch(src, /trustedProviders:\s*\[["']google["']\]/);
  assert.doesNotMatch(src, /sendResetPassword/);
  assert.doesNotMatch(src, /ResetPasswordEmail/);
});

test("SSO create-user wraps only signUpEmail with the in-process ALS flag", () => {
  const src = read("app/api/peptideos-wc-sso/route.ts");
  assert.match(src, /runWithSsoUserCreate\s*\(\s*\(\s*\)\s*=>\s*auth\.api\.signUpEmail/);
  assert.match(src, /createPeptideosAccount/);
  assert.match(src, /newUnusedSsoPassword/);
  assert.doesNotMatch(src, /public-signup-guard/);
  assert.doesNotMatch(src, /x-sso|x-allow-signup/i);
});

test("Better Auth HTTP catch-all blocks public email signup paths", () => {
  const src = read("app/api/auth/[...all]/route.ts");
  assert.match(src, /isPublicBetterAuthSignupRequest/);
  assert.match(src, /isUndecodableBetterAuthPath/);
  assert.match(src, /publicSignupDisabledBody/);
  assert.match(src, /isBetterAuthPasswordResetRequest/);
  assert.match(src, /status:\s*200/);
  assert.match(src, /passwordResetDisabledBody|ok:\s*true/);
});

test("Better Auth account.create hook blocks credential rows outside SSO", () => {
  const src = read("src/features/auth/lib/better-auth.ts");
  assert.match(src, /account:\s*\{[\s\S]*create:\s*\{[\s\S]*before:/);
  assert.match(src, /shouldAllowCredentialAccountCreate/);
  assert.match(src, /providerId/);
  assert.match(src, /isSsoUserCreateAllowed/);
});

test("workout-cool forgot/reset UI and routes are removed", () => {
  assert.throws(() => read("app/[locale]/(app)/auth/(auth-layout)/forgot-password/page.tsx"), /ENOENT/);
  assert.throws(() => read("app/[locale]/(app)/auth/(auth-layout)/reset-password/page.tsx"), /ENOENT/);
  assert.throws(() => read("src/features/auth/forgot-password/ui/forgot-password-form.tsx"), /ENOENT/);
  assert.throws(() => read("src/features/auth/reset-password/ui/reset-password-form.tsx"), /ENOENT/);
  assert.throws(() => read("src/features/auth/signin/ui/CredentialsLoginForm.tsx"), /ENOENT/);
});

test("NO_CREDENTIAL_ACCOUNT is defined in every locale", () => {
  for (const locale of ["en", "fr", "es", "zh-CN", "ru", "pt"]) {
    const src = read(`locales/${locale}.ts`);
    assert.match(src, /NO_CREDENTIAL_ACCOUNT:/, locale);
  }
});

test("public signup HTTP surfaces are blocked or redirected to PeptideOS", () => {
  const action = read("src/features/auth/signup/model/signup.action.ts");
  const api = read("app/api/auth/signup/route.ts");

  assert.match(action, /PUBLIC_SIGNUP_DISABLED/);
  assert.doesNotMatch(action, /auth\.api\.signUpEmail/);
  assert.doesNotMatch(action, /isPublicSignupBlocked/);

  assert.match(api, /PUBLIC_SIGNUP_DISABLED|publicSignupDisabledBody/);
  assert.doesNotMatch(api, /auth\.api\.signUpEmail/);
  assert.doesNotMatch(api, /isPublicSignupBlocked/);

  assert.throws(() => read("app/[locale]/(app)/auth/(auth-layout)/signup/page.tsx"), /ENOENT/);
});

test("dead SignUpForm source is removed", () => {
  assert.throws(() => read("src/features/auth/signup/ui/signup-form.tsx"), /ENOENT/);
});

test("legacy local password update is removed", () => {
  assert.throws(() => read("src/features/update-password/model/update-password.action.ts"), /ENOENT/);
  assert.throws(() => read("src/features/update-password/ui/password-form.tsx"), /ENOENT/);
  assert.throws(() => read("app/api/user/password/route.ts"), /ENOENT/);
});
