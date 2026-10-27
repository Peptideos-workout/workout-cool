import { test } from "node:test";
import assert from "node:assert/strict";

import { embedSsoFallbackLinks, prefersBrowserSsoErrorPage, ssoErrorCopy, ssoErrorHtml } from "./sso-error-page";

test("browser navigations prefer an HTML SSO error page", () => {
  assert.equal(prefersBrowserSsoErrorPage("text/html,application/xhtml+xml"), true);
  assert.equal(prefersBrowserSsoErrorPage("text/html"), true);
  assert.equal(prefersBrowserSsoErrorPage("application/json"), false);
  assert.equal(prefersBrowserSsoErrorPage("*/*"), false);
  assert.equal(prefersBrowserSsoErrorPage(null), false);
  assert.equal(prefersBrowserSsoErrorPage(undefined), false);
});

test("SSO error copy includes a try-again label and a 409 support note", () => {
  const generic = ssoErrorCopy("en", "invalid_or_expired_handoff");
  assert.match(generic.title, /could not sign you in|sign-in failed/i);
  assert.match(generic.tryAgain, /try again/i);
  assert.equal(generic.supportNote, undefined);

  const collision = ssoErrorCopy("en", "sso_email_collision");
  assert.ok(collision.supportNote);
  assert.match(collision.supportNote, /support/i);
  assert.doesNotMatch(collision.supportNote, /@/);
});

test("SSO error HTML links to PeptideOS workouts SSO and stays generic", () => {
  const html = ssoErrorHtml({
    locale: "en",
    error: "sso_email_collision",
    tryAgainHref: "https://peptideos.us/api/workouts/sso"
  });
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /href="https:\/\/peptideos\.us\/api\/workouts\/sso"/);
  assert.match(html, /Try again/i);
  assert.match(html, /support/i);
  assert.doesNotMatch(html, /athlete@example/);
  assert.doesNotMatch(html, /sso_email_collision/);
  assert.doesNotMatch(html, /← Back to dashboard/);
  assert.doesNotMatch(html, /target="_top"/);
});

test("embed SSO errors, including forbidden origin, break Log in and Sign up out of the frame", () => {
  for (const error of ["forbidden_origin", "sso_signin_failed", "invalid_or_expired_handoff"]) {
    const html = ssoErrorHtml({
      locale: "en",
      error,
      tryAgainHref: "https://peptideos.us/api/workouts/sso?redirect=https%3A%2F%2Fworkouts.peptideos.us%2F",
      embed: true
    });
    assert.match(html, />Log in</);
    assert.match(html, />Sign up</);
    assert.match(html, /← Back to dashboard/);
    assert.doesNotMatch(html, /forbidden_origin|sso_signin_failed|invalid_or_expired_handoff/);
    const links = embedSsoFallbackLinks("https://peptideos.us/api/workouts/sso?redirect=https%3A%2F%2Fworkouts.peptideos.us%2F");
    for (const href of [links.loginHref, links.signupHref, links.dashboardHref]) {
      const tag = html.match(new RegExp(`<a href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`));
      assert.ok(tag, `${error} ${href}`);
      assert.match(tag[0], /target="_top"/);
      assert.doesNotMatch(tag[0], /target="_blank"|target="_self"/);
    }
    assert.equal(links.signupHref, "https://peptideos.us/signup");
    assert.equal(links.dashboardHref, "https://peptideos.us/dashboard");
    assert.match(html, /wc:session/);
    assert.match(html, /"signed-out"/);
    assert.match(html, /https:\/\/www\.peptideos\.us/);
    assert.doesNotMatch(html, /postMessage\([^)]*["']\*["']/);
  }
});

interface CssDeclarations {
  [property: string]: string;
}

const PAGE_SELECTORS = ["body", "main", "h1", "p", "a", ".support"] as const;

function channel(hex: string): number[] {
  const value = hex.slice(1);
  const full = value.length === 3 ? value.split("").map((part) => `${part}${part}`).join("") : value;
  return [0, 2, 4].map((start) => Number.parseInt(full.slice(start, start + 2), 16));
}

function contrast(foreground: string, background: string): number {
  const linear = (amount: number) => {
    const unit = amount / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex: string) => {
    const [red, green, blue] = channel(hex);
    return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
  };
  const [hi, lo] = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (hi + 0.05) / (lo + 0.05);
}

function styleText(html: string): string {
  const match = html.match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(match, "rendered style");
  return match[1];
}

function schemeCss(css: string): { light: string; dark: string } {
  const marker = "@media (prefers-color-scheme: dark)";
  const start = css.indexOf(marker);
  assert.ok(start >= 0, "dark color scheme");
  const open = css.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") {
      depth += 1;
    } else if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  assert.ok(end > open, "dark color scheme block");
  return {
    light: `${css.slice(0, start)} ${css.slice(end + 1)}`,
    dark: css.slice(open + 1, end)
  };
}

function declarationsFor(css: string, selector: string): CssDeclarations {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|[\\s}])${escaped}\\s*\\{([^}]*)\\}`));
  const declarations: CssDeclarations = {};
  if (!match) return declarations;
  for (const part of match[1].split(";")) {
    const splitAt = part.indexOf(":");
    if (splitAt === -1) continue;
    const property = part.slice(0, splitAt).trim();
    const value = part.slice(splitAt + 1).trim();
    if (property && value) declarations[property] = value;
  }
  return declarations;
}

function rulesFrom(css: string): Record<string, CssDeclarations> {
  const rules: Record<string, CssDeclarations> = {};
  for (const selector of PAGE_SELECTORS) rules[selector] = declarationsFor(css, selector);
  return rules;
}

function cascade(light: Record<string, CssDeclarations>, dark: Record<string, CssDeclarations>): Record<string, CssDeclarations> {
  const cascaded: Record<string, CssDeclarations> = {};
  for (const selector of PAGE_SELECTORS) cascaded[selector] = { ...light[selector], ...dark[selector] };
  return cascaded;
}

function pixels(value: string | undefined): number {
  assert.ok(value, "missing px length");
  const match = value.match(/^(\d+(?:\.\d+)?)px$/);
  assert.ok(match, value);
  return Number(match[1]);
}

function hexColor(value: string | undefined): string | undefined {
  const match = value?.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) return undefined;
  const raw = match[1];
  const full = raw.length === 3 ? raw.split("").map((part) => `${part}${part}`).join("") : raw;
  return `#${full.toLowerCase()}`;
}

function painted(
  rules: Record<string, CssDeclarations>,
  selector: string,
  inherit: string[]
): { color: string; background: string } {
  let color: string | undefined;
  let background: string | undefined;
  for (const candidate of [selector, ...inherit]) {
    const declarations = rules[candidate] ?? {};
    const nextColor = hexColor(declarations.color);
    const nextBackground = hexColor(declarations.background) ?? hexColor(declarations["background-color"]);
    if (!color && nextColor) color = nextColor;
    if (!background && nextBackground) background = nextBackground;
  }
  assert.ok(color, `${selector} color`);
  assert.ok(background, `${selector} background`);
  return { color, background };
}

function assertReadable(label: string, foreground: string, background: string): void {
  const ratio = contrast(foreground, background);
  console.log(`${label}: ${foreground} on ${background} = ${ratio.toFixed(2)}:1`);
  assert.ok(ratio >= 4.5, `${label} contrast ${ratio.toFixed(2)} is below 4.5`);
}

function renderedErrorPage(): string {
  return ssoErrorHtml({
    locale: "en",
    error: "method_not_allowed",
    tryAgainHref: "https://peptideos.us/api/workouts/sso"
  });
}

test("SSO error page body text is at least 18px and the heading is larger", () => {
  const html = renderedErrorPage();
  assert.doesNotMatch(html, /method_not_allowed/);
  const rules = rulesFrom(schemeCss(styleText(html)).light);
  const body = pixels(rules.body["font-size"]);
  const paragraph = pixels(rules.p["font-size"] ?? rules.body["font-size"]);
  const support = pixels(rules[".support"]["font-size"] ?? rules.p["font-size"] ?? rules.body["font-size"]);
  const heading = pixels(rules.h1["font-size"]);
  assert.ok(body >= 18, `body font-size ${body}px`);
  assert.ok(paragraph >= 18, `paragraph font-size ${paragraph}px`);
  assert.ok(support >= 18, `support font-size ${support}px`);
  assert.ok(heading >= body + 8, `heading ${heading}px is not clearly larger than body ${body}px`);
});

test("Try again link is a button at least 48px tall", () => {
  const html = renderedErrorPage();
  assert.match(html, /<a href="https:\/\/peptideos\.us\/api\/workouts\/sso">Try again<\/a>/);
  const link = rulesFrom(schemeCss(styleText(html)).light).a;
  const minHeight = pixels(link["min-height"]);
  assert.ok(minHeight >= 48, `Try again min-height ${String(link["min-height"])}`);
  assert.ok(link.display === "inline-flex" || link.display === "block", link.display);
  assert.ok(link.padding && /\d/.test(link.padding), "button padding");
  assert.ok(pixels(link["font-size"]) >= 18, `button font-size ${String(link["font-size"])}`);
  if (link.display === "inline-flex") {
    assert.equal(link["align-items"], "center");
    assert.equal(link["justify-content"], "center");
  } else {
    assert.equal(link["text-align"], "center");
  }
});

test("SSO error page text meets AA contrast in light and dark schemes", () => {
  const { light, dark } = schemeCss(styleText(renderedErrorPage()));
  const lightRules = rulesFrom(light);
  const schemes: Array<[string, Record<string, CssDeclarations>]> = [
    ["light", lightRules],
    ["dark", cascade(lightRules, rulesFrom(dark))]
  ];
  for (const [scheme, rules] of schemes) {
    const body = painted(rules, "body", []);
    const heading = painted(rules, "h1", ["main", "body"]);
    const paragraph = painted(rules, "p", ["main", "body"]);
    const support = painted(rules, ".support", ["p", "main", "body"]);
    const button = painted(rules, "a", []);
    assertReadable(`${scheme} body`, body.color, body.background);
    assertReadable(`${scheme} heading`, heading.color, heading.background);
    assertReadable(`${scheme} paragraph`, paragraph.color, paragraph.background);
    assertReadable(`${scheme} support`, support.color, support.background);
    assertReadable(`${scheme} button`, button.color, button.background);
  }
});
