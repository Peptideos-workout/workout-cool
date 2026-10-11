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
  assert.match(src, /accountLinking/);
  assert.doesNotMatch(src, /trustedProviders:\s*\[["']google["']\]/);
  assert.doesNotMatch(src, /databaseHooks/);
  assert.doesNotMatch(src, /runWithSsoSignupAllowed/);
});

test("SSO create-user path is unchanged and not wrapped by this cutover", () => {
  const src = read("app/api/peptideos-wc-sso/route.ts");
  assert.match(src, /auth\.api\.signUpEmail/);
  assert.match(src, /createPeptideosAccount/);
  assert.match(src, /newUnusedSsoPassword/);
  assert.doesNotMatch(src, /runWithSsoSignupAllowed/);
  assert.doesNotMatch(src, /public-signup-guard/);
});

test("Better Auth HTTP catch-all blocks public email signup paths", () => {
  const src = read("app/api/auth/[...all]/route.ts");
  assert.match(src, /isPublicBetterAuthSignupRequest/);
  assert.match(src, /publicSignupDisabledBody/);
});

test("public signup HTTP surfaces are blocked or redirected to PeptideOS", () => {
  const action = read("src/features/auth/signup/model/signup.action.ts");
  const api = read("app/api/auth/signup/route.ts");
  const page = read("app/[locale]/(app)/auth/(auth-layout)/signup/page.tsx");

  assert.match(action, /PUBLIC_SIGNUP_DISABLED/);
  assert.doesNotMatch(action, /auth\.api\.signUpEmail/);
  assert.doesNotMatch(action, /isPublicSignupBlocked/);

  assert.match(api, /PUBLIC_SIGNUP_DISABLED|publicSignupDisabledBody/);
  assert.doesNotMatch(api, /auth\.api\.signUpEmail/);
  assert.doesNotMatch(api, /isPublicSignupBlocked/);

  assert.match(page, /redirect\(/);
  assert.match(page, /resolvePeptideOsSignupUrl/);
  assert.doesNotMatch(page, /SignUpForm/);
});
