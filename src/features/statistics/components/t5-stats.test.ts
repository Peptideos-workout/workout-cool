import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

function read(path: string) {
  return readFileSync(path, "utf8");
}

const PAGE = "app/[locale]/(app)/statistics/page.tsx";
const BROWSER = "src/features/statistics/components/ExercisesBrowser.tsx";
const TIMEFRAME = "src/features/statistics/components/TimeframeSelector.tsx";
const WEIGHT = "src/features/statistics/components/WeightProgressionChart.tsx";
const ONE_RM = "src/features/statistics/components/OneRepMaxChart.tsx";
const VOLUME = "src/features/statistics/components/VolumeChart.tsx";
const CHARTS = "src/features/statistics/components/ExerciseStatisticsTab.tsx";
const OVERLAY = "src/features/statistics/components/StatisticsPreviewOverlay.tsx";
const THEME = "src/features/statistics/hooks/use-chart-theme.ts";
const MODAL = "src/features/workout-builder/ui/exercise-video-modal.tsx";
const TIMER = "src/features/workout-session/ui/workout-session-timer.tsx";
const MAIN = "app/[locale]/(app)/layout.tsx";
const NAV = "src/features/layout/BottomNavigation.tsx";
const FOOTER = "src/features/layout/Footer.tsx";
const VERSION = "src/components/version.tsx";
const SETS = "src/features/workout-session/ui/workout-session-sets.tsx";
const DETAIL = "src/features/programs/ui/program-detail-page.tsx";
const STEP_FOOTER = "src/features/workout-builder/ui/workout-stepper-footer.tsx";
const STEPPER = "src/features/workout-builder/ui/workout-stepper.tsx";
const STATS_FILES = [PAGE, BROWSER, TIMEFRAME, WEIGHT, ONE_RM, VOLUME, CHARTS, OVERLAY, MODAL];

const DASH_NAMES = ["page", "panel", "inner", "card", "border", "text", "secondary", "accent", "ink", "link", "error"];

function blockForSelector(css: string, selector: string) {
  let from = 0;
  while (from < css.length) {
    const at = css.indexOf(selector, from);
    if (at < 0) return "";
    const before = at === 0 ? "\n" : css[at - 1];
    const rest = css.slice(at + selector.length);
    if ((before === "\n" || before === "}") && /^\s*\{/.test(rest)) {
      const open = at + selector.length + rest.indexOf("{");
      let depth = 0;
      for (let index = open; index < css.length; index += 1) {
        if (css[index] === "{") depth += 1;
        else if (css[index] === "}") {
          depth -= 1;
          if (depth === 0) return css.slice(open + 1, index);
        }
      }
    }
    from = at + selector.length;
  }
  return "";
}

function wcDash(block: string) {
  const found: Record<string, string> = {};
  for (const match of block.matchAll(/--wc-dash-([a-z]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    found[match[1]] = match[2].toLowerCase();
  }
  return found;
}

function channel(hex: string) {
  const value = hex.slice(1);
  const full =
    value.length === 3
      ? value
          .split("")
          .map((part) => part + part)
          .join("")
      : value;
  return [0, 2, 4].map((start) => Number.parseInt(full.slice(start, start + 2), 16));
}

function contrast(foreground: string, background: string) {
  const linear = (amount: number) => {
    const unit = amount / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex: string) => {
    const [red, green, blue] = channel(hex);
    return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
  };
  const [hi, lo] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

function tokens() {
  const globals = read("src/shared/styles/globals.css");
  return {
    light: wcDash(blockForSelector(globals, ":root")),
    dark: wcDash(blockForSelector(globals, ".dark")),
  };
}

test("stats screens use dash tokens and no raw hex", () => {
  const { light, dark } = tokens();
  for (const name of DASH_NAMES) {
    assert.ok(light[name], name);
    assert.ok(dark[name], name);
  }
  for (const path of STATS_FILES) {
    const source = read(path);
    assert.match(source, /--wc-dash-/);
    assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}/);
    assert.doesNotMatch(source, /text-slate-|bg-slate-|text-red-|bg-red-|text-green-|bg-green-|text-blue-|bg-blue-/);
    assert.doesNotMatch(source, /text-yellow-|bg-yellow-|text-purple-|bg-purple-|text-gray-|bg-gray-|text-white|bg-white/);
  }
  const theme = read(THEME);
  assert.doesNotMatch(theme, /#[0-9a-fA-F]{3,8}/);
  assert.equal(theme.split('isDark ? "var(--wc-dash-').length - 1, 9);
});

test("stats text is 18px and tap targets are 48px", () => {
  const browser = read(BROWSER);
  const modal = read(MODAL);
  const timeframe = read(TIMEFRAME);
  const page = read(PAGE);
  assert.match(browser, /inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl text-\[var\(--wc-dash-text\)\]/);
  assert.match(
    browser,
    /mb-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-\[var\(--wc-dash-accent\)\] px-4 text-lg text-\[var\(--wc-dash-ink\)\]/,
  );
  assert.match(browser, /min-h-12 w-full rounded-xl border border-\[var\(--wc-dash-border\)\]/);
  assert.match(page, /text-lg text-\[var\(--wc-dash-secondary\)\]/);
  assert.match(timeframe, /!min-h-12 w-auto min-w-12 !text-lg/);
  assert.match(timeframe, /!min-h-12 !text-lg text-\[var\(--wc-dash-text\)\]/);
  assert.match(modal, /!min-h-12 !text-lg !text-\[var\(--wc-dash-text\)\]/);
  assert.match(modal, /inline-flex min-h-12 items-center rounded-xl px-3 py-2 text-lg/);
  assert.match(modal, /flex min-h-12 flex-col items-center/);
  assert.match(read(ONE_RM), /inline-flex min-h-12 min-w-12 items-center justify-center rounded-full/);
  assert.match(read(OVERLAY), /group relative inline-flex min-h-12 items-center rounded-xl bg-\[var\(--wc-dash-ink\)\] px-6 py-3 text-lg/);
  assert.match(read(VOLUME), /<p className="text-lg" style=\{\{ color: colors.textSecondary \}\}>/);
});

test("stats contrast pairs pass AA", () => {
  const pairs = [
    ["ink", "accent"],
    ["text", "panel"],
    ["text", "card"],
    ["text", "inner"],
    ["secondary", "panel"],
    ["secondary", "card"],
    ["secondary", "inner"],
    ["error", "panel"],
    ["error", "card"],
    ["link", "card"],
    ["page", "text"],
    ["accent", "ink"],
    ["link", "ink"],
  ] as const;
  const { light, dark } = tokens();
  for (const theme of [light, dark]) {
    for (const [foreground, background] of pairs) {
      const ratio = contrast(theme[foreground], theme[background]);
      assert.ok(ratio >= 4.5, `${foreground} on ${background} ${ratio.toFixed(2)}`);
    }
  }
});

test("stats handlers, hrefs, and conditionals stay put", () => {
  const browser = read(BROWSER);
  const modal = read(MODAL);
  const timeframe = read(TIMEFRAME);
  const charts = read(CHARTS);
  const overlay = read(OVERLAY);
  const page = read(PAGE);
  assert.match(browser, /onClick=\{onClose\}/);
  assert.match(browser, /onValueChange=\{setSelectedEquipment\}/);
  assert.match(browser, /onValueChange=\{setSelectedMuscle\}/);
  assert.match(browser, /onChange=\{\(e\) => handleSearch\(e\.target\.value\)\}/);
  assert.match(browser, /onClick=\{\(\) => handleExerciseSelect\(exercise\)\}/);
  assert.match(browser, /onClick=\{openExerciseSelection\}/);
  assert.match(browser, /onClick=\{openVideoModal\}/);
  assert.match(browser, /onSelect=\{setSelectedTimeframe\}/);
  assert.match(browser, /onClose=\{\(\) => setShowExerciseModal\(false\)\}/);
  assert.match(browser, /onOpenChange=\{setShowVideoModal\}/);
  assert.match(browser, /isVisible=\{!unlockStatsUi\}/);
  assert.match(browser, /onUpgrade=\{handleUpgrade\}/);
  assert.match(browser, /router\.push\("\/premium"\)/);
  assert.match(browser, /\{unlockStatsUi && \(/);
  assert.match(browser, /\{selectedExercise && \(/);
  assert.match(browser, /\{selectedExercise \? \(/);
  assert.equal(browser.split("disabled=").length - 1, 0);
  assert.match(timeframe, /onValueChange=\{\(value\) => onSelect\(value as StatisticsTimeframe\)\}/);
  const simpleSelect = read("src/components/ui/simple-select.tsx");
  assert.match(simpleSelect, /onValueChange=\{\(newValue\) => onValueChange\(newValue as T\)\}/);
  assert.match(simpleSelect, /!min-h-12 w-full !text-lg/);
  assert.match(simpleSelect, /!min-h-12 !text-lg text-\[var\(--wc-dash-text\)\]/);
  assert.match(timeframe, /value=\{selected\}/);
  assert.match(modal, /onValueChange=\{setActiveTab\}/);
  assert.match(modal, /value=\{activeTab\}/);
  assert.match(modal, /value="video"/);
  assert.match(modal, /value="statistics"/);
  assert.match(modal, /\{!isPremium && \(/);
  assert.match(modal, /href="\/premium"/);
  assert.match(modal, /data-wc-entry="premium"/);
  assert.equal(modal.split("disabled=").length - 1, 0);
  assert.match(charts, /feature="exercise-statistics"/);
  assert.match(charts, /\{hasError && \(/);
  assert.match(overlay, /onClick=\{onUpgrade\}/);
  assert.match(overlay, /data-wc-entry="premium"/);
  assert.match(overlay, /if \(!isVisible\) return null;/);
  assert.match(overlay, /\{showTeaserModal && \(/);
  assert.match(page, /feature="Statistics"/);
  assert.match(read(THEME), /const isDark = currentTheme === "dark";/);
  assert.match(read(WEIGHT), /style=\{\{ opacity: hasData \? 1 : 0\.2 \}\}/);
});

test("stats copy keys and chart data props stay put", () => {
  const browser = read(BROWSER);
  const page = read(PAGE);
  const modal = read(MODAL);
  const charts = read(CHARTS);
  const overlay = read(OVERLAY);
  for (const key of [
    "statistics.title",
    "statistics.page_subtitle",
    "statistics.active_daily_users",
    "statistics.success_rate",
    "statistics.user_rating",
  ]) {
    assert.match(page, new RegExp(key.replace(".", "\\.")));
  }
  assert.match(page, /15\.4K\+/);
  assert.match(page, /89%/);
  assert.match(page, /4\.8★/);
  for (const key of [
    "statistics.select_exercise",
    "statistics.all_equipment",
    "statistics.all_muscles",
    "statistics.search_exercises",
    "statistics.error_loading_exercises",
    "statistics.no_exercises_found",
    "statistics.equipment_label",
    "statistics.primary_muscle_label",
    "statistics.no_image_available",
    "statistics.title",
  ]) {
    assert.match(browser, new RegExp(key.replace(/\./g, "\\.")));
  }
  assert.match(browser, /<WeightProgressionChart data=\{\[\]\} height=\{250\} unit="kg" \/>/);
  assert.match(
    browser,
    /<OneRepMaxChart data=\{\[\]\} formula="Lombardi" formulaDescription="Classic 1RM estimation formula" height=\{250\} unit="kg" \/>/,
  );
  assert.match(browser, /<VolumeChart data=\{\[\]\} height=\{250\} \/>/);
  assert.match(charts, /data=\{weightProgressionQuery\.data\?\.data \|\| \[\]\}/);
  assert.match(charts, /formula=\{oneRepMaxQuery\.data\?\.formula \|\| "Lombardi"\}/);
  assert.match(charts, /formulaDescription=\{oneRepMaxQuery\.data\?\.formulaDescription \|\| ""\}/);
  assert.match(charts, /data=\{volumeQuery\.data\?\.data \|\| \[\]\}/);
  assert.match(read(WEIGHT), /dataKey="weight"/);
  assert.match(read(WEIGHT), /stroke="var\(--wc-dash-accent\)"/);
  assert.match(read(ONE_RM), /dataKey="estimatedOneRepMax"/);
  assert.match(read(ONE_RM), /stroke="var\(--wc-dash-accent\)"/);
  assert.match(read(VOLUME), /dataKey="totalVolume"/);
  assert.match(read(VOLUME), /fill="var\(--wc-dash-accent\)"/);
  assert.match(modal, /\{t\("statistics\.title"\) \|\| "Statistics"\}/);
  assert.match(modal, /1RM Est\./);
  assert.match(modal, />Volume</);
  assert.match(modal, />Sessions</);
  assert.match(modal, /\+12%/);
  assert.match(modal, /85kg/);
  assert.match(modal, /2,400kg/);
  assert.match(modal, />24</);
  for (const key of [
    "statistics.total_volume",
    "statistics.pr_increase",
    "statistics.weight_progress",
    "statistics.premium_statistics",
    "statistics.premium_statistics_description",
    "statistics.upgrade_now",
    "statistics.rating",
    "statistics.no_ads",
    "statistics.cancel_anytime",
    "statistics.preview_notice",
    "statistics.preview_description",
    "statistics.get_premium_access",
  ]) {
    assert.match(overlay, new RegExp(key.replace(/\./g, "\\.")));
  }
  assert.match(overlay, /\+12\.5%/);
});

test("timer, nav, and version chip reserve space", () => {
  const timer = read(TIMER);
  const main = read(MAIN);
  const root = read("app/[locale]/layout.tsx");
  const nav = read(NAV);
  const footer = read(FOOTER);
  const version = read(VERSION);
  const modal = read(MODAL);
  const frame = root.slice(root.indexOf('data-wc-frame=""') - 240, root.indexOf('data-wc-frame=""'));
  const shell = main.slice(main.indexOf('data-wc-shell=""') - 400, main.indexOf('data-wc-shell=""'));
  const mainClass = main.slice(main.indexOf('data-wc-main=""') - 240, main.indexOf('data-wc-main=""'));
  for (const source of [frame, shell, mainClass]) {
    assert.doesNotMatch(source, /overflow-auto/);
    assert.doesNotMatch(source, /max-h-\[100dvh\]/);
    assert.doesNotMatch(source, /overflow-hidden/);
  }
  assert.match(main, /max-sm:pb-\[calc\(134px\+25px\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(
    timer,
    /relative mx-auto mb-3 w-fit max-w-\[calc\(100vw-16px\)\] max-sm:fixed max-sm:bottom-\[146px\] max-sm:left-1\/2 max-sm:-translate-x-1\/2 max-sm:z-50 max-sm:mb-0 sm:fixed sm:right-6 sm:bottom-28 sm:left-auto sm:translate-x-0 sm:z-50 sm:mb-0/,
  );
  assert.match(timer, /max-sm:fixed max-sm:bottom-\[146px\] max-sm:left-1\/2 max-sm:-translate-x-1\/2 max-sm:z-50/);
  assert.match(timer, /sm:right-6 sm:bottom-28 sm:left-auto sm:translate-x-0 sm:z-50/);
  assert.match(timer, /sm:z-50/);
  assert.doesNotMatch(timer, /fixed bottom-36/);
  assert.match(timer, /<Timer initialSeconds=\{0\} isRunning=\{isTimerRunning\} key=\{resetCount\} \/>/);
  assert.match(timer, /onClick=\{toggleTimer\}/);
  assert.match(timer, /onClick=\{handleReset\}/);
  assert.match(nav, /max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-40/);
  assert.match(nav, /max-sm:pb-\[env\(safe-area-inset-bottom\)\]/);
  assert.doesNotMatch(nav, /max-sm:order-3/);
  assert.match(footer, /max-sm:order-2 max-sm:shrink-0/);
  assert.match(version, /absolute bottom-2 right-4 z-50 sm:bottom-28 sm:left-4 sm:right-auto/);
  assert.match(version, /max-sm:bottom-\[calc\(136px\+env\(safe-area-inset-bottom\)\)\]/);
  assert.doesNotMatch(version, /fixed/);
  assert.match(read(SETS), /sm:pb-40/);
  assert.match(read(STEPPER), /w-full max-w-6xl mx-auto sm:pr-64 xl:pr-0/);
  assert.match(root, /<div className="relative flex min-h-screen w-full items-center justify-center" data-wc-frame="">/);
  assert.match(read(STEP_FOOTER), /max-sm:bottom-\[159px\]/);
  assert.match(read(DETAIL), /className="pb-16"/);
  const bodyAt = root.indexOf("<body");
  const bodyOpen = root.slice(bodyAt, root.indexOf("GeistMono", bodyAt));
  assert.match(bodyOpen, /"min-h-screen max-sm:p-0"/);
  assert.doesNotMatch(bodyOpen, /\brelative\b/);
  assert.match(version, /text-lg leading-snug text-\[var\(--wc-dash-secondary\)\]/);
  assert.equal(version.split("v{appVersion}").length - 1, 2);
  assert.doesNotMatch(version, /max-sm:bottom-36/);
  assert.equal(modal.split("bg-[var(--wc-dash-page)]").length - 1, 2);
  assert.match(modal, /w-\[calc\(100vw-16px\)\] max-w-\[calc\(100vw-16px\)\]/);
  const embed = read("src/features/embed/embed-theme.css");
  assert.match(
    embed,
    /html\[data-wc-embed="1"\] \[data-wc-frame\],\s*html\[data-wc-embed="1"\] \[data-wc-shell\],\s*html\[data-wc-embed="1"\] \[data-wc-main\] \{\s*max-height: none !important;\s*overflow: visible !important;\s*\}/,
  );
});
