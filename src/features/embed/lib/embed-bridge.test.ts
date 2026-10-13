import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

import {
  acceptParentThemeMessage,
  clampReportedHeight,
  createHeightReporter,
  exactOrigin,
  notifyEmbedSignedOut,
  postToParent,
  reportableEmbedPath,
  startEmbedBridge,
  type EmbedBridgeHost,
  type EmbedMessagePort,
  type ParentThemeEvent
} from "./embed-bridge";
import { embedBootScript } from "./embed-boot-script";

const POS = "https://peptideos.us";

test("reported height is an integer from 200 to 20000 and drops invalid values", () => {
  assert.equal(clampReportedHeight(0), 200);
  assert.equal(clampReportedHeight(12.2), 200);
  assert.equal(clampReportedHeight(200), 200);
  assert.equal(clampReportedHeight(450.2), 450);
  assert.equal(clampReportedHeight(20000), 20000);
  assert.equal(clampReportedHeight(20000.6), 20000);
  assert.equal(clampReportedHeight(80000), 20000);
  assert.equal(clampReportedHeight(-1), null);
  assert.equal(clampReportedHeight(Number.NaN), null);
  assert.equal(clampReportedHeight(Number.POSITIVE_INFINITY), null);
  assert.equal(clampReportedHeight("480"), null);
  assert.equal(clampReportedHeight(null), null);
  assert.equal(clampReportedHeight(undefined), null);
});

test("height posts are throttled to one frame and never use a wildcard origin", () => {
  const frames: Array<() => void> = [];
  const calls: Array<{ message: unknown; origin: string }> = [];
  const parent = port(calls);
  const reporter = createHeightReporter((height) => {
    const sent = postToParent(parent, POS, { type: "wc:height", height });
    assert.equal(sent, true);
  }, (callback) => {
    frames.push(callback);
    return frames.length;
  });

  reporter.report(80);
  reporter.report(450.4);
  reporter.report(Number.NaN);
  reporter.report(-20);
  assert.equal(frames.length, 1);
  assert.equal(calls.length, 0);
  frames[0]?.();
  assert.deepEqual(calls, [{ message: { type: "wc:height", height: 450 }, origin: POS }]);
  assert.equal(JSON.stringify(calls).includes("*"), false);

  reporter.report(900);
  assert.equal(frames.length, 2);
  frames[1]?.();
  assert.equal(calls[1]?.message && (calls[1].message as { height: number }).height, 900);
  for (const call of calls) {
    assert.equal(call.origin, POS);
    assert.notEqual(call.origin, "*");
  }
});

test("postToParent refuses wildcard, path, and non-URL origins", () => {
  const calls: Array<{ message: unknown; origin: string }> = [];
  const parent = port(calls);
  const message = { type: "wc:height" as const, height: 200 };

  assert.equal(postToParent(parent, "*", message), false);
  assert.equal(postToParent(parent, "https://peptideos.us/*", message), false);
  assert.equal(postToParent(parent, "https://peptideos.us/dashboard", message), false);
  assert.equal(postToParent(parent, "null", message), false);
  assert.equal(postToParent(parent, "", message), false);
  assert.equal(postToParent(null, POS, message), false);
  assert.equal(calls.length, 0);
  assert.equal(exactOrigin("*"), null);
  assert.equal(postToParent(parent, POS, message), true);
  assert.deepEqual(calls, [{ message, origin: POS }]);
});

test("reportable paths keep locale and search, and drop auth, admin, and protocol tricks", () => {
  assert.equal(reportableEmbedPath("/programs"), "/programs");
  assert.equal(reportableEmbedPath("/fr/programs/push?week=1"), "/fr/programs/push?week=1");
  assert.equal(reportableEmbedPath("/zh-CN/tools/bmi-calculator"), "/zh-CN/tools/bmi-calculator");
  assert.equal(reportableEmbedPath("/en"), "/en");
  assert.equal(reportableEmbedPath("/statistics#today"), "/statistics");
  assert.equal(reportableEmbedPath("/about/"), "/about");
  assert.equal(reportableEmbedPath("/onboarding"), "/onboarding");
  assert.equal(reportableEmbedPath("/legal/privacy"), "/legal/privacy");
  assert.equal(reportableEmbedPath("/profile"), "/profile");

  assert.equal(reportableEmbedPath("/premium"), null);
  assert.equal(reportableEmbedPath("/leaderboard"), null);
  assert.equal(reportableEmbedPath("/auth/signout"), null);
  assert.equal(reportableEmbedPath("/admin/users"), null);
  assert.equal(reportableEmbedPath("/api/workouts"), null);
  assert.equal(reportableEmbedPath("/programs/../admin"), null);
  assert.equal(reportableEmbedPath("//peptideos.us/programs"), null);
  assert.equal(reportableEmbedPath("https://peptideos.us/programs"), null);
  assert.equal(reportableEmbedPath("/programs?next=https://evil.example"), null);
  assert.equal(reportableEmbedPath("javascript:alert(1)"), null);
});

test("parent theme messages require the exact origin, the parent source, and no extra keys", () => {
  const parent = { postMessage() {} };
  const good: ParentThemeEvent = { origin: POS, source: parent, data: { type: "wc:theme", theme: "dark" } };
  assert.equal(acceptParentThemeMessage(good, parent, POS), "dark");
  assert.equal(acceptParentThemeMessage({ ...good, data: { theme: "light", type: "wc:theme" } }, parent, POS), "light");

  assert.equal(acceptParentThemeMessage({ ...good, origin: "https://evil.example" }, parent, POS), null);
  assert.equal(acceptParentThemeMessage({ ...good, origin: "https://peptideos.us.evil.example" }, parent, POS), null);
  assert.equal(acceptParentThemeMessage({ ...good, source: {} }, parent, POS), null);
  assert.equal(acceptParentThemeMessage({ ...good, source: null }, parent, POS), null);
  assert.equal(acceptParentThemeMessage({ ...good, data: { type: "wc:theme", theme: "dark", signOut: true } }, parent, POS), null);
  assert.equal(acceptParentThemeMessage({ ...good, data: { type: "wc:theme", theme: "system" } }, parent, POS), null);
  assert.equal(acceptParentThemeMessage({ ...good, data: { type: "wc:sign-out" } }, parent, POS), null);
  assert.equal(acceptParentThemeMessage({ ...good, data: { type: "wc:theme" } }, parent, POS), null);
  assert.equal(acceptParentThemeMessage({ ...good, data: null }, parent, POS), null);
  assert.equal(acceptParentThemeMessage(good, parent, "*"), null);
});

test("the bridge posts clamped height and path only to the PeptideOS origin", () => {
  const calls: Array<{ message: unknown; origin: string }> = [];
  const frames: Array<() => void> = [];
  const host = bridgeHost(calls, frames, { height: 12000.2, path: "/es/programs?day=2" });
  const stop = startEmbedBridge(host);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { message: { type: "wc:navigate", path: "/es/programs?day=2" }, origin: POS });
  frames[0]?.();
  assert.deepEqual(calls[1], { message: { type: "wc:height", height: 12000 }, origin: POS });
  stop();
  frames[0]?.();
  assert.equal(calls.length, 2);
});

test("resize bursts collapse into one height message", () => {
  const calls: Array<{ message: unknown; origin: string }> = [];
  const frames: Array<() => void> = [];
  let height = 300;
  const host = bridgeHost(calls, frames, { height, path: "/" });
  host.readHeight = () => height;
  startEmbedBridge(host);
  frames.shift()?.();
  const before = calls.length;
  height = 640;
  host.resize?.();
  height = 880.4;
  host.resize?.();
  assert.equal(frames.length, 1);
  frames[0]?.();
  const heights = calls.slice(before).filter((call) => (call.message as { type: string }).type === "wc:height");
  assert.equal(heights.length, 1);
  assert.deepEqual(heights[0], { message: { type: "wc:height", height: 880 }, origin: POS });
});

test("a theme message updates theme and cannot sign in or sign out", () => {
  const calls: Array<{ message: unknown; origin: string }> = [];
  const frames: Array<() => void> = [];
  const themes: string[] = [];
  const signedIn: string[] = [];
  const host = bridgeHost(calls, frames, { height: 400, path: "/profile" });
  host.setTheme = (theme) => themes.push(theme);
  startEmbedBridge(host);
  const before = calls.length;

  host.emit?.({ origin: POS, source: host.parent, data: { type: "wc:theme", theme: "dark" } });
  host.emit?.({ origin: "https://evil.example", source: host.parent, data: { type: "wc:theme", theme: "light" } });
  host.emit?.({ origin: POS, source: {}, data: { type: "wc:theme", theme: "light" } });
  host.emit?.({ origin: POS, source: host.parent, data: { type: "wc:sign-out" } });
  host.emit?.({ origin: POS, source: host.parent, data: { type: "wc:theme", theme: "dark", login: true } });

  assert.deepEqual(themes, ["dark"]);
  assert.deepEqual(signedIn, []);
  assert.equal(calls.length, before);
  assert.equal(calls.some((call) => (call.message as { type: string }).type === "wc:signed-out"), false);
});

test("sign-out is reported from the sign-out path and from an explicit notify, not from a missing session", () => {
  const calls: Array<{ message: unknown; origin: string }> = [];
  const frames: Array<() => void> = [];
  const host = bridgeHost(calls, frames, { height: 400, path: "/fr/auth/signout" });
  startEmbedBridge(host);
  assert.deepEqual(calls.filter((call) => (call.message as { type: string }).type === "wc:signed-out"), [
    { message: { type: "wc:signed-out" }, origin: POS }
  ]);

  const parent = port(calls);
  assert.equal(notifyEmbedSignedOut(POS, { embed: true, topLevel: false, parent }), true);
  assert.equal(notifyEmbedSignedOut("*", { embed: true, topLevel: false, parent }), false);
  assert.equal(notifyEmbedSignedOut(POS, { embed: false, topLevel: false, parent }), false);
  assert.equal(notifyEmbedSignedOut(POS, { embed: true, topLevel: true, parent }), false);
  const signedOut = calls.filter((call) => (call.message as { type: string }).type === "wc:signed-out");
  assert.equal(signedOut.length, 2);
  assert.equal(signedOut.every((call) => call.origin === POS), true);
});

test("hidden and foreign paths are not reported, and a top-level page stays silent", () => {
  const calls: Array<{ message: unknown; origin: string }> = [];
  const frames: Array<() => void> = [];
  startEmbedBridge(bridgeHost(calls, frames, { height: 500, path: "/premium" }));
  frames[0]?.();
  assert.deepEqual(calls.map((call) => call.message), [{ type: "wc:height", height: 500 }]);

  const silent: Array<{ message: unknown; origin: string }> = [];
  const top = bridgeHost(silent, [], { height: 500, path: "/programs" });
  top.isTopLevel = () => true;
  startEmbedBridge(top);
  const off = bridgeHost(silent, [], { height: 500, path: "/programs" });
  off.isEmbed = () => false;
  startEmbedBridge(off);
  const wildcard = bridgeHost(silent, [], { height: 500, path: "/programs" });
  wildcard.parentOrigin = "*";
  startEmbedBridge(wildcard);
  assert.equal(silent.length, 0);
});

test("embed theme is applied before paint and kept after the query is gone", () => {
  const first = bootTheme("?embed=1&theme=dark", null, null);
  assert.equal(first.root.getAttribute("data-wc-embed"), "1");
  assert.equal(first.theme, "dark");
  assert.equal(first.root.classList.contains("dark"), true);
  assert.equal(first.root.style.colorScheme, "dark");

  const kept = bootTheme("", "1", "dark");
  assert.equal(kept.root.classList.contains("dark"), true);
  assert.equal(kept.theme, "dark");

  const queryWins = bootTheme("?embed=1&theme=light", "1", "dark");
  assert.equal(queryWins.theme, "light");
  assert.equal(queryWins.root.classList.contains("light"), true);
  assert.equal(queryWins.root.classList.contains("dark"), false);

  const outside = bootTheme("?theme=dark", null, null);
  assert.equal(outside.root.getAttribute("data-wc-embed"), null);
  assert.equal(outside.theme, null);
  assert.equal(outside.root.classList.contains("dark"), false);
  assert.equal(outside.root.style.colorScheme, "");
});

test("bridge source never posts to a wildcard and a message cannot sign in or out", () => {
  const bridge = readFileSync("src/features/embed/lib/embed-bridge.ts", "utf8");
  const boot = readFileSync("src/features/embed/lib/embed-boot-script.ts", "utf8");
  const ui = readFileSync("src/features/embed/ui/embed-bridge.tsx", "utf8");
  const providers = readFileSync("app/[locale]/providers.tsx", "utf8");
  const logout = readFileSync("src/features/auth/model/useLogout.ts", "utf8");

  for (const src of [bridge, boot, ui]) {
    assert.doesNotMatch(src, /postMessage\(\s*[^,]+,\s*["']\*["']/);
    assert.doesNotMatch(src, /targetOrigin\s*[:=]\s*["']\*["']/);
  }
  assert.doesNotMatch(bridge, /signOut|signIn|location\.assign|location\.href/);
  assert.doesNotMatch(ui, /useSession/);
  assert.match(providers, /storageKey="theme"/);
  assert.match(providers, /<EmbedBridge/);
  assert.match(logout, /notifyEmbedSignedOut\(getConfiguredPeptideOsOrigin\(\)\)/);
  const notifyAt = logout.indexOf("notifyEmbedSignedOut");
  const logoutAt = logout.indexOf("logoutThenClearSession");
  assert.ok(logoutAt !== -1 && notifyAt > logoutAt);
});

function port(calls: Array<{ message: unknown; origin: string }>): EmbedMessagePort {
  return {
    postMessage(message: unknown, origin: string) {
      calls.push({ message, origin });
    }
  };
}

interface TestHost extends EmbedBridgeHost {
  resize?: () => void;
  emit?: (event: ParentThemeEvent) => void;
}

function bridgeHost(
  calls: Array<{ message: unknown; origin: string }>,
  frames: Array<() => void>,
  input: { height: number; path: string }
): TestHost {
  const parent = port(calls);
  let onResize: (() => void) | null = null;
  let onMessage: ((event: ParentThemeEvent) => void) | null = null;
  const host: TestHost = {
    parentOrigin: POS,
    parent,
    isEmbed: () => true,
    isTopLevel: () => false,
    readHeight: () => input.height,
    readPath: () => input.path,
    subscribeResize: (notify) => {
      onResize = notify;
      return () => {
        onResize = null;
      };
    },
    subscribePath: () => () => undefined,
    requestFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
    setTheme: () => undefined,
    addMessageListener: (listener) => {
      onMessage = listener;
      return () => {
        onMessage = null;
      };
    },
    resize: () => onResize?.(),
    emit: (event) => onMessage?.(event)
  };
  return host;
}

function bootTheme(search: string, embedStored: string | null, themeStored: string | null) {
  const session = new Map<string, string>();
  const local = new Map<string, string>();
  if (embedStored !== null) session.set("wc-embed", embedStored);
  if (themeStored !== null) local.set("theme", themeStored);
  const classes = new Set<string>();
  const root = {
    attrs: {} as Record<string, string>,
    classList: {
      add: (name: string) => classes.add(name),
      remove: (name: string) => classes.delete(name),
      contains: (name: string) => classes.has(name)
    },
    style: { colorScheme: "" },
    getAttribute(name: string) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    },
    setAttribute(name: string, value: string) {
      this.attrs[name] = value;
    }
  };
  const documentNode = {
    documentElement: root,
    addEventListener: () => undefined
  };
  const context = {
    sessionStorage: {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => session.set(key, value)
    },
    localStorage: {
      getItem: (key: string) => local.get(key) ?? null,
      setItem: (key: string, value: string) => local.set(key, value)
    },
    location: { search, origin: "https://workouts.peptideos.us" },
    document: documentNode
  };
  const run = new Function("window", "document", "sessionStorage", "localStorage", "location", embedBootScript());
  run(context, context.document, context.sessionStorage, context.localStorage, context.location);
  return { root, theme: local.get("theme") ?? null };
}
