import { test } from "node:test";
import assert from "node:assert/strict";

import { getYouTubeEmbedUrl, youTubeEmbedOptionsFromUrl } from "./youtube";

const WATCH = "https://www.youtube.com/watch?v=NmfQzqGktgs";
const EXERCISE = "https://www.youtube.com/embed/NmfQzqGktgs?autoplay=1&start=12&loop=1&controls=0";

function paramsOf(url: string | null) {
  assert.ok(url);
  return new URL(url).searchParams;
}

test("youtube embed enables the fullscreen control", () => {
  assert.equal(paramsOf(getYouTubeEmbedUrl(WATCH)).get("fs"), "1");
});

test("youtube embed mutes only when autoplay is requested", () => {
  const plain = paramsOf(getYouTubeEmbedUrl(WATCH));
  assert.equal(plain.get("autoplay"), null);
  assert.equal(plain.get("mute"), null);

  const declined = paramsOf(getYouTubeEmbedUrl(WATCH, { autoplay: false }));
  assert.equal(declined.get("autoplay"), null);
  assert.equal(declined.get("mute"), null);

  const autoplay = paramsOf(getYouTubeEmbedUrl(WATCH, { autoplay: true }));
  assert.equal(autoplay.get("autoplay"), "1");
  assert.equal(autoplay.get("mute"), "1");
});

test("youtube embed applies the options the exercise modal passes through", () => {
  const options = youTubeEmbedOptionsFromUrl(EXERCISE);
  assert.deepEqual(options, { autoplay: true, controls: false, loop: true, start: 12 });

  const dropped = paramsOf(getYouTubeEmbedUrl(EXERCISE));
  assert.equal(dropped.get("autoplay"), null);
  assert.equal(dropped.get("mute"), null);
  assert.equal(dropped.get("start"), null);
  assert.equal(dropped.get("loop"), null);
  assert.equal(dropped.get("controls"), "1");

  const passed = paramsOf(getYouTubeEmbedUrl(EXERCISE, options));
  assert.equal(passed.get("autoplay"), "1");
  assert.equal(passed.get("mute"), "1");
  assert.equal(passed.get("start"), "12");
  assert.equal(passed.get("loop"), "1");
  assert.equal(passed.get("playlist"), "NmfQzqGktgs");
  assert.equal(passed.get("controls"), "0");
  assert.equal(passed.get("fs"), "1");
});

test("youtube embed rejects a video id that would inject player parameters", () => {
  const embed = getYouTubeEmbedUrl("https://www.youtube.com/watch?v=abc%3Ffs%3D0%26mute%3D1");
  assert.equal(embed, null);
  assert.doesNotMatch(embed ?? "", /(?:^|[?&])fs=0(?:&|$)/);
  assert.doesNotMatch(embed ?? "", /(?:^|[?&])mute=1(?:&|$)/);
});

test("youtube embed accepts only youtube.com hosts and youtu.be", () => {
  const id = "NmfQzqGktgs";
  const rejected = [
    `https://notyoutube.com/watch?v=${id}`,
    `https://youtube.com.evil.example/watch?v=${id}`,
    `https://evilyoutube.com/watch?v=${id}`
  ];
  for (const url of rejected) {
    assert.equal(getYouTubeEmbedUrl(url), null, url);
  }

  const accepted = [`https://www.youtube.com/watch?v=${id}`, `https://m.youtube.com/watch?v=${id}`, `https://youtu.be/${id}`];
  for (const url of accepted) {
    const embed = getYouTubeEmbedUrl(url);
    assert.ok(embed, url);
    assert.match(embed, new RegExp(`/embed/${id}(?:\\?|$)`));
  }
});
