import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

import { embedSignedOutDocumentResponse } from "./embed-signed-out-document";
import { resolveEmbedOutboundOrigins } from "./embed-mode";
import {
  acceptParentThemeMessage,
  clampReportedHeight,
  createHeightReporter,
  exactOrigin,
  clearExplicitEmbedLogout,
  embedLogoutMessage,
  embedReportedSession,
  embedSessionMessage,
  explicitEmbedLogoutOnPath,
  markExplicitEmbedLogout,
  postEmbedSession,
  postToParent,
  releaseExplicitEmbedLogout,
  sessionReportToSend,
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
  assert.equal(postToParent(parent, "https://www.peptideos.us", message), true);
  assert.equal(postToParent(parent, "https://evil.example", message), false);
  assert.equal(postToParent(parent, "https://peptideos.us.evil.example", message), false);
  assert.deepEqual(calls, [
    { message, origin: POS },
    { message, origin: "https://www.peptideos.us" }
  ]);
  assert.equal(JSON.stringify(calls).includes("*"), false);
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
  assert.equal(reportableEmbedPath("/premium"), "/premium");
  assert.equal(reportableEmbedPath("/en/premium?return=%2Fen"), "/en/premium?return=%2Fen");
  assert.equal(reportableEmbedPath("/premium/plans"), "/premium/plans");
  assert.equal(reportableEmbedPath("/leaderboard"), "/leaderboard");
  assert.equal(reportableEmbedPath("/fr/leaderboard"), "/fr/leaderboard");
  assert.equal(reportableEmbedPath("/leaderboard/weekly"), "/leaderboard/weekly");

  assert.equal(reportableEmbedPath("/auth/signout"), null);
  assert.equal(reportableEmbedPath("/admin/users"), null);
  assert.equal(reportableEmbedPath("/api/workouts"), null);
  assert.equal(reportableEmbedPath("/programs/../admin"), null);
  assert.equal(reportableEmbedPath("/premium/../admin"), null);
  assert.equal(reportableEmbedPath("/leaderboard?next=https://evil.example"), null);
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
  assert.equal(acceptParentThemeMessage({ ...good, origin: "https://www.peptideos.us" }, parent, "https://www.peptideos.us"), "dark");
  assert.equal(acceptParentThemeMessage({ ...good, origin: "https://www.peptideos.us" }, parent, POS), "dark");
  assert.equal(acceptParentThemeMessage({ ...good, origin: "*" }, parent, POS), null);
  assert.equal(acceptParentThemeMessage({ ...good, origin: "https://www.peptideos.us.evil.example" }, parent, POS), null);
  assert.equal(acceptParentThemeMessage({ ...good, origin: "http://peptideos.us" }, parent, POS), null);
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
  assert.equal(calls.some((call) => (call.message as { type: string }).type === "wc:session"), false);
});

test("an unresolved parent posts to both origins until wc:theme locks the target", () => {
  const calls: Array<{ message: unknown; origin: string }> = [];
  const frames: Array<() => void> = [];
  const www = "https://www.peptideos.us";
  const host = bridgeHost(calls, frames, { height: 400, path: "/programs" });
  host.parentOrigin = "https://peptideos.us.evil.com";
  host.outboundOrigins = [POS, www, "http://peptideos.us", "https://peptideos.us.evil.com"];
  startEmbedBridge(host);
  frames.shift()?.();

  const messageType = (call: { message: unknown }) => (call.message as { type?: string }).type;
  const heightOrigins = calls.filter((call) => messageType(call) === "wc:height").map((call) => call.origin);
  const pathOrigins = calls.filter((call) => messageType(call) === "wc:navigate").map((call) => call.origin);
  assert.deepEqual(heightOrigins, [POS, www]);
  assert.deepEqual(pathOrigins, [POS, www]);
  assert.equal(JSON.stringify(calls).includes("*"), false);
  assert.equal(JSON.stringify(calls).includes("evil.com"), false);
  assert.equal(JSON.stringify(calls).includes("http://peptideos.us"), false);

  calls.length = 0;
  host.emit?.({ origin: "https://peptideos.us.evil.com", source: host.parent, data: { type: "wc:theme", theme: "light" } });
  host.emit?.({ origin: "http://peptideos.us", source: host.parent, data: { type: "wc:theme", theme: "dark" } });
  host.resize?.();
  frames.shift()?.();
  assert.deepEqual(calls.filter((call) => messageType(call) === "wc:height").map((call) => call.origin), [POS, www]);

  calls.length = 0;
  host.emit?.({ origin: www, source: host.parent, data: { type: "wc:theme", theme: "dark" } });
  host.resize?.();
  frames.shift()?.();
  assert.deepEqual(calls.filter((call) => messageType(call) === "wc:height").map((call) => call.origin), [www]);

  const sessionCalls: Array<{ message: unknown; origin: string }> = [];
  assert.equal(
    postEmbedSession([POS, www, "https://peptideos.us.evil.com"], "signed-out", {
      embed: true,
      topLevel: false,
      parent: port(sessionCalls)
    }),
    true
  );
  assert.deepEqual(
    sessionCalls.map((call) => call.origin),
    [POS, www]
  );
});

test("a www parent with no referrer or ancestorOrigins locks targetOrigin after wc:theme", () => {
  const www = "https://www.peptideos.us";
  const outbound = resolveEmbedOutboundOrigins({});
  assert.deepEqual([...outbound], [POS, www]);
  assert.deepEqual([...resolveEmbedOutboundOrigins({ referrer: "", ancestorOrigins: [] })], [POS, www]);

  const calls: Array<{ message: unknown; origin: string }> = [];
  const frames: Array<() => void> = [];
  const themes: string[] = [];
  const host = bridgeHost(calls, frames, { height: 640, path: "/programs" });
  host.parentOrigin = outbound[0] ?? POS;
  host.outboundOrigins = outbound;
  host.setTheme = (theme) => themes.push(theme);
  startEmbedBridge(host);
  frames.shift()?.();

  const messageType = (call: { message: unknown }) => (call.message as { type?: string }).type;
  assert.deepEqual(
    calls.filter((call) => messageType(call) === "wc:height").map((call) => call.origin),
    [POS, www]
  );

  calls.length = 0;
  host.emit?.({ origin: www, source: {}, data: { type: "wc:theme", theme: "dark" } });
  host.emit?.({ origin: "https://www.peptideos.us.evil.com", source: host.parent, data: { type: "wc:theme", theme: "light" } });
  host.resize?.();
  frames.shift()?.();
  assert.deepEqual(themes, []);
  assert.deepEqual(
    calls.filter((call) => messageType(call) === "wc:height").map((call) => call.origin),
    [POS, www]
  );

  calls.length = 0;
  host.emit?.({ origin: www, source: host.parent, data: { type: "wc:theme", theme: "dark" } });
  assert.deepEqual(themes, ["dark"]);
  host.resize?.();
  frames.shift()?.();
  assert.deepEqual(calls.filter((call) => messageType(call) === "wc:height").map((call) => call.origin), [www]);
  assert.equal(JSON.stringify(calls).includes("*"), false);
});

test("a framed sign-out fallback and an embedded sign-out page send no postMessage", async () => {
  const response = embedSignedOutDocumentResponse("https://peptideos.us", "https://workouts.peptideos.us", {
    postSession: false
  });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.doesNotMatch(html, /postMessage/);
  assert.doesNotMatch(html, /wc:session/);
  assert.doesNotMatch(html, /wc:signed-out/);

  for (const path of ["/auth/signout", "/fr/auth/signout", "/en/auth/signout/continue"]) {
    const calls: Array<{ message: unknown; origin: string }> = [];
    const frames: Array<() => void> = [];
    const host = bridgeHost(calls, frames, { height: 400, path });
    startEmbedBridge(host);
    while (frames.length > 0) frames.shift()?.();
    host.resize?.();
    while (frames.length > 0) frames.shift()?.();
    assert.deepEqual(calls, [], path);

    assert.equal(embedReportedSession({ embed: true, sessionResolved: true, hasSession: true, pathname: path }), null);
    assert.equal(embedReportedSession({ embed: true, sessionResolved: true, hasSession: false, pathname: path }), null);
    const state = sessionReportToSend(null, embedReportedSession({
      embed: true,
      sessionResolved: true,
      hasSession: false,
      pathname: path
    }));
    assert.equal(state, null);
    assert.equal(postEmbedSession(POS, state, { embed: true, topLevel: false, parent: port(calls) }), false);
    assert.deepEqual(calls, [], path);
  }
});

test("a client-side navigation into sign-out stops height and path posts", () => {
  const calls: Array<{ message: unknown; origin: string }> = [];
  const frames: Array<() => void> = [];
  let path = "/en";
  let onResize: (() => void) | null = null;
  let onPath: (() => void) | null = null;
  const host: EmbedBridgeHost = {
    parentOrigin: POS,
    parent: port(calls),
    isEmbed: () => true,
    isTopLevel: () => false,
    readHeight: () => 480,
    readPath: () => path,
    subscribeResize: (notify) => {
      onResize = notify;
      return () => {
        onResize = null;
      };
    },
    subscribePath: (notify) => {
      onPath = notify;
      return () => {
        onPath = null;
      };
    },
    requestFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
    setTheme: () => undefined,
    addMessageListener: () => () => undefined
  };
  const resize = () => onResize?.();
  const navigate = () => onPath?.();
  startEmbedBridge(host);
  while (frames.length > 0) frames.shift()?.();
  assert.deepEqual(calls.map((call) => call.message), [
    { type: "wc:navigate", path: "/en" },
    { type: "wc:height", height: 480 }
  ]);
  path = "/auth/signout";
  navigate();
  resize();
  while (frames.length > 0) frames.shift()?.();
  assert.deepEqual(calls.map((call) => call.message), [
    { type: "wc:navigate", path: "/en" },
    { type: "wc:height", height: 480 }
  ]);
});

test("outbound messages keep their exact keys and never use a wildcard origin", () => {
  const height = { type: "wc:height" as const, height: 240 };
  const navigate = { type: "wc:navigate" as const, path: "/programs" };
  const signedIn = embedSessionMessage("signed-in");
  const signedOutSession = embedSessionMessage("signed-out");
  const logout = embedLogoutMessage();

  assert.deepEqual(height, { type: "wc:height", height: 240 });
  assert.deepEqual(Object.keys(height), ["type", "height"]);
  assert.deepEqual(navigate, { type: "wc:navigate", path: "/programs" });
  assert.deepEqual(Object.keys(navigate), ["type", "path"]);
  assert.deepEqual(signedIn, { type: "wc:session", state: "signed-in" });
  assert.deepEqual(Object.keys(signedIn), ["type", "state"]);
  assert.deepEqual(signedOutSession, { type: "wc:session", state: "signed-out" });
  assert.deepEqual(Object.keys(signedOutSession), ["type", "state"]);
  assert.deepEqual(logout, { type: "wc:signed-out", reason: "logout" });
  assert.deepEqual(Object.keys(logout), ["type", "reason"]);

  const calls: Array<{ message: unknown; origin: string }> = [];
  const parent = port(calls);
  const runtime = { embed: true, topLevel: false, parent };
  assert.equal(postToParent(parent, POS, height), true);
  assert.equal(postToParent(parent, POS, navigate), true);
  assert.equal(postEmbedSession(POS, "signed-in", runtime), true);
  assert.equal(postEmbedSession(POS, "signed-out", runtime), true);
  assert.equal(postToParent(parent, POS, logout), true);
  assert.equal(postToParent(parent, "*", height), false);
  assert.equal(postToParent(parent, "*", navigate), false);
  assert.equal(postEmbedSession("*", "signed-out", runtime), false);
  assert.equal(postToParent(parent, "*", logout), false);
  assert.equal(postEmbedSession(POS, null, runtime), false);

  assert.deepEqual(
    calls.map((call) => call.message),
    [height, navigate, signedIn, signedOutSession, logout]
  );
  assert.equal(calls.every((call) => call.origin === POS), true);
  assert.equal(JSON.stringify(calls).includes("*"), false);
});

test("session is posted when it becomes known, and signed-out follows the auth fallback", () => {
  const pending = { embed: true, sessionResolved: false, hasSession: false };
  assert.equal(embedReportedSession(pending), null);
  assert.equal(embedReportedSession({ embed: false, sessionResolved: true, hasSession: true }), null);
  assert.equal(embedReportedSession({ embed: true, sessionResolved: true, hasSession: true }), "signed-in");
  assert.equal(embedReportedSession({ embed: true, sessionResolved: true, hasSession: false }), "signed-out");
  assert.equal(embedReportedSession({ ...pending, ssoError: true }), "signed-out");
  assert.equal(
    embedReportedSession({ embed: true, sessionResolved: true, hasSession: true, ssoError: true }),
    "signed-out"
  );

  assert.equal(sessionReportToSend(null, null), null);
  assert.equal(sessionReportToSend(null, "signed-in"), "signed-in");
  assert.equal(sessionReportToSend("signed-in", "signed-in"), null);
  assert.equal(sessionReportToSend("signed-in", "signed-out"), "signed-out");
  assert.equal(sessionReportToSend("signed-out", "signed-out"), null);
  assert.equal(sessionReportToSend("signed-out", "signed-in"), "signed-in");

  const calls: Array<{ message: unknown; origin: string }> = [];
  const runtime = { embed: true, topLevel: false, parent: port(calls) };
  let previous: "signed-in" | "signed-out" | null = null;
  const known = embedReportedSession({ ...pending, sessionResolved: true, hasSession: true });
  for (const next of [embedReportedSession(pending), known]) {
    const state = sessionReportToSend(previous, next);
    if (state && postEmbedSession(POS, state, runtime)) previous = state;
  }
  assert.deepEqual(calls.map((call) => call.message), [{ type: "wc:session", state: "signed-in" }]);
  const changed = sessionReportToSend(previous, "signed-out");
  if (changed) postEmbedSession(POS, changed, runtime);
  assert.deepEqual(calls.map((call) => call.message), [
    { type: "wc:session", state: "signed-in" },
    { type: "wc:session", state: "signed-out" }
  ]);
  assert.equal(calls.some((call) => (call.message as { type: string }).type === "wc:signed-out"), false);
});

test("sign-out paths and an explicit logout do not send wc:session signed-out", () => {
  const signedOut = { embed: true, sessionResolved: true, hasSession: false };
  assert.equal(embedReportedSession({ ...signedOut, pathname: "/auth/signout" }), null);
  assert.equal(embedReportedSession({ ...signedOut, pathname: "/fr/auth/signout/continue" }), null);
  assert.equal(embedReportedSession({ ...signedOut, pathname: "/en/profile", explicitLogout: true }), null);
  assert.equal(embedReportedSession({ ...signedOut, pathname: "/en/profile" }), "signed-out");
  assert.equal(
    embedReportedSession({ embed: true, sessionResolved: true, hasSession: true, pathname: "/auth/signout" }),
    null
  );
  assert.equal(
    embedReportedSession({ embed: true, sessionResolved: false, hasSession: false, ssoError: true, pathname: "/en/auth/signout" }),
    null
  );

  clearExplicitEmbedLogout();
  markExplicitEmbedLogout("/en/profile");
  assert.equal(explicitEmbedLogoutOnPath("/en/profile"), true);
  releaseExplicitEmbedLogout("/auth/signout/continue");
  assert.equal(explicitEmbedLogoutOnPath("/en/profile"), true);
  releaseExplicitEmbedLogout("/en/programs");
  assert.equal(explicitEmbedLogoutOnPath("/en/profile"), false);

  const calls: Array<{ message: unknown; origin: string }> = [];
  const frames: Array<() => void> = [];
  const host = bridgeHost(calls, frames, { height: 400, path: "/auth/signout/continue" });
  startEmbedBridge(host);
  while (frames.length > 0) frames.shift()?.();
  host.resize?.();
  while (frames.length > 0) frames.shift()?.();
  assert.deepEqual(calls, []);
  clearExplicitEmbedLogout();
});

test("premium and leaderboard paths in the pane are reported", () => {
  const premium: Array<{ message: unknown; origin: string }> = [];
  startEmbedBridge(bridgeHost(premium, [], { height: 500, path: "/en/premium?return=%2Fen" }));
  assert.deepEqual(premium.map((call) => call.message), [{ type: "wc:navigate", path: "/en/premium?return=%2Fen" }]);

  const board: Array<{ message: unknown; origin: string }> = [];
  startEmbedBridge(bridgeHost(board, [], { height: 500, path: "/fr/leaderboard/weekly" }));
  assert.deepEqual(board.map((call) => call.message), [{ type: "wc:navigate", path: "/fr/leaderboard/weekly" }]);
});

test("unlisted paths are not reported, and a top-level page stays silent", () => {
  const calls: Array<{ message: unknown; origin: string }> = [];
  const frames: Array<() => void> = [];
  startEmbedBridge(bridgeHost(calls, frames, { height: 500, path: "/admin/users" }));
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
  const first = bootTheme("?embed=1&theme=dark", null, {});
  assert.equal(first.root.getAttribute("data-wc-embed"), "1");
  assert.equal(first.values.get("wc-embed-theme"), "dark");
  assert.equal(first.values.get("theme") ?? null, null);
  assert.equal(first.root.classList.contains("dark"), true);
  assert.equal(first.root.style.colorScheme, "dark");
  first.storage.setItem("theme", "dark");
  assert.equal(first.values.get("theme") ?? null, null);
  assert.equal(first.values.get("wc-embed-theme"), "dark");

  const kept = bootTheme("", "1", { "wc-embed-theme": "dark", theme: "light" });
  assert.equal(kept.root.classList.contains("dark"), true);
  assert.equal(kept.values.get("wc-embed-theme"), "dark");
  assert.equal(kept.values.get("theme"), "light");

  const queryWins = bootTheme("?embed=1&theme=light", "1", { "wc-embed-theme": "dark", theme: "light" });
  assert.equal(queryWins.values.get("wc-embed-theme"), "light");
  assert.equal(queryWins.values.get("theme"), "light");
  assert.equal(queryWins.root.classList.contains("light"), true);
  assert.equal(queryWins.root.classList.contains("dark"), false);

  const outside = bootTheme("?theme=dark", null, { theme: "light", "wc-embed-theme": "dark" });
  assert.equal(outside.root.getAttribute("data-wc-embed"), null);
  assert.equal(outside.values.get("theme"), "light");
  assert.equal(outside.values.get("wc-embed-theme"), "dark");
  assert.equal(outside.root.classList.contains("dark"), false);
  assert.equal(outside.root.style.colorScheme, "");
});

test("a non-embed visit after an embed visit keeps the default theme key", () => {
  const embedded = bootTheme("?embed=1&theme=dark", null, { theme: "light" });
  assert.equal(embedded.values.get("theme"), "light");
  assert.equal(embedded.values.get("wc-embed-theme"), "dark");
  embedded.storage.setItem("theme", "dark");
  assert.equal(embedded.values.get("theme"), "light");

  const normal = bootTheme("", null, Object.fromEntries(embedded.values));
  assert.equal(normal.root.getAttribute("data-wc-embed"), null);
  assert.equal(normal.values.get("theme"), "light");
  assert.equal(normal.values.get("wc-embed-theme"), "dark");
  assert.equal(normal.root.classList.contains("dark"), false);
  normal.storage.setItem("theme", "dark");
  assert.equal(normal.values.get("theme"), "dark");
  assert.equal(normal.values.get("wc-embed-theme"), "dark");
});

test("an embed tab ignores theme storage events from a normal tab", () => {
  const embedded = bootTheme("?embed=1&theme=dark", null, { theme: "light" });
  assert.equal(embedded.root.classList.contains("dark"), true);
  assert.equal(embedded.storage.getItem("theme"), "dark");

  let seenTheme = 0;
  embedded.window.addEventListener("storage", (event) => {
    if (event.key !== "theme") return;
    seenTheme += 1;
    embedded.root.classList.remove("dark");
    embedded.root.classList.remove("light");
    if (event.newValue === "light" || event.newValue === "dark") embedded.root.classList.add(event.newValue);
  });

  embedded.values.set("theme", "light");
  const blocked = embedded.window.dispatchStorage({ key: "theme", newValue: "light" });
  assert.equal(blocked.stopped, true);
  assert.equal(seenTheme, 0);
  assert.equal(embedded.root.classList.contains("dark"), true);
  assert.equal(embedded.root.classList.contains("light"), false);
  assert.equal(embedded.storage.getItem("theme"), "dark");
  assert.equal(embedded.values.get("wc-embed-theme"), "dark");

  const cleared = embedded.window.dispatchStorage({ key: "theme", newValue: null });
  assert.equal(cleared.stopped, true);
  assert.equal(seenTheme, 0);
  assert.equal(embedded.root.classList.contains("dark"), true);

  let seenEmbedKey = 0;
  embedded.window.addEventListener("storage", (event) => {
    if (event.key === "wc-embed-theme") seenEmbedKey += 1;
  });
  const otherKey = embedded.window.dispatchStorage({ key: "wc-embed-theme", newValue: "light" });
  assert.equal(otherKey.stopped, false);
  assert.equal(seenEmbedKey, 1);

  const normal = bootTheme("", null, { theme: "light" });
  let normalSeen = 0;
  normal.window.addEventListener("storage", (event) => {
    if (event.key === "theme") normalSeen += 1;
  });
  const passed = normal.window.dispatchStorage({ key: "theme", newValue: "dark" });
  assert.equal(passed.stopped, false);
  assert.equal(normalSeen, 1);
  assert.equal(normal.root.classList.contains("dark"), false);
});

test("bridge source never posts to a wildcard and a message cannot sign in or out", () => {
  const bridge = readFileSync("src/features/embed/lib/embed-bridge.ts", "utf8");
  const boot = readFileSync("src/features/embed/lib/embed-boot-script.ts", "utf8");
  const ui = readFileSync("src/features/embed/ui/embed-bridge.tsx", "utf8");
  const fallback = readFileSync("src/features/embed/ui/embed-auth-fallback.tsx", "utf8");
  const providers = readFileSync("app/[locale]/providers.tsx", "utf8");
  const logout = readFileSync("src/features/auth/model/useLogout.ts", "utf8");

  for (const src of [bridge, boot, ui, fallback]) {
    assert.doesNotMatch(src, /postMessage\(\s*[^,]+,\s*["']\*["']/);
    assert.doesNotMatch(src, /targetOrigin\s*[:=]\s*["']\*["']/);
  }
  assert.match(fallback, /embedReportedSession\(/);
  assert.match(fallback, /sessionReportToSend\(/);
  assert.match(fallback, /postEmbedSession\(/);
  assert.match(fallback, /resolveEmbedOutboundOrigins\(/);
  assert.match(ui, /resolveEmbedOutboundOrigins\(/);
  assert.match(fallback, /explicitEmbedLogoutOnPath\(pathname\)/);
  assert.match(fallback, /releaseExplicitEmbedLogout\(pathname\)/);
  assert.doesNotMatch(bridge, /signOut|signIn|location\.assign|location\.href/);
  assert.doesNotMatch(ui, /useSession/);
  assert.match(providers, /storageKey="theme"/);
  assert.match(boot, /wc-embed-theme/);
  assert.match(boot, /stopImmediatePropagation/);
  assert.doesNotMatch(boot, /localStorage\.setItem\("theme"/);
  assert.doesNotMatch(bridge, /EMBED_THEME_STORAGE_KEY/);
  assert.match(providers, /<EmbedBridge/);
  assert.doesNotMatch(logout, /notifyEmbedSignedOut/);
  assert.match(logout, /markExplicitEmbedLogout\(pathname\)/);
  assert.match(logout, /\/auth\/signout\/continue/);
  assert.match(logout, /wc:signed-out/);
  const body = logout.slice(logout.indexOf("mutationFn"));
  const markAt = body.indexOf("markExplicitEmbedLogout");
  const logoutAt = body.indexOf("logoutThenClearSession");
  assert.ok(markAt !== -1 && logoutAt !== -1 && markAt < logoutAt);
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

interface FakeStorageEvent {
  key: string | null;
  newValue: string | null;
  stopImmediatePropagation: () => void;
}

function bootTheme(search: string, embedStored: string | null, seeded: Record<string, string>) {
  const session = new Map<string, string>();
  const local = new Map<string, string>(Object.entries(seeded));
  if (embedStored !== null) session.set("wc-embed", embedStored);
  const classes = new Set<string>();
  const capture: Array<(event: FakeStorageEvent) => void> = [];
  const bubble: Array<(event: FakeStorageEvent) => void> = [];
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
  const storage = {
    getItem(key: string) {
      return local.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      local.set(key, value);
    },
    removeItem(key: string) {
      local.delete(key);
    }
  };
  const documentNode = {
    documentElement: root,
    addEventListener: () => undefined
  };
  const windowNode = {
    addEventListener(type: string, listener: (event: FakeStorageEvent) => void, useCapture?: boolean) {
      if (type !== "storage") return;
      (useCapture ? capture : bubble).push(listener);
    },
    removeEventListener() {
      return undefined;
    },
    dispatchStorage(input: { key: string | null; newValue: string | null }) {
      let stopped = false;
      const event: FakeStorageEvent = {
        key: input.key,
        newValue: input.newValue,
        stopImmediatePropagation() {
          stopped = true;
        }
      };
      for (const listener of [...capture, ...bubble]) {
        if (stopped) break;
        listener(event);
      }
      return { stopped };
    }
  };
  const context = {
    sessionStorage: {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => session.set(key, value)
    },
    localStorage: storage,
    location: { search, origin: "https://workouts.peptideos.us" },
    document: documentNode,
    addEventListener: windowNode.addEventListener,
    removeEventListener: windowNode.removeEventListener,
    dispatchStorage: windowNode.dispatchStorage
  };
  const run = new Function("window", "document", "sessionStorage", "localStorage", "location", embedBootScript());
  run(context, context.document, context.sessionStorage, context.localStorage, context.location);
  return { root, storage, values: local, window: windowNode };
}
