import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("T1 keeps nav hrefs, header auth hrefs, and stepper handlers", () => {
  const nav = read("src/features/layout/BottomNavigation.tsx");
  const header = read("src/features/layout/Header.tsx");
  const footer = read("src/features/workout-builder/ui/workout-stepper-footer.tsx");
  const stepper = read("src/features/workout-builder/ui/workout-stepper.tsx");

  assert.match(nav, /href:\s*paths\.root/);
  assert.match(nav, /href:\s*`\$\{paths\.programs\}`/);
  assert.match(nav, /href:\s*`\/\$\{locale\}\/statistics`/);
  assert.match(nav, /href:\s*`\/\$\{locale\}\/tools`/);
  assert.match(nav, /href:\s*`\/\$\{locale\}\$\{paths\.leaderboard\}`/);
  assert.match(nav, /href:\s*`\/\$\{locale\}\/premium`/);
  assert.match(nav, /bottom_navigation\.workouts/);
  assert.match(nav, /bottom_navigation\.programs/);
  assert.match(nav, /bottom_navigation\.statistics/);
  assert.match(nav, /bottom_navigation\.tools/);
  assert.match(nav, /bottom_navigation\.leaderboard/);
  assert.match(nav, /bottom_navigation\.premium/);
  assert.match(nav, /data-wc-chrome="nav"/);

  assert.match(header, /getConfiguredPeptideOsLoginUrl\(\)/);
  assert.match(header, /getConfiguredPeptideOsSignupUrl\(\)/);
  assert.match(header, /commons\.login/);
  assert.match(header, /commons\.signup/);
  assert.match(header, /data-wc-chrome="header"/);
  assert.match(header, /href="\/profile"/);

  assert.match(footer, /onClick=\{onPrevious\}/);
  assert.match(footer, /onClick=\{onNext\}/);
  assert.match(footer, /onRewardGranted=\{onStartWorkout\}/);
  assert.match(footer, /workout_builder\.navigation\.previous/);
  assert.match(footer, /workout_builder\.navigation\.continue/);
  assert.match(footer, /workout_builder\.navigation\.start_workout/);

  assert.match(stepper, /onNext=\{nextStep\}/);
  assert.match(stepper, /onPrevious=\{prevStep\}/);
  assert.match(stepper, /onStartWorkout=\{handleStartWorkout\}/);
  assert.match(stepper, /onStepClick=\{handleStepClick\}/);
  assert.match(stepper, /bottom_navigation\.workouts/);
  assert.doesNotMatch(stepper, /Build your workout/);
});

test("T1 public shell classes stay in place and the embed line is a separate node", () => {
  const layout = read("app/[locale]/(app)/layout.tsx");
  const root = read("app/[locale]/layout.tsx");
  const version = read("src/components/version.tsx");
  const nav = read("src/features/layout/BottomNavigation.tsx");

  assert.match(layout, /shadow-xl/);
  assert.match(layout, /rounded-lg/);
  assert.match(layout, /data-wc-shell/);
  assert.match(layout, /<Header/);
  assert.match(layout, /<Footer/);
  assert.match(layout, /<BottomNavigation/);
  assert.match(layout, /<Version variant="meta"/);
  assert.match(root, /<Version \/>/);
  assert.match(root, /bg-hero-light/);
  assert.match(version, /data-wc-chrome="version"/);
  assert.match(version, /text-xs text-gray-500/);
  assert.match(version, /data-wc-version-meta/);
  assert.match(version, /className="hidden"/);
  assert.match(version, /v\{appVersion\}/);
  assert.match(nav, /text-\[9px\]/);
  assert.match(nav, /allPremiumFeaturesFree && isPremium && "hidden"/);
});

test("T1 embed presentation is scoped, 18px, and does not letter-wrap", () => {
  const css = read("src/features/embed/embed-theme.css");
  assert.doesNotMatch(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /html\[data-wc-embed="1"\] \[data-wc-version-meta\][\s\S]*font-size:\s*18px/);
  assert.match(css, /html\[data-wc-embed="1"\] \[data-wc-chrome="nav"\] a[\s\S]*min-height:\s*56px/);
  assert.match(css, /html\[data-wc-embed="1"\] \[data-wc-chrome="nav"\] a span[\s\S]*font-size:\s*18px/);
  assert.match(css, /data-wc-nav-premium[\s\S]*var\(--dash-link\)/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /@media \(max-width:\s*639px\)/);
  assert.doesNotMatch(css, /@media \(min-width/);
  assert.match(css, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\[data-wc-chrome="version"\][\s\S]*display:\s*none/);
});
