import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { NextRequest } from "next/server";

import { EmbedAuthFallbackView } from "../ui/embed-auth-fallback-view";
import { proxy } from "../../../../proxy";
import { embedSignedOutDocumentResponse, embedTopLevelEmbedQueryEscape, isEmbedDocumentRequest } from "./embed-signed-out-document";
import {
  EMBED_BACK_TO_DASHBOARD,
  EMBED_PARENT_ORIGINS,
  EMBED_SESSION_KEY,
  assignCheckoutUrl,
  checkoutBreakoutTarget,
  embedFrameTarget,
  embedSignedOutSessionBootstrap,
  isEmbedFrame,
  isEmbedSsoSignal,
  isSsoFailureCode,
  postEmbedLogoutToParent,
  resolveEmbedEnabled,
  resolveEmbedOutboundOrigins,
  shouldAutoSubmitSignoutHandoff,
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

test("embed on keeps sign-out in the frame and sends other external links to _blank", () => {
  assert.equal(embedFrameTarget(true, `${POS}/api/workouts/signout?redirect=${encodeURIComponent(`${APP}/`)}`, APP), null);
  assert.equal(embedFrameTarget(true, "/en/auth/signout", APP), null);
  assert.equal(embedFrameTarget(true, "/auth/signout/continue", APP), null);
  assert.equal(embedFrameTarget(true, `${APP}/auth/signout`, APP), null);
  assert.equal(embedFrameTarget(true, `${POS}/auth/signout`, APP), null);
  assert.notEqual(embedFrameTarget(true, `${POS}/auth/signout`, APP), "_top");
  assert.equal(embedFrameTarget(true, "https://evil.com/auth/signout", APP), "_blank");
  assert.equal(embedFrameTarget(true, "https://evil.com/api/workouts/signout", APP), "_blank");
  assert.equal(embedFrameTarget(true, "https://peptideos.us.evil.example/auth/signout", APP), "_blank");
  assert.equal(embedFrameTarget(true, "https://evil.peptideos.us/api/workouts/signout", APP), "_blank");
  assert.equal(embedFrameTarget(true, "https://www.peptideos.us/auth/signout", APP), null);
  assert.notEqual(embedFrameTarget(true, "https://www.peptideos.us/auth/signout", APP), "_top");
  assert.equal(embedFrameTarget(true, "http://peptideos.us/auth/signout", APP), "_blank");
  assert.equal(embedFrameTarget(true, "https://workouts.peptideos.us.evil.example/auth/signout", APP), "_blank");
  assert.equal(embedFrameTarget(true, "https://example.com/watch", APP), "_blank");
  assert.equal(embedFrameTarget(true, "https://checkout.stripe.com/c/pay/cs_test", APP), "_top");
  assert.equal(embedFrameTarget(true, "https://billing.stripe.com/p/session", APP), "_top");
  assert.equal(embedFrameTarget(true, "https://www.paypal.com/checkoutnow", APP), "_top");
  assert.equal(embedFrameTarget(true, "https://workout.lemonsqueezy.com/checkout", APP), "_top");
  assert.equal(embedFrameTarget(true, "http://checkout.stripe.com/c/pay/cs_test", APP), "_blank");
  assert.equal(
    embedFrameTarget(true, "http://checkout.stripe.com/c/pay/cs_test", APP),
    embedFrameTarget(true, "http://example.com/video", APP)
  );
  assert.notEqual(embedFrameTarget(true, "http://checkout.stripe.com/c/pay/cs_test", APP), "_top");
  assert.equal(embedFrameTarget(true, "http://www.paypal.com/checkoutnow", APP), "_blank");
  assert.equal(embedFrameTarget(true, "http://workout.lemonsqueezy.com/checkout", APP), "_blank");
  assert.equal(embedFrameTarget(true, "https://www.peptideos.us/login", APP), "_top");
  assert.equal(embedFrameTarget(true, "https://www.peptideos.us/dashboard", APP), "_top");
  assert.equal(embedFrameTarget(true, "https://notstripe.com/checkout", APP), "_blank");
  assert.equal(embedFrameTarget(true, "/en/premium", APP), null);
  assert.equal(embedFrameTarget(true, "/fr/leaderboard", APP), null);
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

test("premium and leaderboard stay in the pane and only https payment hosts leave at the top", () => {
  assert.equal(checkoutBreakoutTarget(false, "https://checkout.stripe.com/c/pay/cs_test", APP), "self");
  assert.equal(checkoutBreakoutTarget(true, "/en/premium", APP), "self");
  assert.equal(checkoutBreakoutTarget(true, "/fr/leaderboard", APP), "self");
  assert.equal(checkoutBreakoutTarget(true, `${APP}/en/premium`, APP), "self");
  assert.equal(checkoutBreakoutTarget(true, "https://checkout.stripe.com/c/pay/cs_test", APP), "_top");
  assert.equal(checkoutBreakoutTarget(true, "https://billing.stripe.com/p/session", APP), "_top");
  assert.equal(checkoutBreakoutTarget(true, "https://www.paypal.com/checkoutnow", APP), "_top");
  assert.equal(checkoutBreakoutTarget(true, "https://workout.lemonsqueezy.com/checkout", APP), "_top");
  assert.equal(checkoutBreakoutTarget(true, "http://checkout.stripe.com/c/pay/cs_test", APP), "refuse");
  assert.equal(checkoutBreakoutTarget(true, "https://pay.example.test/session", APP), "refuse");
  assert.equal(checkoutBreakoutTarget(true, "https://notstripe.com/checkout", APP), "refuse");
  assert.equal(checkoutBreakoutTarget(true, "https://stripe.com.evil.example/pay", APP), "refuse");
  assert.equal(checkoutBreakoutTarget(true, "//evil.example/phish", APP), "refuse");

  const calls: string[] = [];
  const runtime = (embed: boolean) => ({
    embed,
    pageOrigin: APP,
    assignSelf: (href: string) => calls.push(`self:${href}`),
    assignTop: (href: string) => calls.push(`top:${href}`)
  });
  assignCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test", runtime(true));
  assignCheckoutUrl("https://www.paypal.com/checkoutnow", runtime(true));
  assignCheckoutUrl(`${APP}/api/premium/billing-portal`, runtime(true));
  assignCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test", runtime(false));
  assignCheckoutUrl("https://pay.example.test/session?token=secret", runtime(false));

  const refused = "https://pay.example.test/session?token=secret";
  const logs: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args);
  };
  try {
    assignCheckoutUrl(refused, runtime(true));
    assignCheckoutUrl("http://checkout.stripe.com/c/pay/cs_test", runtime(true));
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(calls, [
    "top:https://checkout.stripe.com/c/pay/cs_test",
    "top:https://www.paypal.com/checkoutnow",
    `self:${APP}/api/premium/billing-portal`,
    "self:https://checkout.stripe.com/c/pay/cs_test",
    "self:https://pay.example.test/session?token=secret"
  ]);
  assert.deepEqual(logs, [
    ["Refused embed checkout navigation to a non-payment host"],
    ["Refused embed checkout navigation to a non-payment host"]
  ]);
  assert.equal(JSON.stringify(logs).includes(refused), false);
  assert.equal(JSON.stringify(logs).includes("pay.example.test"), false);
  assert.equal(JSON.stringify(logs).includes("token"), false);
  assert.equal(JSON.stringify(logs).includes("stripe.com"), false);

  const card = readFileSync("src/features/premium/ui/premium-upgrade-card.tsx", "utf8");
  const header = readFileSync("src/features/layout/Header.tsx", "utf8");
  assert.match(card, /assignCheckoutUrl\(result\.checkoutUrl\)/);
  assert.doesNotMatch(card, /location\.href\s*=\s*result\.checkoutUrl/);
  assert.match(header, /assignCheckoutUrl\(data\.url\)/);
  assert.doesNotMatch(header, /location\.href\s*=\s*data\.url/);
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
  assert.doesNotMatch(script, /data-wc-entry/);
  assert.doesNotMatch(script, /\/premium","\/leaderboard/);
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
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
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

function dispatch(
  documentNode: FakeElement,
  type: string,
  target: FakeElement,
  extras?: Partial<Pick<FakeEvent, "button" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">>
) {
  const event: FakeEvent = {
    target,
    defaultPrevented: false,
    stopped: false,
    button: extras?.button ?? 0,
    ctrlKey: extras?.ctrlKey ?? false,
    metaKey: extras?.metaKey ?? false,
    shiftKey: extras?.shiftKey ?? false,
    altKey: extras?.altKey ?? false,
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

function boot(
  search: string,
  stored: string | null,
  options?: { topLevel?: boolean; fetch?: (input: unknown, init?: unknown) => Promise<Response> }
) {
  const store = new Map<string, string>();
  if (stored !== null) store.set(EMBED_SESSION_KEY, stored);
  const root = element("html");
  const documentNode = element("document");
  const localWrites: string[] = [];
  const assigned: string[] = [];
  let cookie = "";
  let storedDuringOpen: string | null | undefined;
  const context = {
    parent: null as unknown,
    fetch: options?.fetch,
    open() {
      storedDuringOpen = store.get(EMBED_SESSION_KEY) ?? null;
      return null;
    },
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      }
    },
    localStorage: {
      getItem: () => null,
      setItem: (key: string) => {
        localWrites.push(key);
      }
    },
    location: {
      search,
      origin: APP,
      assign: (href: string) => {
        assigned.push(href);
      }
    },
    document: {
      documentElement: root,
      addEventListener: documentNode.addEventListener.bind(documentNode),
      get cookie() {
        return cookie;
      },
      set cookie(value: string) {
        cookie = value;
      }
    }
  };
  context.parent = options?.topLevel ? context : {};
  const run = new Function("window", "document", "sessionStorage", "localStorage", "location", embedBootScript());
  run(context, context.document, context.sessionStorage, context.localStorage, context.location);
  return {
    store,
    root,
    documentNode,
    localWrites,
    assigned,
    cookie: () => cookie,
    fetch: context.fetch,
    open: () => context.open(),
    storedDuringOpen: () => storedDuringOpen
  };
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
  const signOutEvent = dispatch(on.documentNode, "click", signOut);
  assert.equal(signOutEvent.defaultPrevented, true);
  assert.notEqual(signOut.getAttribute("target"), "_top");
  assert.deepEqual(on.assigned, ["/?embed=1"]);

  const evilSignOut = element("a", { href: "https://evil.com/auth/signout" }, on.documentNode);
  dispatch(on.documentNode, "click", evilSignOut);
  assert.equal(evilSignOut.getAttribute("target"), "_blank");

  const lookalike = element("a", { href: "https://peptideos.us.evil.example/api/workouts/signout" }, on.documentNode);
  dispatch(on.documentNode, "click", lookalike);
  assert.equal(lookalike.getAttribute("target"), "_blank");

  const peptideSignOut = element("a", { href: `${POS}/auth/signout` }, on.documentNode);
  const peptideEvent = dispatch(on.documentNode, "click", peptideSignOut);
  assert.equal(peptideEvent.defaultPrevented, true);
  assert.notEqual(peptideSignOut.getAttribute("target"), "_top");
  assert.deepEqual(on.assigned, ["/?embed=1"]);

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
  assert.equal(premiumEvent.defaultPrevented, false);
  assert.equal(premium.getAttribute("target"), null);

  const leaderboard = element("a", { href: "/fr/leaderboard" }, on.documentNode);
  const leaderboardEvent = dispatch(on.documentNode, "click", leaderboard);
  assert.equal(leaderboardEvent.defaultPrevented, false);
  assert.equal(leaderboard.getAttribute("target"), null);

  const stripe = element("a", { href: "https://checkout.stripe.com/c/pay/cs_test" }, on.documentNode);
  dispatch(on.documentNode, "click", stripe);
  assert.equal(stripe.getAttribute("target"), "_top");

  const insecureStripe = element("a", { href: "http://checkout.stripe.com/c/pay/cs_test" }, on.documentNode);
  dispatch(on.documentNode, "click", insecureStripe);
  assert.equal(insecureStripe.getAttribute("target"), "_blank");
  assert.notEqual(insecureStripe.getAttribute("target"), "_top");
  const plainHttp = element("a", { href: "http://example.com/video" }, on.documentNode);
  dispatch(on.documentNode, "click", plainHttp);
  assert.equal(insecureStripe.getAttribute("target"), plainHttp.getAttribute("target"));

  const entry = element("button", { "data-wc-entry": "premium" }, on.documentNode);
  const entryEvent = dispatch(on.documentNode, "click", entry);
  assert.equal(entryEvent.defaultPrevented, false);

  const form = element("form", { action: `${POS}/api/workouts/signout` }, on.documentNode);
  const formEvent = dispatch(on.documentNode, "submit", form);
  assert.equal(formEvent.defaultPrevented, true);
  assert.notEqual(form.getAttribute("target"), "_top");

  const off = boot("", null);
  const leaked = element("a", { href: "https://example.com/video" }, off.documentNode);
  dispatch(off.documentNode, "click", leaked);
  assert.equal(leaked.getAttribute("target"), null);
});

test("a top-level tab clears a leaked embed flag and does not post logout", () => {
  const leaked = boot("?embed=1", "1", { topLevel: true });
  assert.equal(leaked.root.getAttribute("data-wc-embed"), null);
  assert.equal(leaked.store.has(EMBED_SESSION_KEY), false);
  assert.match(leaked.cookie(), /Max-Age=0/);
  assert.equal(
    postEmbedLogoutToParent({
      embed: true,
      topLevel: true,
      parent: { postMessage() {} },
      referrer: POS
    }),
    false
  );
});

test("new-tab clicks and window.open drop the embed flag, then the frame restores it", async () => {
  const on = boot("?embed=1", null);
  const same = element("a", { href: "/en/programs" }, on.documentNode);
  dispatch(on.documentNode, "click", same);
  assert.equal(on.store.get(EMBED_SESSION_KEY), "1");
  assert.match(on.cookie(), /wc-embed=1/);

  const modified = dispatch(on.documentNode, "click", same, { ctrlKey: true });
  assert.equal(modified.defaultPrevented, false);
  assert.equal(on.store.has(EMBED_SESSION_KEY), false);
  assert.match(on.cookie(), /Max-Age=0/);
  assert.equal(on.root.getAttribute("data-wc-embed"), "1");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(on.store.get(EMBED_SESSION_KEY), "1");
  assert.match(on.cookie(), /wc-embed=1/);

  const blank = element("a", { href: "/en/profile", target: "_blank" }, on.documentNode);
  dispatch(on.documentNode, "click", blank);
  assert.equal(on.store.has(EMBED_SESSION_KEY), false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(on.store.get(EMBED_SESSION_KEY), "1");

  const middle = element("a", { href: "/en/leaderboard" }, on.documentNode);
  dispatch(on.documentNode, "auxclick", middle, { button: 1 });
  assert.equal(on.store.has(EMBED_SESSION_KEY), false);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const meta = element("a", { href: "/en/premium" }, on.documentNode);
  dispatch(on.documentNode, "click", meta, { metaKey: true });
  assert.equal(on.store.has(EMBED_SESSION_KEY), false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  dispatch(on.documentNode, "click", meta, { shiftKey: true });
  assert.equal(on.store.has(EMBED_SESSION_KEY), false);
  await new Promise((resolve) => setTimeout(resolve, 0));

  on.open();
  assert.equal(on.storedDuringOpen(), null);
  assert.equal(on.store.get(EMBED_SESSION_KEY), "1");
  assert.match(on.cookie(), /wc-embed=1/);
  assert.equal(on.root.getAttribute("data-wc-embed"), "1");

  const external = element("a", { href: "http://checkout.stripe.com/c/pay/cs_test" }, on.documentNode);
  dispatch(on.documentNode, "click", external);
  assert.equal(external.getAttribute("target"), "_blank");
  assert.equal(on.store.has(EMBED_SESSION_KEY), false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(on.store.get(EMBED_SESSION_KEY), "1");
});

function runSessionBootstrap(input: { ancestorOrigins?: string[]; referrer?: string; topLevel?: boolean }) {
  const calls: Array<{ message: { type?: string; state?: string }; origin: string }> = [];
  const parent = {
    postMessage(message: { type?: string; state?: string }, origin: string) {
      calls.push({ message, origin });
    }
  };
  const windowObj = { parent: null as unknown };
  windowObj.parent = input.topLevel ? windowObj : parent;
  const run = new Function("window", "document", "location", embedSignedOutSessionBootstrap());
  run(windowObj, { referrer: input.referrer ?? "" }, { ancestorOrigins: input.ancestorOrigins ?? [] });
  return calls;
}

function bootFrameTarget(href: string, peptideOrigin?: string): string | null {
  const script = embedBootScript(peptideOrigin);
  const start = script.indexOf("function stripLocale");
  const end = script.indexOf("function holdSignout");
  const listed = script.match(/var PARENTS=(\[[\s\S]*?\]);/);
  const parents = JSON.parse(listed?.[1] ?? "[]") as string[];
  const run = new Function("PARENTS", "location", "href", `${script.slice(start, end)}\nreturn frameTarget(href);`);
  return run(parents, { origin: APP }, href) as string | null;
}

test("isEmbedFrame ignores a top-level document even when the embed attribute is set", () => {
  const host = globalThis as { window?: unknown; document?: unknown };
  const previousWindow = host.window;
  const previousDocument = host.document;
  const element = {
    value: "1",
    getAttribute() {
      return this.value;
    }
  };
  const win = { parent: null as unknown, document: { documentElement: element } };
  win.parent = win;
  host.window = win;
  host.document = win.document;
  try {
    assert.equal(isEmbedFrame(), false);
    win.parent = {};
    assert.equal(isEmbedFrame(), true);
    element.value = "0";
    assert.equal(isEmbedFrame(), false);
  } finally {
    host.window = previousWindow;
    host.document = previousDocument;
  }
});

test("framed logout posts wc:signed-out and does not run the server action", () => {
  const calls: Array<{ message: { type: string; reason: string }; origin: string }> = [];
  const record = (message: unknown, origin: string) => {
    if (!message || typeof message !== "object") return;
    const posted = message as { type: string; reason: string };
    calls.push({ message: posted, origin });
  };
  assert.equal(
    postEmbedLogoutToParent({
      embed: true,
      topLevel: false,
      parent: { postMessage: record },
      ancestorOrigins: ["https://www.peptideos.us"]
    }),
    true
  );
  assert.deepEqual(calls, [{ message: { type: "wc:signed-out", reason: "logout" }, origin: "https://www.peptideos.us" }]);
  assert.equal(
    postEmbedLogoutToParent({
      embed: true,
      topLevel: false,
      parent: { postMessage: record },
      referrer: "https://evil.example/dashboard",
      ancestorOrigins: ["https://peptideos.us.evil.example"]
    }),
    true
  );
  assert.deepEqual(
    calls.slice(1).map((call) => call.origin),
    ["https://peptideos.us", "https://www.peptideos.us"]
  );
  assert.equal(JSON.stringify(calls).includes("*"), false);

  const logout = readFileSync("src/features/auth/model/useLogout.ts", "utf8");
  const body = logout.slice(logout.indexOf("mutationFn"));
  const embedAt = body.indexOf("isEmbedFrame()");
  const postAt = body.indexOf("postEmbedLogoutToParent()");
  const returnAt = body.indexOf("return;");
  const actionAt = body.indexOf("() => signOutAction()");
  assert.ok(embedAt !== -1 && postAt !== -1 && returnAt !== -1 && actionAt !== -1);
  assert.ok(embedAt < postAt && postAt < returnAt && returnAt < actionAt);
  assert.match(logout, /wc:signed-out/);

  const action = readFileSync("src/features/auth/signout/model/signout.action.ts", "utf8");
  assert.doesNotMatch(action, /shouldSkipEmbedSignOut|isExplicitEmbedSignOutSignal|EMBED_COOKIE_NAME/);
  assert.doesNotMatch(action, /redirect\("\/\?embed=1"\)/);
  assert.match(action, /redirect\("\/auth\/signout\/continue"\)/);
  const signOutAt = action.indexOf("auth.api.signOut");
  const continueRedirect = action.indexOf("redirect(\"/auth/signout/continue\")");
  assert.ok(signOutAt !== -1 && continueRedirect !== -1);
  assert.ok(signOutAt < continueRedirect);

  const handoff = readFileSync("src/features/auth/signout/ui/peptideos-signout-handoff.tsx", "utf8");
  assert.match(handoff, /window\.parent !== window/);
  assert.match(handoff, /shouldAutoSubmitSignoutHandoff\(autoSubmit, framed\)/);
  assert.doesNotMatch(handoff, /form\.target|_top/);
});

test("a top-level sign-out with the wc-embed cookie still signs out", () => {
  const action = readFileSync("src/features/auth/signout/model/signout.action.ts", "utf8");
  assert.doesNotMatch(action, /shouldSkipEmbedSignOut|isExplicitEmbedSignOutSignal|embedded:\s*true|EMBED_COOKIE_NAME/);
  const signOutAt = action.indexOf("auth.api.signOut");
  const continueAt = action.indexOf("redirect(\"/auth/signout/continue\")");
  assert.ok(signOutAt !== -1 && continueAt !== -1);
  assert.ok(signOutAt < continueAt);

  const logout = readFileSync("src/features/auth/model/useLogout.ts", "utf8");
  const body = logout.slice(logout.indexOf("mutationFn"));
  assert.match(body, /\(\) => signOutAction\(\)/);
  assert.doesNotMatch(body, /signOutAction\(\s*\{\s*embedded:\s*true/);
  assert.match(body, /isEmbedFrame\(\)/);
  assert.match(readFileSync("src/features/auth/signout/ui/peptideos-signout-handoff.tsx", "utf8"), /window\.parent !== window/);
});

test("an embedded sign-out never navigates the top window", () => {
  assert.equal(embedFrameTarget(true, "/en/auth/signout", APP), null);
  assert.notEqual(embedFrameTarget(true, `${APP}/auth/signout`, APP), "_top");
  assert.notEqual(embedFrameTarget(true, `${POS}/auth/signout`, APP), "_top");
  assert.notEqual(embedFrameTarget(true, `${POS}/api/workouts/signout`, APP), "_top");
  assert.equal(shouldAutoSubmitSignoutHandoff(true, true), false);
  assert.equal(shouldAutoSubmitSignoutHandoff(true, false), true);
  assert.equal(shouldAutoSubmitSignoutHandoff(false, false), false);

  const handoff = readFileSync("src/features/auth/signout/ui/peptideos-signout-handoff.tsx", "utf8");
  assert.match(handoff, /window\.parent !== window/);
  assert.doesNotMatch(handoff, /form\.target|\btarget\s*=\s*["']_top["']/);
});

test("outbound origin uses ancestorOrigins[0], then the referrer, otherwise both allowlisted origins", () => {
  assert.deepEqual([...EMBED_PARENT_ORIGINS], ["https://peptideos.us", "https://www.peptideos.us"]);
  assert.deepEqual(resolveEmbedOutboundOrigins({ ancestorOrigins: ["https://www.peptideos.us"] }), ["https://www.peptideos.us"]);
  assert.deepEqual(
    resolveEmbedOutboundOrigins({
      ancestorOrigins: ["https://peptideos.us.evil.com", "https://www.peptideos.us"],
      referrer: "https://peptideos.us/dashboard"
    }),
    ["https://peptideos.us"]
  );
  assert.deepEqual(resolveEmbedOutboundOrigins({ referrer: "https://www.peptideos.us/dashboard" }), [
    "https://www.peptideos.us"
  ]);
  assert.deepEqual(resolveEmbedOutboundOrigins({ referrer: "https://peptideos.us.evil.com/" }), [...EMBED_PARENT_ORIGINS]);
  assert.deepEqual(resolveEmbedOutboundOrigins({ referrer: "http://peptideos.us/" }), [...EMBED_PARENT_ORIGINS]);
  assert.deepEqual(resolveEmbedOutboundOrigins({ ancestorOrigins: ["https://evil.peptideos.us"] }), [...EMBED_PARENT_ORIGINS]);
  assert.deepEqual(resolveEmbedOutboundOrigins({}), [...EMBED_PARENT_ORIGINS]);

  const fromAncestor = runSessionBootstrap({
    ancestorOrigins: ["https://www.peptideos.us"],
    referrer: "https://peptideos.us/dashboard"
  });
  assert.deepEqual(fromAncestor.map((call) => call.origin), ["https://www.peptideos.us"]);
  assert.equal(fromAncestor[0]?.message.type, "wc:session");
  assert.equal(fromAncestor[0]?.message.state, "signed-out");

  const forged = runSessionBootstrap({
    ancestorOrigins: ["https://peptideos.us.evil.com"],
    referrer: "http://peptideos.us/dashboard"
  });
  assert.deepEqual(forged.map((call) => call.origin), [...EMBED_PARENT_ORIGINS]);
  assert.equal(JSON.stringify(forged).includes("*"), false);
  assert.equal(JSON.stringify(forged).includes("evil.com"), false);

  const both = runSessionBootstrap({ referrer: "" });
  assert.deepEqual(both.map((call) => call.origin), [...EMBED_PARENT_ORIGINS]);

  // One-shot inline script: no message listener, so a later wc:theme cannot retarget it.
  const bootstrap = embedSignedOutSessionBootstrap();
  assert.doesNotMatch(bootstrap, /addEventListener/);
  assert.doesNotMatch(bootstrap, /onmessage/);
});

test("boot script rewrites an embedded sign-out server-action redirect to a frameable page", async () => {
  const native = async () =>
    new Response("flight", {
      headers: {
        "content-type": "text/x-component",
        "x-action-redirect": "/en/auth/signout/continue;push"
      }
    });
  const on = boot("?embed=1", null, { fetch: native });
  const response = await on.fetch?.("/");
  assert.ok(response);
  assert.equal(response.headers.get("x-action-redirect"), "/?embed=1;push");
  assert.equal(response.headers.get("content-type"), null);

  const top = boot("?embed=1", "1", { topLevel: true, fetch: native });
  const unchanged = await top.fetch?.("/");
  assert.equal(unchanged?.headers.get("x-action-redirect"), "/en/auth/signout/continue;push");
  assert.equal(unchanged?.headers.get("content-type"), "text/x-component");
});

test("an embedded gated request gets a frameable signed-out document and no X-Frame-Options", async () => {
  assert.equal(isEmbedDocumentRequest("?embed=1", null), true);
  assert.equal(isEmbedDocumentRequest("", "1"), false);
  assert.equal(isEmbedDocumentRequest("", null), false);
  assert.equal(isEmbedDocumentRequest("?embed=0", "0"), false);
  assert.equal(isEmbedDocumentRequest("?embed=1", "1", "iframe"), true);
  assert.equal(isEmbedDocumentRequest("", null, "iframe"), true);
  assert.equal(isEmbedDocumentRequest("", null, "frame"), true);
  assert.equal(isEmbedDocumentRequest("?embed=1", "1", "document"), false);
  assert.equal(isEmbedDocumentRequest("", "1", "document"), false);

  const response = embedSignedOutDocumentResponse("https://peptideos.us", APP);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-frame-options"), null);
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'self' https:\/\/peptideos\.us https:\/\/www\.peptideos\.us/);
  assert.match(html, /wc:session/);
  assert.match(html, /signed-out/);
  assert.match(html, /← Back to dashboard/);
  assert.match(html, /x-action-redirect/);
  assert.doesNotMatch(html, /postMessage\([^)]*["']\*["']/);
  assert.doesNotMatch(embedSignedOutSessionBootstrap(), /setTimeout/);
  assert.match(readFileSync("proxy.ts", "utf8"), /embedNeedsFallback/);
});

test("a framed sign-out fallback posts no messages", async () => {
  const response = embedSignedOutDocumentResponse("https://peptideos.us", APP, { postSession: false });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.doesNotMatch(html, /postMessage/);
  assert.doesNotMatch(html, /wc:session/);
  assert.doesNotMatch(html, /wc:signed-out/);
  assert.match(readFileSync("proxy.ts", "utf8"), /postSession:\s*!isEmbedUnframeableSignoutPath\(pathname\)/);
});

test("a top-level tab clearing the embed cookie does not unframe the next iframe", async () => {
  const iframe = boot("?embed=1", null);
  assert.match(iframe.cookie(), /wc-embed=1/);
  assert.equal(iframe.root.getAttribute("data-wc-embed"), "1");

  const openedTab = boot("?embed=1", "1", { topLevel: true });
  assert.match(openedTab.cookie(), /Max-Age=0/);
  assert.equal(openedTab.root.getAttribute("data-wc-embed"), null);

  const previousPeptide = process.env.NEXT_PUBLIC_PEPTIDEOS_URL;
  const previousApp = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_PEPTIDEOS_URL = POS;
  process.env.NEXT_PUBLIC_APP_URL = APP;
  try {
    const afterClear = await proxy(
      new NextRequest(`${APP}/en/profile`, {
        headers: { "sec-fetch-dest": "iframe" }
      })
    );
    assert.equal(afterClear.status, 200);
    assert.equal(afterClear.headers.get("location"), null);
    assert.match(await afterClear.text(), /data-wc-embed-fallback/);

    const cookieStillSet = await proxy(
      new NextRequest(`${APP}/en/profile`, {
        headers: { cookie: "wc-embed=1", "sec-fetch-dest": "iframe" }
      })
    );
    assert.equal(cookieStillSet.status, 200);
    assert.equal(cookieStillSet.headers.get("location"), null);

    const otherDest = await proxy(
      new NextRequest(`${APP}/en/profile?embed=1`, {
        headers: { cookie: "wc-embed=1", "sec-fetch-dest": "document" }
      })
    );
    assert.equal(otherDest.status, 307);
    assert.ok(otherDest.headers.get("location"));
  } finally {
    if (previousPeptide === undefined) delete process.env.NEXT_PUBLIC_PEPTIDEOS_URL;
    else process.env.NEXT_PUBLIC_PEPTIDEOS_URL = previousPeptide;
    if (previousApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousApp;
  }
});

test("a missing Sec-Fetch-Dest plus only the wc-embed cookie is not framed", async () => {
  assert.equal(isEmbedDocumentRequest("", "1", null), false);
  assert.equal(isEmbedDocumentRequest("", "1", undefined), false);

  const previousPeptide = process.env.NEXT_PUBLIC_PEPTIDEOS_URL;
  const previousApp = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_PEPTIDEOS_URL = POS;
  process.env.NEXT_PUBLIC_APP_URL = APP;
  try {
    const response = await proxy(
      new NextRequest(`${APP}/en/profile`, {
        headers: { cookie: "wc-embed=1" }
      })
    );
    assert.equal(response.status, 307);
    assert.ok(response.headers.get("location"));
    assert.equal(response.headers.get("content-type"), null);
  } finally {
    if (previousPeptide === undefined) delete process.env.NEXT_PUBLIC_PEPTIDEOS_URL;
    else process.env.NEXT_PUBLIC_PEPTIDEOS_URL = previousPeptide;
    if (previousApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousApp;
  }
});

async function withPeptideEnv<T>(run: () => Promise<T>): Promise<T> {
  const previousPeptide = process.env.NEXT_PUBLIC_PEPTIDEOS_URL;
  const previousApp = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_PEPTIDEOS_URL = POS;
  process.env.NEXT_PUBLIC_APP_URL = APP;
  try {
    return await run();
  } finally {
    if (previousPeptide === undefined) delete process.env.NEXT_PUBLIC_PEPTIDEOS_URL;
    else process.env.NEXT_PUBLIC_PEPTIDEOS_URL = previousPeptide;
    if (previousApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousApp;
  }
}

test("a top-level ?embed=1 with no Sec-Fetch-Dest header does not turn on embed chrome", async () => {
  assert.equal(isEmbedDocumentRequest("?embed=1", null, null), true);
  assert.equal(isEmbedDocumentRequest("?embed=1", "1", undefined), true);

  const topLevel = boot("?embed=1", "1", { topLevel: true });
  assert.equal(topLevel.root.getAttribute("data-wc-embed"), null);
  assert.equal(topLevel.store.has(EMBED_SESSION_KEY), false);
  assert.match(topLevel.cookie(), /Max-Age=0/);

  const framed = boot("?embed=1", null);
  assert.equal(framed.root.getAttribute("data-wc-embed"), "1");

  await withPeptideEnv(async () => {
    const response = await proxy(new NextRequest(`${APP}/en/profile?embed=1`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);
    const html = await response.text();
    assert.match(html, /window\.parent!==window/);
    assert.match(html, /enable=framed&&/);
    assert.doesNotMatch(html, /data-wc-embed="1"/);
  });
});

function runTopLevelEmbedEscape(href: string, topLevel: boolean): string | null {
  let replaced: string | null = null;
  const windowObj = { parent: null as unknown };
  windowObj.parent = topLevel ? windowObj : {};
  const location = {
    href,
    replace(next: string) {
      replaced = next;
    }
  };
  const run = new Function("window", "location", embedTopLevelEmbedQueryEscape());
  run(windowObj, location);
  return replaced;
}

test("a top-level fallback drops embed=1 and stays on the same path", async () => {
  const script = embedTopLevelEmbedQueryEscape();
  assert.doesNotMatch(script, /https?:/);
  assert.doesNotMatch(script, /peptideos\.us/);
  assert.equal(runTopLevelEmbedEscape(`${APP}/en/profile?embed=1`, true), "/en/profile");
  assert.equal(runTopLevelEmbedEscape(`${APP}/en/profile?embed=1&theme=dark`, true), "/en/profile?theme=dark");
  assert.equal(runTopLevelEmbedEscape(`${APP}/en/profile?foo=1&embed=1#sets`, true), "/en/profile?foo=1#sets");
  assert.equal(runTopLevelEmbedEscape(`${APP}/en/profile?theme=dark`, true), null);
  assert.equal(runTopLevelEmbedEscape(`${APP}/en/profile?embed=1`, false), null);
  assert.equal(runTopLevelEmbedEscape("https://peptideos.us.evil.com/en/profile?embed=1", true), "/en/profile");

  await withPeptideEnv(async () => {
    const response = await proxy(new NextRequest(`${APP}/en/profile?embed=1`));
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.equal(html.includes(script), true);
    assert.doesNotMatch(html, /location\.replace\([^)]*https?:/);
  });
});

test("a framed request with no session posts wc:session immediately and sign-out posts nothing", async () => {
  await withPeptideEnv(async () => {
    const framed = await proxy(
      new NextRequest(`${APP}/en/profile`, {
        headers: { "sec-fetch-dest": "iframe" }
      })
    );
    assert.equal(framed.status, 200);
    assert.equal(framed.headers.get("location"), null);
    const html = await framed.text();
    assert.match(html, /data-wc-embed-fallback/);
    const bootstrap = embedSignedOutSessionBootstrap();
    assert.match(html, /wc:session/);
    assert.match(html, /signed-out/);
    assert.doesNotMatch(bootstrap, /setTimeout/);
    assert.equal(html.includes(bootstrap), true);
    const posts = runSessionBootstrap({});
    assert.deepEqual(
      posts.map((call) => call.origin),
      [...EMBED_PARENT_ORIGINS]
    );
    assert.deepEqual(
      posts.map((call) => call.message),
      EMBED_PARENT_ORIGINS.map(() => ({ type: "wc:session", state: "signed-out" }))
    );
    assert.equal(JSON.stringify(posts).includes("*"), false);

    const signout = await proxy(
      new NextRequest(`${APP}/en/auth/signout`, {
        headers: { "sec-fetch-dest": "iframe" }
      })
    );
    assert.equal(signout.status, 200);
    assert.equal(signout.headers.get("location"), null);
    const signoutHtml = await signout.text();
    assert.match(signoutHtml, /data-wc-embed-fallback/);
    assert.doesNotMatch(signoutHtml, /postMessage/);
    assert.doesNotMatch(signoutHtml, /wc:session/);
    assert.doesNotMatch(signoutHtml, /wc:signed-out/);
  });
});

test("Sec-Fetch-Dest decides framing and the embed cookie never does", () => {
  const cleared = boot("?embed=1", "1", { topLevel: true });
  assert.match(cleared.cookie(), /Max-Age=0/);
  assert.equal(cleared.root.getAttribute("data-wc-embed"), null);
  assert.equal(isEmbedDocumentRequest("", null, "iframe"), true);
  assert.equal(isEmbedDocumentRequest("", null, "frame"), true);
  assert.equal(isEmbedDocumentRequest("?embed=1", "1", "document"), false);
  assert.equal(isEmbedDocumentRequest("?embed=1", "1", "empty"), false);
  assert.equal(isEmbedDocumentRequest("?embed=1", "1", "script"), false);
  assert.equal(isEmbedDocumentRequest("", "1", null), false);
  assert.equal(isEmbedDocumentRequest("", "1", undefined), false);
  assert.equal(isEmbedDocumentRequest("?embed=1", "1", null), true);

  const topLevelQuery = boot("?embed=1", null, { topLevel: true });
  assert.equal(topLevelQuery.root.getAttribute("data-wc-embed"), null);
  assert.equal(topLevelQuery.store.has(EMBED_SESSION_KEY), false);
});

test("boot frameTarget does not send a parent-origin sign-out link to _top", () => {
  assert.equal(bootFrameTarget(`${POS}/auth/signout`), null);
  assert.notEqual(bootFrameTarget("https://www.peptideos.us/auth/signout"), "_top");
  assert.equal(bootFrameTarget(`${POS}/login`), "_top");
  assert.equal(bootFrameTarget("https://peptideos.us.evil.com/login"), "_blank");
});

test("a bad peptide origin is not added to the boot allowlist", () => {
  for (const bad of ["https://peptideos.us.evil.com", "http://peptideos.us", "https://evil.peptideos.us", "not a url"]) {
    const script = embedBootScript(bad);
    const listed = script.match(/var PARENTS=(\[[\s\S]*?\]);/);
    assert.ok(listed);
    assert.deepEqual(JSON.parse(listed[1]) as string[], [...EMBED_PARENT_ORIGINS]);
  }
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
  assert.match(header, /data-wc-signout/);
  assert.match(readFileSync("src/features/user/ui/UserDropdown.tsx", "utf8"), /data-wc-signout/);
  assert.match(readFileSync("src/features/admin/layout/admin-header.tsx", "utf8"), /data-wc-signout/);
  assert.match(readFileSync("src/features/auth/verify-email/ui/verify-email-page.tsx", "utf8"), /data-wc-signout/);
  assert.match(readFileSync("app/[locale]/(app)/auth/signout/page.tsx", "utf8"), /data-wc-signout/);
  assert.match(footer, /data-wc-chrome="footer"/);
  assert.match(nav, /data-wc-chrome="nav"/);
  assert.match(nav, /leaderboard/);
  assert.match(nav, /premium/);

  const root = readFileSync("app/[locale]/layout.tsx", "utf8");
  assert.match(root, /embedBootScript/);
  assert.match(root, /bg-hero-light/);
  assert.match(root, /data-wc-frame/);
  assert.match(root, /subsets:\s*\["latin"\]/);
  assert.match(root, /display:\s*"swap"/);
});
