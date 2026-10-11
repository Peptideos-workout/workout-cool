import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("Better Auth blocks public email signup and OAuth new-user creation", () => {
  const src = read("src/features/auth/lib/better-auth.ts");
  assert.match(src, /isBetterAuthEmailSignUpPath/);
  assert.match(src, /isPublicSignupBlocked/);
  assert.match(src, /shouldAllowBetterAuthUserCreate/);
  assert.match(src, /disableImplicitSignUp:\s*true/);
  assert.match(src, /accountLinking/);
  assert.doesNotMatch(src, /trustedProviders:\s*\[["']google["']\]/);
});

test("SSO create-user path still calls signUpEmail inside the allowlisted context", () => {
  const src = read("app/api/peptideos-wc-sso/route.ts");
  assert.match(src, /runWithSsoSignupAllowed/);
  assert.match(src, /auth\.api\.signUpEmail/);
  assert.match(src, /createPeptideosAccount/);
  assert.match(src, /newUnusedSsoPassword/);
});

test("public signup HTTP surfaces are blocked or redirected to PeptideOS", () => {
  const action = read("src/features/auth/signup/model/signup.action.ts");
  const api = read("app/api/auth/signup/route.ts");
  const page = read("app/[locale]/(app)/auth/(auth-layout)/signup/page.tsx");

  assert.match(action, /isPublicSignupBlocked/);
  assert.match(action, /PUBLIC_SIGNUP_DISABLED/);
  assert.doesNotMatch(action, /auth\.api\.signUpEmail/);

  assert.match(api, /isPublicSignupBlocked/);
  assert.match(api, /PUBLIC_SIGNUP_DISABLED/);
  assert.doesNotMatch(api, /auth\.api\.signUpEmail/);

  assert.match(page, /redirect\(/);
  assert.match(page, /resolvePeptideOsSignupUrl/);
  assert.doesNotMatch(page, /SignUpForm/);
});
