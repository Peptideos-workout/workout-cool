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
  assert.match(src, /signOutAction/);
  assert.doesNotMatch(src, /authClient\.signOut/);
  assert.doesNotMatch(src, /location\.assign|location\.href/);
  assert.doesNotMatch(src, /getConfiguredPeptideOsWorkoutsSignoutUrl|peptideOsWorkoutsSignoutUrl/);
  assert.doesNotMatch(src, /router\.push\(redirectUrl\)/);
});

test("useLogout runs signOutAction before invalidating or clearing the session query", () => {
  const src = read("src/features/auth/model/useLogout.ts");
  const mutation = src.match(/mutationFn:\s*async\s*\(\)\s*=>\s*\{[\s\S]*\n {4}\}/);
  assert.ok(mutation, "useLogout must keep a mutationFn");
  const body = mutation[0];
  const signOutAt = body.search(/await signOutAction|logoutThenClearSession/);
  const invalidateAt = body.search(/invalidateQueries|removeQueries|resetQueries|setQueryData/);
  assert.notEqual(signOutAt, -1, "mutationFn must call signOutAction");
  assert.notEqual(invalidateAt, -1, "mutationFn must still clear the session query after sign-out");
  assert.ok(signOutAt < invalidateAt, "signOutAction must run before session query invalidation");
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
  assert.match(action, /issueSignoutContinueCookie|issueSignoutContinueToken/);
  assert.match(action, /signoutContinueCookieName/);
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
  assert.match(page, /isSignoutContinueAutoSubmitHeader|SIGNOUT_CONTINUE_OK_HEADER|autoSubmit/);
  assert.match(page, /data-signout-handoff/);
  assert.match(page, /signout_confirm_title/);
  assert.match(page, /SignoutPendingNotice/);
  assert.match(page, /signout_pending_title/);
  assert.match(page, /signout_pending_fallback/);
  assert.match(page, /<noscript>/);
  assert.match(page, /signout-continue-fallback\{display:inline-flex !important\}/);
  assert.match(ui, /signout-continue-fallback/);
  assert.match(ui, /display:\s*"none"/);
  assert.match(ui, /fallbackLabel/);
  assert.doesNotMatch(page, /cookies\(|signoutContinueView|consumeSignoutContinueToken/);
  assert.match(ui, /method=["']post["']/i);
  assert.match(ui, /type=["']submit["']/);
  assert.match(ui, /autoSubmit/);
  assert.match(ui, /useEffect|\.submit\(/);
  assert.match(ui, /if\s*\(\s*autoSubmit|autoSubmit\s*&&|shouldAutoSubmitSignoutHandoff\(\s*autoSubmit/);
  assert.doesNotMatch(page, /from-peptideos|peptideos-wc-signout/);
  assert.match(proxy, /isSignoutContinuePath/);
  assert.match(proxy, /signoutContinueProxyResponse/);
  const proxyHelper = read("src/features/auth/signout/lib/signout-continue-proxy.ts");
  assert.match(proxyHelper, /NextResponse\.next\(\s*\{\s*request:\s*\{\s*headers/);
  assert.match(proxyHelper, /SIGNOUT_CONTINUE_OK_HEADER/);
  assert.match(proxyHelper, /headers\.delete/);
  assert.match(proxyHelper, /consumeSignoutContinueToken/);
  assert.match(proxyHelper, /maxAge:\s*0/);
  assert.match(proxyHelper, /X-Frame-Options|DENY/);
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

test("proxy sends clickjacking headers on the WC /auth/signout confirm page", () => {
  const proxy = read("proxy.ts");
  const page = read("app/[locale]/(app)/auth/signout/page.tsx");
  assert.match(proxy, /isSignoutConfirmPath/);
  assert.match(proxy, /applySignoutConfirmSecurityHeaders/);
  assert.doesNotMatch(page, /Content-Security-Policy|X-Frame-Options|frame-ancestors/);
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
    assert.match(src, /signout_pending_title:/, locale);
    assert.match(src, /signout_pending_fallback:/, locale);
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

const PEPTIDEOS_SSO_HREF =
  /getConfiguredPeptideOs(?:Login|Signup|WorkoutsSso)Url|workouts\/sso|peptideos\.us\/api\/workouts\/sso/i;

test("shared Link disables Next.js prefetch for absolute http(s) hrefs", () => {
  const src = read("src/components/ui/link.tsx");
  assert.match(src, /disableCrossOriginPrefetch/);
  assert.match(src, /prefetch \?\?/);
  assert.match(src, /typeof href === "string"/);
});

test("SSO entry points are plain navigation links and never prefetch cross-origin PeptideOS URLs", () => {
  const header = read("src/features/layout/Header.tsx");
  const login = header.match(/<Link\b[\s\S]{0,500}?getConfiguredPeptideOsLoginUrl\(\)[\s\S]{0,200}?>/);
  const signup = header.match(/<Link\b[\s\S]{0,500}?getConfiguredPeptideOsSignupUrl\(\)[\s\S]{0,200}?>/);
  assert.ok(login, "header login must stay a Link or be converted to a plain <a>");
  assert.ok(signup, "header signup must stay a Link or be converted to a plain <a>");
  assert.match(login[0], /prefetch=\{false\}/, "header login Link must set prefetch={false}");
  assert.match(signup[0], /prefetch=\{false\}/, "header signup Link must set prefetch={false}");
  assert.doesNotMatch(header, /fetch\s*\(\s*getConfiguredPeptideOs(?:Login|Signup)/);

  for (const file of [...walkTsx("src"), ...walkTsx("app")]) {
    const src = read(file);
    const linkTags = src.match(/<(?:Link|a)\b[\s\S]{0,800}?>/g) ?? [];
    for (const tag of linkTags) {
      if (!PEPTIDEOS_SSO_HREF.test(tag)) {
        continue;
      }
      if (/^<a\b/.test(tag)) {
        assert.doesNotMatch(tag, /rel=["'](?:prefetch|preload)["']/, `${file} must not prefetch PeptideOS via <link>/<a>`);
        continue;
      }
      assert.match(tag, /prefetch=\{false\}/, `${file} Link to PeptideOS SSO must set prefetch={false}`);
    }

    for (const call of src.match(/fetch\s*\([\s\S]{0,300}\)/g) ?? []) {
      assert.doesNotMatch(call, PEPTIDEOS_SSO_HREF, `${file} must not fetch PeptideOS SSO`);
    }

    for (const tag of src.match(/<link\b[\s\S]{0,400}?>/g) ?? []) {
      if (!/rel=["'](?:prefetch|preload)["']/.test(tag)) {
        continue;
      }
      assert.doesNotMatch(tag, /peptideos|workouts\/sso/i, `${file} must not <link rel=prefetch> PeptideOS`);
    }
  }
});

test("CI runs the full suite once after the build so the sign-out e2e can boot", () => {
  const ci = read(".github/workflows/ci.yml");
  const buildJobAt = ci.search(/\n {2}build:/);
  assert.notEqual(buildJobAt, -1, "CI must keep a build job");
  const lintJob = ci.slice(0, buildJobAt);
  const buildJob = ci.slice(buildJobAt);
  assert.doesNotMatch(lintJob, /pnpm test/);

  const buildAt = buildJob.search(/pnpm build/);
  const testAt = buildJob.search(/pnpm test/);
  assert.notEqual(buildAt, -1, "CI must keep a build step");
  assert.notEqual(testAt, -1, "CI must run pnpm test after the build");
  assert.ok(testAt > buildAt, "tests must run after the build step so .next/BUILD_ID exists");
  assert.doesNotMatch(buildJob, /signout-continue-e2e\.test\.ts/);
  assert.match(ci, /BETTER_AUTH_SECRET/);
  assert.match(ci, /DATABASE_URL/);
  assert.match(ci, /GOOGLE_CLIENT_ID/);
  assert.match(read("package.json"), /signout-continue-e2e\.test\.ts/);

  const e2e = read("src/features/auth/signout/lib/signout-continue-e2e.test.ts");
  assert.match(e2e, /process\.env\.CI/);
  assert.match(e2e, /missingProductionBuildDisposition/);
  assert.match(e2e, /disposition === "fail"|CI requires `pnpm build`/);
});
