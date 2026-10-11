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

test("client logout clears the WC session then redirects to PeptideOS sign-out", () => {
  const src = read("src/features/auth/model/useLogout.ts");
  assert.match(src, /authClient\.signOut/);
  assert.match(src, /getConfiguredPeptideOsWorkoutsSignoutUrl|peptideOsWorkoutsSignoutUrl/);
  assert.match(src, /location\.assign|location\.href/);
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
  assert.match(action, /getConfiguredPeptideOsWorkoutsSignoutUrl|peptideOsWorkoutsSignoutUrl/);
  assert.match(action, /redirect\(/);
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
