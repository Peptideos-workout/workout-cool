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
  assert.equal(theme.split("isDark ?").length - 1, 0);
  assert.match(theme, /background: "var\(--wc-dash-panel\)"/);
  assert.match(theme, /text: "var\(--wc-dash-text\)"/);
  assert.doesNotMatch(theme, /useTheme/);
});

test("stats text is 18px and tap targets are 48px", () => {
  const browser = read(BROWSER);
  const modal = read(MODAL);
  const timeframe = read(TIMEFRAME);
  const page = read(PAGE);
  assert.match(browser, /inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl text-\[var\(--wc-dash-text\)\]/);
  assert.match(
    browser,
    new RegExp(
      "mb-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl " +
        "bg-\\[var\\(--wc-dash-accent\\)\\] px-4 text-lg text-\\[var\\(--wc-dash-ink\\)\\]",
    ),
  );
  assert.match(browser, /onClick=\{openExerciseSelection\}/);
  assert.doesNotMatch(browser, /ChevronDown/);
  assert.match(browser, /min-h-12 w-full rounded-xl border border-\[var\(--wc-dash-border\)\]/);
  assert.match(page, /text-lg text-\[var\(--wc-dash-secondary\)\]/);
  assert.match(timeframe, /aria-pressed=\{isSelected\}/);
  assert.match(timeframe, /inline-flex min-h-12 items-center justify-center rounded-xl border px-3 text-lg font-semibold/);
  assert.match(timeframe, /aria-hidden="true"/);
  assert.match(timeframe, /✓/);
  assert.match(timeframe, /onClick=\{\(\) => onSelect\(option\.value\)\}/);
  assert.doesNotMatch(timeframe, /SelectTrigger/);
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
  assert.match(timeframe, /onClick=\{\(\) => onSelect\(option\.value\)\}/);
  const simpleSelect = read("src/components/ui/simple-select.tsx");
  assert.match(simpleSelect, /onValueChange=\{\(newValue\) => onValueChange\(newValue as T\)\}/);
  assert.match(simpleSelect, /!min-h-12 w-full !text-lg/);
  assert.match(simpleSelect, /!min-h-12 !text-lg text-\[var\(--wc-dash-text\)\]/);
  assert.match(timeframe, /const isSelected = selected === option\.value;/);
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
  assert.match(page, /<PremiumGate/);
  assert.match(page, /feature="Statistics"/);
  assert.match(browser, /useState<StatisticsTimeframe>\("8weeks"\)/);
  assert.match(modal, /useState<StatisticsTimeframe>\("8weeks"\)/);
  assert.match(read(ONE_RM), /data-tip=\{t\("statistics\.one_rm_formula_tooltip", \{ formula \}\)\}/);
  assert.doesNotMatch(read(ONE_RM), /Formula: 1RM = Weight/);
  const formulaByLocale = {
    en: "1RM = Weight × (1 + (Reps ÷ 30))",
    fr: "1RM = Poids × (1 + (Répétitions ÷ 30))",
    es: "1RM = Peso × (1 + (Repeticiones ÷ 30))",
    pt: "1RM = Peso × (1 + (Repetições ÷ 30))",
    ru: "1RM = Вес × (1 + (Повторения ÷ 30))",
    "zh-CN": "1RM = 重量 × (1 + (次数 ÷ 30))",
  };
  for (const [locale, formula] of Object.entries(formulaByLocale)) {
    const source = read(`locales/${locale}.ts`);
    assert.match(source, /one_rm_formula_tooltip:/);
    assert.ok(source.includes(formula), locale);
  }
  assert.doesNotMatch(read(THEME), /const isDark = currentTheme === "dark";/);
  assert.match(read(THEME), /tooltipBorder: "var\(--wc-dash-border\)"/);
  assert.match(read(WEIGHT), /style=\{\{ opacity: hasData \? 1 : 0\.2 \}\}/);
});

test("stats copy keys and chart data props stay put", () => {
  const browser = read(BROWSER);
  const page = read(PAGE);
  const modal = read(MODAL);
  const charts = read(CHARTS);
  const overlay = read(OVERLAY);
  assert.doesNotMatch(page, /data-wc-kicker/);
  assert.doesNotMatch(page, /statistics\.kicker/);
  assert.equal(page.split("<h1").length - 1, 1);
  assert.match(
    page,
    /<h1 className="mb-2 text-lg font-bold text-\[var\(--wc-dash-accent\)\]">\{t\("statistics\.title"\)\}<\/h1>/,
  );
  assert.match(page, /statistics\.page_subtitle/);
  assert.equal(page.split("statistics.title").length - 1, 1);
  assert.match(page, /import \{ PremiumGate \} from "@\/components\/ui\/premium-gate"/);
  assert.doesNotMatch(page, /import React from "react"/);
  assert.match(page, /fallback=\{/);
  assert.match(page, /feature="Statistics"/);
  assert.match(page, /<div className="flex flex-col flex-wrap items-center justify-center gap-4">/);
  assert.match(page, /premium\.upgrade_to_access_feature/);
  assert.match(page, /premium\.actions\.go_premium/);
  assert.match(page, /href="\/premium"/);
  assert.match(page, /data-wc-entry="premium"/);
  assert.match(page, /inline-flex min-h-12 items-center justify-center rounded-xl/);
  assert.match(page, /bg-\[var\(--wc-dash-accent\)\] px-6 text-lg font-bold text-\[var\(--wc-dash-ink\)\]/);
  const fallbackBlock = page.slice(page.indexOf("fallback={"), page.indexOf("</PremiumGate>"));
  assert.doesNotMatch(fallbackBlock, /15\.4K\+|89%|4\.8|active_daily_users|success_rate|user_rating/);
  assert.doesNotMatch(page, /15\.4K\+|89%|4\.8|active_daily_users|success_rate|user_rating/);
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
    "statistics.timeframe",
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
  assert.doesNotMatch(read(ONE_RM), /\{formulaDescription\}/);
  assert.match(read(ONE_RM), /formulaDescription: _formulaDescription/);
  assert.match(charts, /data=\{volumeQuery\.data\?\.data \|\| \[\]\}/);
  assert.match(read(WEIGHT), /dataKey="weight"/);
  assert.match(read(WEIGHT), /stroke="var\(--wc-dash-accent\)"/);
  assert.match(read(ONE_RM), /dataKey="estimatedOneRepMax"/);
  assert.match(read(ONE_RM), /stroke="var\(--wc-dash-accent\)"/);
  assert.match(read(VOLUME), /dataKey="totalVolume"/);
  assert.match(read(VOLUME), /fill="var\(--wc-dash-accent\)"/);
  assert.match(read(VOLUME), /fontSize: 18/);
  assert.match(read(VOLUME), /minTickGap=\{48\}/);
  assert.match(read(VOLUME), /width=\{104\}/);
  assert.match(read(VOLUME), /t\("statistics\.set_count", \{ count: data\.setCount \}\)/);
  assert.match(read(ONE_RM), /fontSize: 18/);
  assert.match(read(WEIGHT), /fontSize: 18/);
  assert.match(page, /t\("statistics\.title"\)/);
  assert.match(read("src/components/ui/dialog.tsx"), /z-\[1000\]/);
  assert.match(read("src/components/ui/select.tsx"), /z-\[1001\]/);
  assert.match(read("app/[locale]/(app)/layout.tsx"), /max-sm:min-h-screen/);
  assert.match(modal, /\{t\("statistics\.title"\)\}/);
  assert.doesNotMatch(modal, /\|\| "Statistics"/);
  const oneRmAt = modal.indexOf("t(\"statistics.one_rm_est\")");
  const volumeAt = modal.indexOf("t(\"statistics.volume\")");
  const sessionsAt = modal.indexOf("t(\"statistics.sessions\")");
  assert.ok(oneRmAt >= 0 && oneRmAt < volumeAt && volumeAt < sessionsAt);
  assert.doesNotMatch(modal, /85kg|2,400kg|\+12%/);
  assert.doesNotMatch(modal, /feature_volume"\)\}<\/p>/);
  assert.match(modal, /relative overflow-hidden rounded-xl border border-dashed/);
  assert.match(modal, /absolute inset-0 flex items-center justify-center/);
  assert.match(modal, /href="\/premium"/);
  assert.match(modal, /!z-\[240\]/);
  assert.match(modal, /\[&>button\]:dark:!bg-\[var\(--wc-dash-panel\)\]/);
  assert.doesNotMatch(modal, /slate-900/);
  for (const key of [
    "statistics.premium_statistics",
    "statistics.premium_statistics_description",
    "statistics.upgrade_now",
    "statistics.no_ads",
    "statistics.cancel_anytime",
    "statistics.preview_notice",
    "statistics.preview_description",
    "statistics.get_premium_access",
  ]) {
    assert.match(overlay, new RegExp(key.replace(/\./g, "\\.")));
  }
  assert.doesNotMatch(overlay, /\+12\.5%|statistics\.rating|4\.8|2450|AnimatedMetrics|AnimatedChart/);
  assert.match(
    read("src/components/ui/simple-select.tsx"),
    new RegExp(
      "<SelectContent className=\"!z-\\[250\\] border border-\\[var\\(--wc-dash-border\\)\\] " +
        "bg-\\[var\\(--wc-dash-panel\\)\\] text-\\[var\\(--wc-dash-text\\)\\]\">",
    ),
  );
  assert.equal(browser.split("className=\"w-full\"").length - 1, 2);
  assert.doesNotMatch(browser, /w-full !z-\[250\]/);
  assert.doesNotMatch(read("src/components/ui/select.tsx"), /!z-\[250\]/);
  assert.match(browser, /modal !z-\[245\]/);
  assert.doesNotMatch(browser, /z-\[27/);
});

test("timer, nav, and version chip reserve space", () => {
  const timer = read(TIMER);
  const main = read(MAIN);
  const root = read("app/[locale]/layout.tsx");
  const nav = read(NAV);
  const footer = read(FOOTER);
  const version = read(VERSION);
  const modal = read(MODAL);
  const frame = root.slice(root.indexOf("data-wc-frame=\"\"") - 240, root.indexOf("data-wc-frame=\"\""));
  const shell = main.slice(main.indexOf("data-wc-shell=\"\"") - 400, main.indexOf("data-wc-shell=\"\""));
  const mainClass = main.slice(main.indexOf("data-wc-main=\"\"") - 240, main.indexOf("data-wc-main=\"\""));
  for (const source of [frame, shell, mainClass]) {
    assert.doesNotMatch(source, /overflow-auto/);
    assert.doesNotMatch(source, /max-h-\[100dvh\]/);
    assert.doesNotMatch(source, /overflow-hidden/);
  }
  assert.match(main, /max-sm:pb-\[calc\(var\(--wc-nav-h\)\+25px\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(
    timer,
    new RegExp(
      "relative mx-auto mb-3 w-fit max-w-\\[calc\\(100vw-16px\\)\\] max-sm:fixed " +
        "max-sm:bottom-\\[calc\\(var\\(--wc-nav-h\\)\\+env\\(safe-area-inset-bottom\\)\\+96px\\)\\] " +
        "max-sm:left-1\\/2 max-sm:-translate-x-1\\/2 max-sm:z-50 max-sm:mb-0 " +
        "sm:fixed sm:right-6 sm:bottom-\\[320px\\] sm:left-auto sm:translate-x-0 sm:z-50 sm:mb-0",
    ),
  );
  assert.match(timer, /max-sm:fixed max-sm:bottom-\[calc\(var\(--wc-nav-h\)\+env\(safe-area-inset-bottom\)\+96px\)\]/);
  assert.match(timer, /max-sm:left-1\/2 max-sm:-translate-x-1\/2 max-sm:z-50/);
  assert.match(timer, /sm:right-6 sm:bottom-\[320px\] sm:left-auto sm:translate-x-0 sm:z-50/);
  assert.match(timer, /sm:z-50/);
  assert.doesNotMatch(timer, /fixed bottom-36/);
  assert.match(timer, /<Timer initialSeconds=\{0\} isRunning=\{isTimerRunning\} key=\{resetCount\} \/>/);
  assert.match(timer, /onClick=\{toggleTimer\}/);
  assert.match(timer, /onClick=\{handleReset\}/);
  assert.match(nav, /max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-40/);
  assert.match(nav, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(nav, /data-active=\{isActive \? "true" : "false"\}/);
  assert.match(nav, /max-sm:pb-\[env\(safe-area-inset-bottom\)\]/);
  assert.doesNotMatch(nav, /max-sm:order-3/);
  assert.match(footer, /max-sm:order-2 max-sm:shrink-0/);
  assert.match(version, /pointer-events-none relative z-20 w-fit self-start/);
  assert.doesNotMatch(version, /z-50/);
  assert.doesNotMatch(version, /w-full/);
  assert.doesNotMatch(version, /left-1\/2/);
  assert.doesNotMatch(version, /sm:left-4/);
  assert.doesNotMatch(version, /sm:bottom-/);
  assert.doesNotMatch(version, /max-sm:bottom-/);
  assert.doesNotMatch(version, /\babsolute\b/);
  assert.doesNotMatch(version, /fixed/);
  assert.match(main, /<Version \/>/);
  assert.ok(main.indexOf("<Version />") < main.indexOf("{children}"));
  assert.doesNotMatch(root, /<Version \/>/);
  assert.match(read(SETS), /max-sm:pb-\[calc\(var\(--wc-nav-h\)\+168px\)\]/);
  assert.match(read(SETS), /sm:pb-40/);
  assert.match(read(STEPPER), /w-full max-w-6xl mx-auto sm:pr-64 xl:pr-0/);
  assert.match(root, /<div className="relative flex min-h-screen w-full items-center justify-center" data-wc-frame="">/);
  assert.match(read(STEP_FOOTER), /max-sm:bottom-\[calc\(var\(--wc-nav-h\)\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(read(DETAIL), /className="pb-16"/);
  const bodyAt = root.indexOf("<body");
  const bodyOpen = root.slice(bodyAt, root.indexOf("GeistMono", bodyAt));
  assert.match(bodyOpen, /"min-h-screen max-sm:p-0"/);
  assert.doesNotMatch(bodyOpen, /\brelative\b/);
  assert.match(version, /text-lg leading-snug text-\[var\(--wc-dash-secondary\)\]/);
  assert.equal(version.split("v{appVersion}").length - 1, 2);
  assert.doesNotMatch(version, /bottom-36/);
  assert.equal(modal.split("bg-[var(--wc-dash-page)]").length - 1, 2);
  assert.match(modal, /w-\[calc\(100vw-16px\)\] max-w-\[calc\(100vw-16px\)\]/);
  const embed = read("src/features/embed/embed-theme.css");
  assert.match(
    embed,
    new RegExp(
      "html\\[data-wc-embed=\"1\"\\] \\[data-wc-frame\\],\\s*" +
        "html\\[data-wc-embed=\"1\"\\] \\[data-wc-shell\\],\\s*" +
        "html\\[data-wc-embed=\"1\"\\] \\[data-wc-main\\] \\{\\s*" +
        "max-height: none !important;\\s*overflow: visible !important;\\s*\\}",
    ),
  );
});

test("premium gate copy exists in every locale", () => {
  for (const locale of ["en", "fr", "es", "pt", "ru", "zh-CN"]) {
    const source = read(`locales/${locale}.ts`);
    const match = source.match(/upgrade_to_access_feature:\s*"([^"]+)"/);
    assert.ok(match, locale);
    assert.ok(match[1].trim().length > 0, locale);
    assert.notEqual(match[1], "premium.upgrade_to_access_feature", locale);
    assert.notEqual(match[1], "upgrade_to_access_feature", locale);
  }
});

test("volume, import, and open-source copy use the locale's own words", () => {
  const es = read("locales/es.ts");
  const fr = read("locales/fr.ts");
  const pt = read("locales/pt.ts");
  assert.match(es, /Volumen = Peso × Repeticiones × Series/);
  assert.match(fr, /Volume = Poids × répétitions × Séries/);
  assert.match(pt, /Volume = Peso × repetições × Séries/);
  assert.match(es, /datos básicos \(repeticiones y peso\)/);
  assert.match(es, /open_source_title: "100% código abierto"/);
  assert.doesNotMatch(es, /Peso × Reps × Series/);
  assert.doesNotMatch(es, /reps & peso/);
  assert.doesNotMatch(es, /100% Open Source/);
  assert.doesNotMatch(fr, /Poids × Reps × Séries/);
  assert.doesNotMatch(pt, /Peso × Reps × Séries/);
});

test("embed login and sign up links keep a 48px minimum width", () => {
  const view = read("src/features/embed/ui/embed-auth-fallback-view.tsx");
  const tags = [...view.matchAll(/<a[\s\S]*?<\/a>/g)].map((match) => match[0]);
  const login = tags.find((tag) => tag.includes("{loginLabel}"));
  const signup = tags.find((tag) => tag.includes("{signupLabel}"));
  assert.ok(login);
  assert.ok(signup);
  assert.match(login, /!min-w-12/);
  assert.match(signup, /!min-w-12/);
  assert.equal(view.split("!min-w-12").length - 1, 2);
});

test("program session rows shrink the text column and keep the status icon", () => {
  const detail = read(DETAIL);
  assert.match(detail, /flex min-h-12 min-w-0 cursor-pointer items-center gap-4/);
  assert.match(detail, /<div className="min-w-0 flex-1">/);
  assert.match(detail, /mb-1 flex min-w-0 flex-wrap items-center gap-2/);
  assert.match(detail, /min-w-0 break-words text-lg font-bold/);
  assert.match(detail, /flex h-12 w-12 shrink-0 items-center justify-center/);
  assert.doesNotMatch(detail, /overflow-x-hidden/);
});
