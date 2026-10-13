import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const EMBED = "html[data-wc-embed=\"1\"]";

const LIGHT = {
  "--dash-page": "#f6f3ec",
  "--dash-panel": "#ffffff",
  "--dash-inner": "#f3faf8",
  "--dash-card": "#e7f3ef",
  "--dash-border": "#5e8a80",
  "--dash-text": "#10211e",
  "--dash-secondary": "#33414a",
  "--dash-accent": "#0a5c52",
  "--dash-ink": "#ffffff",
  "--dash-link": "#075e56",
  "--dash-error": "#9f1239"
} as const;

const DARK = {
  "--dash-page": "#0b0f14",
  "--dash-panel": "#0b0f14",
  "--dash-inner": "#1d2530",
  "--dash-card": "#151b23",
  "--dash-border": "#6e8296",
  "--dash-text": "#f2f5f8",
  "--dash-secondary": "#b4becb",
  "--dash-accent": "#2dd4bf",
  "--dash-ink": "#04201c",
  "--dash-link": "#5eead4",
  "--dash-error": "#fecdd3"
} as const;

function flattenMedia(css: string): string {
  const parts: string[] = [];
  let index = 0;
  while (index < css.length) {
    const mediaAt = css.indexOf("@media", index);
    if (mediaAt === -1) {
      parts.push(css.slice(index));
      break;
    }
    parts.push(css.slice(index, mediaAt));
    const open = css.indexOf("{", mediaAt);
    assert.match(css.slice(mediaAt, open), /@media\s*\(\s*max-width:\s*639px\s*\)/);
    let depth = 0;
    let cursor = open;
    for (; cursor < css.length; cursor += 1) {
      if (css[cursor] === "{") depth += 1;
      else if (css[cursor] === "}") {
        depth -= 1;
        if (depth === 0) {
          parts.push(css.slice(open + 1, cursor));
          cursor += 1;
          break;
        }
      }
    }
    index = cursor;
  }
  return parts.join("\n");
}

function rules(css: string): Array<{ selector: string; body: string }> {
  const withoutComments = flattenMedia(css.replace(/\/\*[\s\S]*?\*\//g, ""));
  return withoutComments
    .split("}")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const splitAt = block.indexOf("{");
      assert.notEqual(splitAt, -1, block);
      return {
        selector: block.slice(0, splitAt).trim(),
        body: block.slice(splitAt + 1)
      };
    });
}

test("embed theme rules never apply outside embed mode", () => {
  const css = readFileSync("src/features/embed/embed-theme.css", "utf8");
  const parsed = rules(css);
  assert.ok(parsed.length > 0);
  for (const rule of parsed) {
    assert.match(rule.selector, /html\[data-wc-embed="1"\]/, rule.selector);
    assert.doesNotMatch(rule.selector, /^:root\b/);
    assert.doesNotMatch(rule.selector, /^html(?!\[data-wc-embed)/);
    assert.doesNotMatch(rule.selector, /^body\b/);
  }

  const globals = readFileSync("src/shared/styles/globals.css", "utf8");
  assert.match(globals, /embed-theme\.css/);
  assert.doesNotMatch(globals, /--dash-accent/);
  const outsideWcDash = globals
    .split("\n")
    .filter((line) => !line.includes("--wc-dash-"))
    .join("\n");
  assert.doesNotMatch(outsideWcDash, /#0a5c52/);
  assert.doesNotMatch(outsideWcDash, /#2dd4bf/);
  assert.match(globals, /--wc-dash-accent:\s*#0a5c52/);
  assert.match(globals, /--wc-dash-accent:\s*#2dd4bf/);
});

test("embed tokens match PeptideOS light and dark values and keep the page transparent", () => {
  const css = readFileSync("src/features/embed/embed-theme.css", "utf8");
  const parsed = rules(css);
  const light = parsed.find((rule) => rule.selector === EMBED);
  const dark = parsed.find((rule) => rule.selector === `${EMBED}.dark`);
  assert.ok(light, "missing light embed token block");
  assert.ok(dark, "missing dark embed token block");

  for (const [name, value] of Object.entries(LIGHT)) {
    assert.match(light.body, new RegExp(`${name}:\\s*${value}`), name);
  }
  for (const [name, value] of Object.entries(DARK)) {
    assert.match(dark.body, new RegExp(`${name}:\\s*${value}`), name);
  }

  assert.match(light.body, /--color-base-100:\s*var\(--dash-panel\)/);
  assert.match(light.body, /--color-base-200:\s*var\(--dash-inner\)/);
  assert.match(light.body, /--color-base-300:\s*var\(--dash-card\)/);
  assert.match(light.body, /--color-primary:\s*var\(--dash-accent\)/);
  assert.match(light.body, /--color-accent:\s*var\(--dash-link\)/);
  assert.match(light.body, /--color-primary-content:\s*var\(--dash-ink\)/);

  const page = parsed.filter((rule) => /html\[data-wc-embed="1"\]/.test(rule.selector) && /background/.test(rule.body));
  assert.ok(page.some((rule) => /transparent/.test(rule.body)));
  assert.ok(parsed.some((rule) => /overflow:\s*hidden/.test(rule.body)));
  assert.ok(parsed.some((rule) => /box-shadow:\s*none/.test(rule.body)));
  assert.ok(parsed.some((rule) => /border:\s*0/.test(rule.body)));
  assert.ok(parsed.some((rule) => /var\(--font-inter\)/.test(rule.body)));
  assert.ok(parsed.some((rule) => /\[data-wc-chrome="header"\]/.test(rule.selector) && /display:\s*none/.test(rule.body)));
  assert.ok(parsed.some((rule) => /\[data-wc-chrome="footer"\]/.test(rule.selector) && /display:\s*none/.test(rule.body)));
  assert.ok(parsed.some((rule) => /\[data-wc-chrome="banner"\]/.test(rule.selector) && /display:\s*none/.test(rule.body)));
  assert.ok(parsed.some((rule) => /\[data-wc-chrome="version"\]/.test(rule.selector) && /display:\s*none/.test(rule.body)));
  assert.doesNotMatch(css, /data-wc-entry/);
  assert.ok(parsed.some((rule) => /\[data-wc-chrome="nav"\]/.test(rule.selector)));
  const navRule = parsed.find((rule) => /\[data-wc-chrome="nav"\]/.test(rule.selector));
  assert.ok(navRule);
  assert.doesNotMatch(navRule.body, /display:\s*none/);
  assert.doesNotMatch(css, /--dash-page\s*\)/);
});
