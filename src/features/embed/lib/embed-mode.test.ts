import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { EmbedAuthFallbackView } from "../ui/embed-auth-fallback-view";
import {
  EMBED_BACK_TO_DASHBOARD,
  EMBED_SESSION_KEY,
  embedFrameTarget,
  isEmbedSsoSignal,
  isHiddenEmbedEntryPath,
  isSsoFailureCode,
  resolveEmbedEnabled,
  shouldHideEmbedEntry,
  shouldShowEmbedAuthFallback
} from "./embed-mode";
import { embedBootScript } from "./embed-boot-script";

const APP = "https://workouts.peptideos.us";
const POS = "https://peptideos.us";

test("embed=1 turns the session flag on and any other value does not", () => {
  assert.equal(resolveEmbedEnabled("?embed=1", null), true);
  assert.equal(resolveEmbedEnabled("embed=1", null), true);
  assert.equal(resolveEmbedEnabled("?theme=dark&embed=1", null), true);
  assert.equal(resolveEmbedEnabled("?embed=0", null), false);
  assert.equal(resolveEmbedEnabled("?embed=true", null), false);
  assert.equal(resolveEmbedEnabled("?embed=", null), false);
  assert.equal(resolveEmbedEnabled("", null), false);
  assert.equal(resolveEmbedEnabled("?foo=1", null), false);
});

test("a stored session flag keeps embed mode after the query is gone", () => {
  assert.equal(resolveEmbedEnabled("", "1"), true);
  assert.equal(resolveEmbedEnabled("?theme=light", "1"), true);
  assert.equal(resolveEmbedEnabled("", "0"), false);
  assert.equal(resolveEmbedEnabled("", "true"), false);
  assert.equal(resolveEmbedEnabled("", ""), false);
});

test("embed off leaves link targets untouched", () => {
  assert.equal(embedFrameTarget(false, `${POS}/api/workouts/signout`, APP), null);
  assert.equal(embedFrameTarget(false, "https://example.com/video", APP), null);
  assert.equal(embedFrameTarget(false, "/en/auth/signout", APP), null);
  assert.equal(embedFrameTarget(false, "/en/programs", APP), null);
});

test("embed on sends sign-out to _top and other external links to _blank", () => {
  assert.equal(embedFrameTarget(true, `${POS}/api/workouts/signout?redirect=${encodeURIComponent(`${APP}/`)}`, APP), "_top");
  assert.equal(embedFrameTarget(true, "/en/auth/signout", APP), "_top");
  assert.equal(embedFrameTarget(true, "/auth/signout/continue", APP), "_top");
  assert.equal(embedFrameTarget(true, "https://example.com/watch", APP), "_blank");
  assert.equal(embedFrameTarget(true, "//evil.example/phish", APP), "_blank");
  assert.equal(embedFrameTarget(true, "mailto:coach@example.com", APP), "_blank");
  assert.equal(embedFrameTarget(true, `${POS}/api/workouts/sso`, APP), "_top");
  assert.equal(embedFrameTarget(true, `${POS}/login`, APP), "_top");
  assert.equal(embedFrameTarget(true, `${POS}/signup`, APP), "_top");
  assert.equal(embedFrameTarget(true, `${POS}/dashboard`, APP), "_top");
  assert.equal(embedFrameTarget(true, "https://evil.example/login", APP), "_blank");
  assert.equal(embedFrameTarget(false, `${POS}/login`, APP), null);
  assert.equal(embedFrameTarget(true, `${APP}/en/programs`, APP), null);
  assert.equal(embedFrameTarget(true, "/en/programs/push", APP), null);
  assert.equal(embedFrameTarget(true, "#sets", APP), null);
});

test("leaderboard and premium entry paths are hidden only while embed is on", () => {
  assert.equal(shouldHideEmbedEntry(false, "/premium"), false);
  assert.equal(shouldHideEmbedEntry(false, "/en/leaderboard"), false);
  assert.equal(shouldHideEmbedEntry(true, "/premium"), true);
  assert.equal(shouldHideEmbedEntry(true, "/en/premium?return=%2Fen"), true);
  assert.equal(shouldHideEmbedEntry(true, "/fr/leaderboard"), true);
  assert.equal(shouldHideEmbedEntry(true, "/zh-CN/programs"), false);
  assert.equal(shouldHideEmbedEntry(true, "/statistics"), false);
  assert.equal(isHiddenEmbedEntryPath("/en/premium", APP), true);
  assert.equal(isHiddenEmbedEntryPath("/en/tools", APP), false);
});

test("SSO failure shows Log in and Sign up only inside embed mode", () => {
  assert.equal(EMBED_BACK_TO_DASHBOARD, "← Back to dashboard");
  assert.equal(shouldShowEmbedAuthFallback({ embed: false, sessionResolved: true, hasSession: false }), false);
  assert.equal(shouldShowEmbedAuthFallback({ embed: true, sessionResolved: false, hasSession: false }), false);
  assert.equal(shouldShowEmbedAuthFallback({ embed: true, sessionResolved: true, hasSession: true }), false);
  assert.equal(shouldShowEmbedAuthFallback({ embed: true, sessionResolved: true, hasSession: false }), true);
  assert.equal(
    shouldShowEmbedAuthFallback({ embed: true, sessionResolved: true, hasSession: true, ssoError: true }),
    true
  );
  assert.equal(isSsoFailureCode("forbidden_origin"), true);
  assert.equal(isSsoFailureCode("sso_signin_failed"), true);
  assert.equal(isSsoFailureCode("not_an_sso_error"), false);
  assert.equal(isEmbedSsoSignal({ embedField: "1" }), true);
  assert.equal(isEmbedSsoSignal({ search: "?embed=1" }), true);
  assert.equal(isEmbedSsoSignal({ referer: "https://peptideos.us/api/workouts/sso?embed=1" }), true);
  assert.equal(isEmbedSsoSignal({ referer: "https://peptideos.us/api/workouts/sso" }), false);
  assert.equal(isEmbedSsoSignal({ embedField: "0" }), false);
});

test("embed auth fallback opens PeptideOS at the top and uses the exact back label", () => {
  const html = renderToStaticMarkup(
    createElement(EmbedAuthFallbackView, {
      dashboardHref: `${POS}/dashboard`,
      loginHref: `${POS}/api/workouts/sso`,
      loginLabel: "Log in",
      signupHref: `${POS}/signup`,
      signupLabel: "Sign up"
    })
  );
  assert.match(html, /← Back to dashboard/);
  assert.equal(html.split("← Back to dashboard").length - 1, 1);
  for (const href of [`${POS}/dashboard`, `${POS}/api/workouts/sso`, `${POS}/signup`]) {
    const tag = html.match(new RegExp(`<a[^>]*href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`));
    assert.ok(tag, href);
    assert.match(tag[0], /target="_top"/);
    assert.doesNotMatch(tag[0], /target="_blank"|target="_self"|target="_parent"/);
  }
  assert.match(html, />Log in</);
  assert.match(html, />Sign up</);
  assert.match(html, /data-wc-embed-fallback/);
});

test("boot script uses sessionStorage, never localStorage, and never a wildcard origin", () => {
  const script = embedBootScript();
  assert.match(script, /sessionStorage/);
  assert.match(script, new RegExp(EMBED_SESSION_KEY));
  assert.doesNotMatch(script, /localStorage/);
  assert.doesNotMatch(script, /postMessage/);
  assert.doesNotMatch(script, /["']\*["']/);
});

interface FakeElement {
  attrs: Record<string, string>;
  tag: string;
  parent: FakeElement | null;
  listeners: Record<string, Array<(event: FakeEvent) => void>>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  closest(selector: string): FakeElement | null;
  addEventListener(type: string, handler: (event: FakeEvent) => void, capture?: boolean): void;
}

interface FakeEvent {
  target: FakeElement;
  defaultPrevented: boolean;
  stopped: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

function closestMatch(node: FakeElement, selector: string): FakeElement | null {
  let current: FakeElement | null = node;
  while (current) {
    if (matches(current, selector)) return current;
    current = current.parent;
  }
  return null;
}

function element(tag: string, attrs: Record<string, string> = {}, parent: FakeElement | null = null): FakeElement {
  const node: FakeElement = {
    attrs: { ...attrs },
    tag,
    parent,
    listeners: {},
    getAttribute(name: string) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    },
    setAttribute(name: string, value: string) {
      this.attrs[name] = value;
    },
    closest(selector: string) {
      return closestMatch(this, selector);
    },
    addEventListener(type: string, handler: (event: FakeEvent) => void) {
      this.listeners[type] = this.listeners[type] ?? [];
      this.listeners[type].push(handler);
    }
  };
  return node;
}

function matches(node: FakeElement, selector: string): boolean {
  if (selector === "a[href]") return node.tag === "a" && node.getAttribute("href") !== null;
  if (selector === "[data-wc-entry='premium'],[data-wc-entry='leaderboard']") {
    const entry = node.getAttribute("data-wc-entry");
    return entry === "premium" || entry === "leaderboard";
  }
  return false;
}

function dispatch(documentNode: FakeElement, type: string, target: FakeElement) {
  const event: FakeEvent = {
    target,
    defaultPrevented: false,
    stopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    }
  };
  for (const handler of documentNode.listeners[type] ?? []) {
    handler(event);
  }
  return event;
}

function boot(search: string, stored: string | null) {
  const store = new Map<string, string>();
  if (stored !== null) store.set(EMBED_SESSION_KEY, stored);
  const root = element("html");
  const documentNode = element("document");
  const localWrites: string[] = [];
  const context = {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      }
    },
    localStorage: {
      getItem: () => null,
      setItem: (key: string) => {
        localWrites.push(key);
      }
    },
    location: { search, origin: APP },
    document: {
      documentElement: root,
      addEventListener: documentNode.addEventListener.bind(documentNode)
    }
  };
  const run = new Function("window", "document", "sessionStorage", "localStorage", "location", embedBootScript());
  run(context, context.document, context.sessionStorage, context.localStorage, context.location);
  return { store, root, documentNode, localWrites };
}

test("boot script enables embed for this tab only when the query or session flag says so", () => {
  const fromQuery = boot("?embed=1", null);
  assert.equal(fromQuery.root.getAttribute("data-wc-embed"), "1");
  assert.equal(fromQuery.store.get(EMBED_SESSION_KEY), "1");
  assert.deepEqual(fromQuery.localWrites, []);

  const kept = boot("", "1");
  assert.equal(kept.root.getAttribute("data-wc-embed"), "1");
  assert.deepEqual(kept.localWrites, []);

  const off = boot("?embed=0", null);
  assert.equal(off.root.getAttribute("data-wc-embed"), null);
  assert.equal(off.store.has(EMBED_SESSION_KEY), false);
});

test("boot script retargets sign-out and external links only while embed is on", () => {
  const on = boot("?embed=1", null);
  const signOut = element("a", { href: "/en/auth/signout" }, on.documentNode);
  dispatch(on.documentNode, "click", signOut);
  assert.equal(signOut.getAttribute("target"), "_top");

  const external = element("a", { href: "https://example.com/video" }, on.documentNode);
  dispatch(on.documentNode, "click", external);
  assert.equal(external.getAttribute("target"), "_blank");

  const login = element("a", { href: `${POS}/api/workouts/sso` }, on.documentNode);
  dispatch(on.documentNode, "click", login);
  assert.equal(login.getAttribute("target"), "_top");

  const evilLogin = element("a", { href: "https://evil.example/login" }, on.documentNode);
  dispatch(on.documentNode, "click", evilLogin);
  assert.equal(evilLogin.getAttribute("target"), "_blank");
  assert.match(external.getAttribute("rel") ?? "", /noopener/);

  const internal = element("a", { href: "/en/programs" }, on.documentNode);
  dispatch(on.documentNode, "click", internal);
  assert.equal(internal.getAttribute("target"), null);

  const premium = element("a", { href: "/en/premium" }, on.documentNode);
  const premiumEvent = dispatch(on.documentNode, "click", premium);
  assert.equal(premiumEvent.defaultPrevented, true);

  const entry = element("button", { "data-wc-entry": "leaderboard" }, on.documentNode);
  const entryEvent = dispatch(on.documentNode, "click", entry);
  assert.equal(entryEvent.defaultPrevented, true);

  const form = element("form", { action: `${POS}/api/workouts/signout` }, on.documentNode);
  dispatch(on.documentNode, "submit", form);
  assert.equal(form.getAttribute("target"), "_top");

  const off = boot("", null);
  const leaked = element("a", { href: "https://example.com/video" }, off.documentNode);
  dispatch(off.documentNode, "click", leaked);
  assert.equal(leaked.getAttribute("target"), null);
});

test("app shell still renders header, footer, card chrome, and bottom nav outside embed mode", () => {
  const layout = readFileSync("app/[locale]/(app)/layout.tsx", "utf8");
  assert.match(layout, /shadow-xl/);
  assert.match(layout, /border /);
  assert.match(layout, /rounded-lg/);
  assert.match(layout, /<EmbedAuthFallback/);
  assert.match(layout, /<Header/);
  assert.ok(layout.indexOf("<EmbedAuthFallback") < layout.indexOf("<Header"));
  assert.match(layout, /<Footer/);
  assert.match(layout, /<BottomNavigation/);
  assert.match(layout, /data-wc-shell/);
  assert.match(layout, /data-wc-main/);

  const header = readFileSync("src/features/layout/Header.tsx", "utf8");
  const footer = readFileSync("src/features/layout/Footer.tsx", "utf8");
  const nav = readFileSync("src/features/layout/BottomNavigation.tsx", "utf8");
  assert.match(header, /data-wc-chrome="header"/);
  assert.match(footer, /data-wc-chrome="footer"/);
  assert.match(nav, /data-wc-chrome="nav"/);
  assert.match(nav, /data-wc-entry=\{tab\.id === "leaderboard" \|\| tab\.id === "premium" \? tab\.id : undefined\}/);

  const root = readFileSync("app/[locale]/layout.tsx", "utf8");
  assert.match(root, /embedBootScript/);
  assert.match(root, /bg-hero-light/);
  assert.match(root, /data-wc-frame/);
  assert.match(root, /subsets:\s*\["latin"\]/);
  assert.match(root, /display:\s*"swap"/);
});
