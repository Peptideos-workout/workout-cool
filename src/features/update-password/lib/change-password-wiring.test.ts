import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("session password-change kind is computed in customSession, not via auth admin", () => {
  const src = read("src/features/auth/lib/better-auth.ts");
  assert.match(src, /resolvePasswordChangeKind/);
  assert.match(src, /peptideosHasEmailIdentity/);
  assert.match(src, /passwordChange/);
  assert.match(src, /accountId:\s*true/);
  assert.doesNotMatch(src, /service[_-]?role|updateUser|auth\.admin/i);
});

test("change-password UI is mounted for header and profile, gated by kind", () => {
  const header = read("src/features/layout/Header.tsx");
  const profile = read("app/[locale]/(app)/profile/page.tsx");
  const form = read("src/features/update-password/ui/password-form.tsx");

  assert.match(header, /ChangePasswordMenuItem|resolvePasswordChangeKind|passwordChange/);
  assert.match(profile, /ChangePasswordSection|passwordChange|PasswordForm/);
  assert.match(form, /resolvePasswordChangeKind|PASSWORD_CHANGE_KIND/);
  assert.match(form, /change_peptideos_password/);
});

test("does not add auth-admin or service-role usage anywhere in the password feature", () => {
  const action = read("src/features/update-password/model/update-password.action.ts");
  const lookup = read("src/features/update-password/lib/peptideos-has-email-identity.ts");
  assert.doesNotMatch(action, /service[_-]?role|supabase\.auth\.admin|auth\.admin/i);
  assert.doesNotMatch(lookup, /service[_-]?role|supabase\.auth\.admin|auth\.admin|\.updateUser\b/i);
  assert.match(lookup, /peptideos_has_email_identity/);
});

test("signup HTTP 307 is issued from proxy using the existing safe-return helper", () => {
  const proxy = read("proxy.ts");
  assert.match(proxy, /isWorkoutCoolSignupPath/);
  assert.match(proxy, /NextResponse\.redirect/);
  assert.match(proxy, /307/);
  assert.match(proxy, /resolvePeptideOsSignupUrl|peptideOsSignupRedirectLocation/);
});

test("PeptideOS settings URL reuses the existing origin pairing and password hash", () => {
  const src = read("src/features/auth/lib/peptideos-signup-url.ts");
  assert.match(src, /PEPTIDEOS_SETTINGS_PATH/);
  assert.match(src, /\/settings/);
  assert.match(src, /peptideOsSettingsUrl/);
  assert.match(src, /password/);
});

test("locale copy explains that the PeptideOS password is also used for workouts", () => {
  for (const locale of ["en", "fr", "es", "zh-CN", "ru", "pt"]) {
    const src = read(`locales/${locale}.ts`);
    assert.match(src, /change_password:/, locale);
    assert.match(src, /change_peptideos_password_description:/, locale);
    assert.match(src, /change_peptideos_password_cta:/, locale);
  }
  const en = read("locales/en.ts");
  assert.match(en, /PeptideOS password/);
  assert.match(en, /workouts/);
});

test("SQL helper is boolean-only, SECURITY DEFINER, and not applied from Prisma migrate", () => {
  const sql = read("docs/sql/peptideos-has-email-identity.sql");
  const rollback = read("docs/sql/peptideos-has-email-identity.rollback.sql");
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /search_path/);
  assert.match(sql, /provider\s*=\s*'email'/);
  assert.match(sql, /REVOKE ALL[\s\S]*FROM PUBLIC/);
  assert.match(sql, /GRANT EXECUTE/);
  assert.doesNotMatch(sql, /service_role/);
  assert.match(rollback, /DROP FUNCTION/);

  assert.throws(() => read("prisma/migrations/20261011211500_peptideos_has_email_identity/migration.sql"), /ENOENT/);
});

test("does not edit peptideos-wc-sso beyond the existing signup-cutover wrap", () => {
  const route = read("app/api/peptideos-wc-sso/route.ts");
  assert.doesNotMatch(route, /has_email_identity|hasEmailIdentity|passwordChange/);
});
