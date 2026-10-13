import { test } from "node:test";
import { join } from "node:path";
import { readdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";

import { FRAME_ANCESTORS_CSP, mergeFrameAncestors } from "./frame-ancestors";

const EXACT = "frame-ancestors 'self' https://peptideos.us https://www.peptideos.us";

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, acc);
    } else if (/\.(ts|tsx|js|mjs|json)$/.test(entry.name) && !entry.name.includes(".test.")) {
      acc.push(path);
    }
  }
  return acc;
}

test("frame-ancestors allowlist is the exact PeptideOS value and does not add preview hosts", () => {
  assert.equal(FRAME_ANCESTORS_CSP, EXACT);
  assert.doesNotMatch(FRAME_ANCESTORS_CSP, /vercel\.app|localhost|preview/i);
  assert.doesNotMatch(FRAME_ANCESTORS_CSP, /X-Frame-Options/);
});

test("mergeFrameAncestors appends when CSP has no frame-ancestors and keeps a stricter none", () => {
  assert.equal(mergeFrameAncestors(undefined), EXACT);
  assert.equal(mergeFrameAncestors(""), EXACT);
  assert.equal(mergeFrameAncestors("default-src 'self'"), `default-src 'self'; ${EXACT}`);
  assert.equal(mergeFrameAncestors("form-action 'self'; frame-ancestors 'none'"), "form-action 'self'; frame-ancestors 'none'");
  assert.equal(
    mergeFrameAncestors("default-src 'self'; frame-ancestors https://evil.example"),
    `default-src 'self'; ${EXACT}`
  );
  assert.doesNotMatch(mergeFrameAncestors("frame-ancestors https://evil.example"), /evil/);
  assert.equal(mergeFrameAncestors(EXACT), EXACT);
});

test("mergeFrameAncestors keeps exact frame-ancestors 'none' and replaces none plus other sources", () => {
  assert.equal(mergeFrameAncestors("frame-ancestors 'none'"), "frame-ancestors 'none'");
  assert.equal(mergeFrameAncestors("FRAME-ANCESTORS 'NONE'"), "FRAME-ANCESTORS 'NONE'");
  assert.equal(mergeFrameAncestors("frame-ancestors 'None'"), "frame-ancestors 'None'");
  assert.equal(mergeFrameAncestors("Frame-Ancestors 'none'"), "Frame-Ancestors 'none'");
  assert.equal(mergeFrameAncestors("frame-ancestors 'none' https://evil.example"), EXACT);
  assert.doesNotMatch(mergeFrameAncestors("frame-ancestors 'none' https://evil.example"), /evil/);
  assert.equal(
    mergeFrameAncestors("default-src 'self'; frame-ancestors 'none' https://evil.example"),
    `default-src 'self'; ${EXACT}`
  );
});

test("CSP is assigned only in the global header, SSO and sign-out responses, and the sign-out lockout", () => {
  const hits = walk(".")
    .filter((file) => /Content-Security-Policy|applyFrameAncestorsHeader/.test(readFileSync(file, "utf8")))
    .map((file) => file.replace(/^\.\//, ""))
    .sort();

  assert.deepEqual(hits, [
    "app/api/peptideos-wc-signout/route.ts",
    "app/api/peptideos-wc-signout/run-wc-signout.ts",
    "app/api/peptideos-wc-sso/sso-response.ts",
    "next.config.ts",
    "src/features/auth/signout/lib/signout-continue-proxy.ts",
    "src/shared/lib/frame-ancestors.ts"
  ]);
});

test("vercel.json does not set CSP or X-Frame-Options", () => {
  const vercel = readFileSync("vercel.json", "utf8");
  assert.doesNotMatch(vercel, /Content-Security-Policy|X-Frame-Options|frame-ancestors/);
});

test("next.config sets the shared frame-ancestors value and not X-Frame-Options", () => {
  const src = readFileSync("next.config.ts", "utf8");
  assert.match(src, /FRAME_ANCESTORS_CSP/);
  assert.match(src, /headers\(\)/);
  assert.doesNotMatch(src, /X-Frame-Options/);
});
