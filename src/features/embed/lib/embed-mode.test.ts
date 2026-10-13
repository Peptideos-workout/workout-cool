import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { EmbedAuthFallbackView } from "../ui/embed-auth-fallback-view";
import { embedSignedOutDocumentResponse, isEmbedDocumentRequest } from "./embed-signed-out-document";
import {
  EMBED_BACK_TO_DASHBOARD,
  EMBED_PARENT_ORIGINS,
  EMBED_SESSION_KEY,
  assignCheckoutUrl,
  checkoutBreakoutTarget,
  embedFrameTarget,
  isEmbedSsoSignal,
  isSsoFailureCode,
  postEmbedLogoutToParent,
  resolveEmbedEnabled,
  resolveEmbedParentOrigin,
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

test("boot script stores embed in sessionStorage and never posts to a wildcard origin", () => {
  const script = embedBootScript();
  assert.doesNotMatch(script, /data-wc-entry/);
  assert.doesNotMatch(script, /\/premium","\/leaderboard/);
  assert.match(script, /sessionStorage/);
  assert.match(script, new RegExp(EMBED_SESSION_KEY));
  assert.match(script, /wc-embed-theme/);
  assert.doesNotMatch(script, /localStorage\.setItem\("theme"/);
  assert.doesNotMatch(script, /localStorage\.setItem\([^)]*wc-embed/);
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
  assert.equal(calls[1]?.origin, "https://peptideos.us");
  assert.equal(JSON.stringify(calls).includes("*"), false);

  const logout = readFileSync("src/features/auth/model/useLogout.ts", "utf8");
  const body = logout.slice(logout.indexOf("mutationFn"));
  const embedAt = body.indexOf("isEmbedFrame()");
  const markAt = body.indexOf("markExplicitEmbedLogout(pathname)");
  const postAt = body.indexOf("postEmbedLogoutToParent()");
  const returnAt = body.indexOf("return;");
  const actionAt = body.indexOf("() => signOutAction()");
  assert.ok(embedAt !== -1 && markAt !== -1 && postAt !== -1 && returnAt !== -1 && actionAt !== -1);
  assert.ok(embedAt < markAt && markAt < postAt && postAt < returnAt && returnAt < actionAt);
  assert.match(logout, /wc:signed-out/);

  const action = readFileSync("src/features/auth/signout/model/signout.action.ts", "utf8");
  assert.match(action, /EMBED_COOKIE_NAME/);
  assert.doesNotMatch(action, /redirect\("\/\?embed=1"\)/);
  assert.match(action, /redirect\("\/auth\/signout\/continue"\)/);
  const cookieAt = action.indexOf("EMBED_COOKIE_NAME");
  const signOutAt = action.indexOf("auth.api.signOut");
  const continueRedirect = action.indexOf("redirect(\"/auth/signout/continue\")");
  assert.ok(cookieAt !== -1 && signOutAt !== -1 && continueRedirect !== -1);
  assert.ok(cookieAt < signOutAt && signOutAt < continueRedirect);

  const handoff = readFileSync("src/features/auth/signout/ui/peptideos-signout-handoff.tsx", "utf8");
  assert.match(handoff, /autoSubmit && !embedded/);
  assert.doesNotMatch(handoff, /form\.target|_top/);
});

test("parent origin is an exact frame-ancestors match, otherwise the apex", () => {
  assert.deepEqual([...EMBED_PARENT_ORIGINS], ["https://peptideos.us", "https://www.peptideos.us"]);
  assert.equal(resolveEmbedParentOrigin({ ancestorOrigins: ["https://www.peptideos.us"] }), "https://www.peptideos.us");
  assert.equal(resolveEmbedParentOrigin({ referrer: "https://www.peptideos.us/dashboard" }), "https://www.peptideos.us");
  assert.equal(resolveEmbedParentOrigin({ referrer: "https://peptideos.us.evil.example/" }), "https://peptideos.us");
  assert.equal(resolveEmbedParentOrigin({ ancestorOrigins: ["https://evil.peptideos.us"] }), "https://peptideos.us");
  assert.equal(resolveEmbedParentOrigin({ referrer: "http://peptideos.us/" }), "https://peptideos.us");
  assert.equal(resolveEmbedParentOrigin({}), "https://peptideos.us");
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
  assert.equal(isEmbedDocumentRequest("", "1"), true);
  assert.equal(isEmbedDocumentRequest("", null), false);
  assert.equal(isEmbedDocumentRequest("?embed=0", "0"), false);
  assert.equal(isEmbedDocumentRequest("?embed=1", "1", "iframe"), true);
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
  assert.match(readFileSync("proxy.ts", "utf8"), /embedNeedsFallback/);
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
