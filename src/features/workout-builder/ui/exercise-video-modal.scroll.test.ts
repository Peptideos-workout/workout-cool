import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

import { JSDOM } from "jsdom";

const modalSource = readFileSync("src/features/workout-builder/ui/exercise-video-modal.tsx", "utf8");

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost:3000" });
const windowRef = dom.window;

globalThis.window = windowRef as unknown as Window & typeof globalThis;
globalThis.document = windowRef.document;
globalThis.HTMLElement = windowRef.HTMLElement;
globalThis.Element = windowRef.Element;
globalThis.Node = windowRef.Node;
globalThis.MutationObserver = windowRef.MutationObserver;
globalThis.DocumentFragment = windowRef.DocumentFragment as unknown as typeof DocumentFragment;
globalThis.SVGElement = windowRef.SVGElement;
globalThis.DOMParser = windowRef.DOMParser;
globalThis.Range = windowRef.Range;
globalThis.NodeFilter = windowRef.NodeFilter;
const browserGlobals = globalThis as unknown as Record<string, unknown>;
for (const key of Object.getOwnPropertyNames(windowRef)) {
  if (!/^(HTML|SVG|Node|DOM|CSS|UIEvent|Touch)/.test(key)) continue;
  if (key in globalThis) continue;
  try {
    browserGlobals[key] = windowRef[key];
  } catch {
    // Window getters such as frameElement are not needed in this test.
  }
}
globalThis.getComputedStyle = windowRef.getComputedStyle.bind(windowRef);
globalThis.Event = windowRef.Event;
globalThis.CustomEvent = windowRef.CustomEvent;
globalThis.FocusEvent = windowRef.FocusEvent as unknown as typeof FocusEvent;
globalThis.KeyboardEvent = windowRef.KeyboardEvent as unknown as typeof KeyboardEvent;
globalThis.MouseEvent = windowRef.MouseEvent as unknown as typeof MouseEvent;
globalThis.PointerEvent = windowRef.PointerEvent as unknown as typeof PointerEvent;
globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => windowRef.setTimeout(() => callback(Date.now()), 0);
globalThis.cancelAnimationFrame = (handle: number) => windowRef.clearTimeout(handle);
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.HTMLElement.prototype.scrollIntoView = () => {};
globalThis.HTMLElement.prototype.hasPointerCapture = () => false;
globalThis.HTMLElement.prototype.releasePointerCapture = () => {};
globalThis.HTMLElement.prototype.setPointerCapture = () => {};
Object.defineProperty(globalThis, "navigator", { value: windowRef.navigator, configurable: true });
browserGlobals.IS_REACT_ACT_ENVIRONMENT = true;

function installScrollUtilities() {
  const style = document.createElement("style");
  style.textContent = [
    ".overflow-y-auto { overflow-y: auto; }",
    ".overflow-x-clip { overflow-x: clip; }",
    ".overscroll-contain { overscroll-behavior: contain; }",
    ".touch-pan-y { touch-action: pan-y; }",
    ".touch-none { touch-action: none; }",
    ".max-h-\\[calc\\(100dvh-16px\\)\\] { max-height: calc(100dvh - 16px); }"
  ].join("\n");
  document.head.appendChild(style);
}

function classNameFrom(source: string, marker: string, direction: "before" | "after") {
  const at = source.indexOf(marker);
  assert.ok(at >= 0, marker);
  const slice = direction === "after" ? source.slice(at, at + 700) : source.slice(Math.max(0, at - 500), at);
  const matches = [...slice.matchAll(/className="([^"]+)"/g)];
  assert.ok(matches.length > 0, marker);
  return direction === "after" ? matches[0][1] : matches[matches.length - 1][1];
}

function touchEvent(type: string, clientX: number, clientY: number) {
  const event = new windowRef.Event(type, { bubbles: true, cancelable: true });
  const touch = { clientX, clientY, identifier: 1 };
  Object.defineProperty(event, "changedTouches", { value: [touch] });
  Object.defineProperty(event, "touches", { value: type === "touchend" ? [] : [touch] });
  return event;
}

test("exercise dialog touch-scrolls inside the body scroll lock", async () => {
  assert.ok(modalSource.includes("<ExerciseDialogScroll>"), "modal uses ExerciseDialogScroll");
  assert.ok(modalSource.includes("max-h-[calc(100dvh-16px)]"), "dialog max height uses dvh");
  assert.equal(modalSource.includes("max-h-[80vh]"), false);
  assert.equal(modalSource.includes("overflow-x-hidden"), false);
  assert.equal(modalSource.includes("touch-none"), false);
  assert.equal(/touch-action:\s*none/.test(modalSource), false);

  const playerClass = classNameFrom(modalSource, "data-exercise-video-player=\"\"", "before");
  assert.match(playerClass, /touch-pan-y/);
  assert.doesNotMatch(playerClass, /touch-none/);
  const iframeClass = classNameFrom(modalSource, "<iframe", "after");
  assert.match(iframeClass, /touch-pan-y/);
  assert.doesNotMatch(iframeClass, /touch-none/);
  const videoClass = classNameFrom(modalSource, "<video", "after");
  assert.match(videoClass, /touch-pan-y/);
  assert.doesNotMatch(videoClass, /touch-none/);
  assert.match(modalSource, /\bplaysInline\b/);
  assert.match(modalSource, /web-share; fullscreen"/);
  assert.match(modalSource, /\[&>button\]:min-h-12 \[&>button\]:min-w-12/);

  installScrollUtilities();
  const player = document.createElement("div");
  player.className = playerClass;
  document.body.appendChild(player);
  assert.notEqual(player.style.touchAction, "none");

  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { Dialog, DialogContent, DialogTitle } = await import("@/components/ui/dialog");
  const { ExerciseDialogScroll } = await import("./exercise-dialog-scroll");

  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        Dialog,
        { onOpenChange: () => {}, open: true },
        createElement(
          DialogContent,
          { "aria-describedby": undefined },
          createElement(DialogTitle, null, "Back Squat"),
          createElement(ExerciseDialogScroll, null, createElement("p", null, "Keep the bar over mid-foot.".repeat(40)))
        )
      )
    );
  });

  const scroll = document.querySelector<HTMLElement>("[data-exercise-dialog-scroll]");
  assert.ok(scroll, "dialog scroll container");
  const scrollStyle = getComputedStyle(scroll);
  assert.match(scroll.className, /overflow-y-auto/);
  assert.equal(scrollStyle.overflowY, "auto");
  assert.match(scroll.className, /overscroll-contain/);
  assert.equal(scrollStyle.overscrollBehavior, "contain");
  assert.match(scroll.className, /max-h-\[calc\(100dvh-16px\)\]/);
  assert.match(scrollStyle.maxHeight, /100dvh/);
  assert.doesNotMatch(scroll.className, /touch-none/);
  assert.match(scroll.className, /touch-pan-y/);
  assert.notEqual(scroll.style.touchAction, "none");

  assert.ok(document.body.hasAttribute("data-scroll-locked"));
  Object.defineProperty(scroll, "scrollHeight", { configurable: true, value: 2400 });
  Object.defineProperty(scroll, "clientHeight", { configurable: true, value: 480 });
  Object.defineProperty(scroll, "scrollTop", { configurable: true, value: 0, writable: true });

  scroll.dispatchEvent(touchEvent("touchstart", 40, 120));
  const move = touchEvent("touchmove", 40, 200);
  scroll.dispatchEvent(move);
  assert.equal(move.defaultPrevented, false);

  await act(async () => {
    root.unmount();
  });
  host.remove();
  player.remove();
});
