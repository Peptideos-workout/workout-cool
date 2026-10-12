import { test } from "node:test";
import { join } from "node:path";
import { readdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";

function read(path: string) {
  return readFileSync(path, "utf8");
}

function walkTsx(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsx(path, acc);
    } else if (/\.(tsx|jsx)$/.test(entry.name) && !entry.name.includes(".test.")) {
      acc.push(path);
    }
  }
  return acc;
}

test("client logout clears the WC session then opens the PeptideOS POST handoff page", () => {
  const src = read("src/features/auth/model/useLogout.ts");
  assert.match(src, /authClient\.signOut/);
  assert.match(src, /auth\/signout\/continue/);
  assert.match(src, /location\.assign|location\.href/);
  assert.doesNotMatch(src, /getConfiguredPeptideOsWorkoutsSignoutUrl|peptideOsWorkoutsSignoutUrl/);
  assert.doesNotMatch(src, /router\.push\(redirectUrl\)/);
});

test("GET /auth/signout never signs out; only the POST server action does", () => {
  const page = read("app/[locale]/(app)/auth/signout/page.tsx");
  const action = read("src/features/auth/signout/model/signout.action.ts");

  assert.doesNotMatch(page, /auth\.api\.signOut|authClient\.signOut/);
  assert.match(page, /signOutAction/);
  assert.match(page, /<form/);
  assert.match(action, /["']use server["']/);
  assert.match(action, /auth\.api\.signOut/);
  assert.match(action, /auth\/signout\/continue/);
  assert.match(action, /logSsoEvent/);
  assert.match(action, /issueSignoutContinueCookie|SIGNOUT_CONTINUE_COOKIE/);
  assert.doesNotMatch(action, /redirect\([^)]*workouts\/signout|redirect\([^)]*peptideOsWorkoutsSignout/);
  assert.doesNotMatch(action, /getConfiguredPeptideOsWorkoutsSignoutUrl|peptideOsWorkoutsSignoutUrl|api\/workouts\/signout/);
});

test("WC-initiated hop B POSTs to PeptideOS sign-out?redirect=WC home from a WC-origin page", () => {
  const page = read("app/[locale]/(app)/auth/signout/continue/page.tsx");
  const ui = read("src/features/auth/signout/ui/peptideos-signout-handoff.tsx");
  const proxy = read("proxy.ts");
  const csp = read("src/features/auth/signout/lib/signout-continue-csp.ts");

  assert.match(page, /PeptideOsSignoutHandoff/);
  assert.match(
    page,
    /getConfiguredPeptideOsWorkoutsSignoutActionUrl|peptideOsWorkoutsSignoutActionUrl|getConfiguredPeptideOsWorkoutsSignoutUrl/
  );
  assert.match(page, /signoutContinueView|consumeSignoutContinueToken|autoSubmit/);
  assert.match(page, /signout_confirm_title/);
  assert.match(ui, /method=["']post["']/i);
  assert.match(ui, /type=["']submit["']/);
  assert.match(ui, /autoSubmit/);
  assert.match(ui, /useEffect|\.submit\(/);
  assert.match(ui, /if\s*\(\s*autoSubmit|autoSubmit\s*&&/);
  assert.doesNotMatch(page, /from-peptideos|peptideos-wc-signout/);
  assert.match(proxy, /isSignoutContinuePath/);
  assert.match(proxy, /Content-Security-Policy/);
  assert.match(proxy, /signoutContinueContentSecurityPolicy/);
  assert.match(proxy, /X-Frame-Options/);
  assert.match(proxy, /DENY/);
  assert.match(proxy, /SIGNOUT_CONTINUE_COOKIE/);
  assert.match(proxy, /maxAge:\s*0/);
  assert.match(csp, /form-action/);
  assert.match(csp, /'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(page, /Content-Security-Policy|form-action/);
  assert.doesNotMatch(ui, /Content-Security-Policy|form-action/);
});

test("PeptideOS-initiated hop C is POST-only Origin-checked /api/peptideos-wc-signout", () => {
  const route = read("app/api/peptideos-wc-signout/route.ts");
  const runner = read("app/api/peptideos-wc-signout/run-wc-signout.ts");
  assert.match(route, /export async function POST/);
  assert.match(route, /405/);
  assert.match(runner, /isTrustedPeptideOsHopCRequest/);
  assert.match(runner, /logSsoEvent/);
  assert.match(runner, /peptideOsSignoutFinalizeLocation/);
  assert.match(runner, /303/);
  assert.doesNotMatch(runner, /auth\/signout\/continue|from-peptideos/);
  assert.doesNotMatch(route, /peptideOsWorkoutsSignoutUrl|PEPTIDEOS_WORKOUTS_SIGNOUT_PATH/);
  assert.doesNotMatch(route, /GET\(request[\s\S]*runPeptideOsWcSignout/);
});

test("sign-out confirm page has a heading and a cancel link that does not sign out", () => {
  const page = read("app/[locale]/(app)/auth/signout/page.tsx");

  assert.match(page, /<h1[\s\S]*signout_confirm_title/);
  assert.match(page, /signOutCancelHref/);
  assert.match(page, /<Link\b[\s\S]*commons\.cancel/);
  assert.doesNotMatch(page, /auth\.api\.signOut|authClient\.signOut/);
  assert.doesNotMatch(page, /<form[\s\S]*<Link[\s\S]*<\/form>/);
});

test("signout_confirm_title is defined in every locale", () => {
  for (const locale of ["en", "fr", "es", "zh-CN", "ru", "pt"]) {
    const src = read(`locales/${locale}.ts`);
    assert.match(src, /signout_confirm_title:/, locale);
  }
});

test("workout-cool does not load PeptideOS SSO inside an iframe", () => {
  for (const file of [...walkTsx("src"), ...walkTsx("app")]) {
    const src = read(file);
    const iframes = src.match(/<iframe\b[\s\S]{0,800}?>/g) ?? [];
    for (const tag of iframes) {
      assert.doesNotMatch(tag, /workouts\/sso|peptideos-wc-sso/i, `${file} must not iframe the SSO URL`);
    }
  }
});

test("any Link to /auth/signout disables Next.js prefetch", () => {
  for (const file of [...walkTsx("src"), ...walkTsx("app")]) {
    const src = read(file);
    const tags = src.match(/<Link\b[\s\S]{0,500}?>/g) ?? [];
    for (const tag of tags) {
      if (!/auth\/signout/.test(tag)) {
        continue;
      }
      assert.match(tag, /prefetch=\{false\}/, `${file} Link to /auth/signout must set prefetch={false}`);
    }
  }
});
