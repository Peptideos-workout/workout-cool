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
  const section = read("src/features/update-password/ui/change-password-section.tsx");
  const menu = read("src/features/update-password/ui/change-password-menu-item.tsx");

  assert.match(header, /ChangePasswordMenuItem|resolvePasswordChangeKind|passwordChange/);
  assert.match(profile, /ChangePasswordSection|passwordChange/);
  assert.match(section, /trustedPeptideOsHref/);
  assert.match(menu, /trustedPeptideOsHref/);
  assert.match(section, /change_peptideos_password/);
  assert.throws(() => read("src/features/update-password/ui/password-form.tsx"), /ENOENT/);
});

test("does not add auth-admin or service-role usage anywhere in the password feature", () => {
  const lookup = read("src/features/update-password/lib/peptideos-has-email-identity.ts");
  assert.doesNotMatch(lookup, /service[_-]?role|supabase\.auth\.admin|auth\.admin|\.updateUser\b/i);
  assert.match(lookup, /peptideos_has_email_identity/);
});

test("legacy credential password update surfaces are removed", () => {
  assert.throws(() => read("src/features/update-password/model/update-password.action.ts"), /ENOENT/);
  assert.throws(() => read("src/features/update-password/lib/update-credential-password.ts"), /ENOENT/);
  assert.throws(() => read("app/api/user/password/route.ts"), /ENOENT/);
});

test("signed-out visitors get an HTTP 307 from proxy using the PeptideOS SSO helper", () => {
  const proxy = read("proxy.ts");
  assert.match(proxy, /shouldRedirectSignedOutRequest|peptideOsSignedOutRedirectLocation/);
  assert.match(proxy, /NextResponse\.redirect/);
  assert.match(proxy, /307/);
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

test("SQL helper is boolean-only, SECURITY DEFINER, empty search_path, and not applied from Prisma migrate", () => {
  const sql = read("docs/sql/peptideos-has-email-identity.sql");
  const rollback = read("docs/sql/peptideos-has-email-identity.rollback.sql");
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = ''/);
  assert.match(sql, /FROM auth\.identities/);
  assert.match(sql, /provider\s*=\s*'email'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION[\s\S]*TO postgres/);
  assert.match(rollback, /DROP FUNCTION/);

  assert.throws(() => read("prisma/migrations/20261011211500_peptideos_has_email_identity/migration.sql"), /ENOENT/);
});

test("does not edit peptideos-wc-sso beyond the existing signup-cutover wrap", () => {
  const route = read("app/api/peptideos-wc-sso/route.ts");
  assert.doesNotMatch(route, /has_email_identity|hasEmailIdentity|passwordChange/);
});
