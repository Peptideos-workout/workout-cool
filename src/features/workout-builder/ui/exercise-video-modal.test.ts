import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const modal = readFileSync("src/features/workout-builder/ui/exercise-video-modal.tsx", "utf8");

function tag(source: string, name: string) {
  const match = source.match(new RegExp(`<${name}\\b[\\s\\S]*?\\/?>`));
  assert.ok(match, name);
  return match[0];
}

test("exercise video modal passes stored embed options into the youtube url", () => {
  assert.match(modal, /youTubeEmbedOptionsFromUrl\(videoUrl \?\? ""\)/);
  assert.match(modal, /getYouTubeEmbedUrl\(\s*videoUrl \?\? ""\s*,\s*youTubeEmbedOptionsFromUrl\(videoUrl \?\? ""\)\s*\)/);
});

test("exercise video iframe allow list includes fullscreen", () => {
  const iframe = tag(modal, "iframe");
  assert.match(
    iframe,
    /allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"/
  );
});

test("exercise video iframe allows fullscreen", () => {
  const iframe = tag(modal, "iframe");
  assert.match(iframe, /\ballowFullScreen\b/);
});

test("raw exercise video plays inline", () => {
  const video = tag(modal, "video");
  assert.match(video, /\bplaysInline\b/);
});
