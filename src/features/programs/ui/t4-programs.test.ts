import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

function read(path: string) {
  return readFileSync(path, "utf8");
}

const CARD = "src/features/programs/ui/program-card.tsx";
const DETAIL = "src/features/programs/ui/program-detail-page.tsx";
const PROGRESS = "src/features/programs/ui/program-progress.tsx";
const LIST = "src/features/programs/ui/programs-page.tsx";
const SHARE = "src/features/programs/ui/share-button.tsx";
const WELCOME = "src/features/programs/ui/welcome-modal.tsx";
const FILES = [CARD, DETAIL, PROGRESS, LIST, SHARE, WELCOME];

const DASH_NAMES = ["page", "panel", "inner", "card", "border", "text", "secondary", "accent", "ink", "link", "error"];
const CONFETTI_COLORS = "colors: [\"#4F8EF7\", \"#25CB78\", \"#FFD700\"]";
const ACTIVE_TAB = "\"!bg-[var(--wc-dash-accent)] !text-[var(--wc-dash-ink)]\"";
const INACTIVE_TAB = "\"!text-[var(--wc-dash-text)]\"";

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

function count(source: string, needle: string) {
  return source.split(needle).length - 1;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function classCount(source: string, name: string) {
  return [...source.matchAll(new RegExp(`(?<![\\w-])${name}(?![\\w-])`, "g"))].length;
}

test("program screens use dash tokens and no raw hex", () => {
  const { light, dark } = tokens();
  for (const name of DASH_NAMES) {
    assert.ok(light[name], name);
    assert.ok(dark[name], name);
  }
  for (const path of FILES) {
    const source = read(path);
    const styled = path === WELCOME ? source.split(CONFETTI_COLORS).join("") : source;
    assert.match(source, /--wc-dash-/);
    assert.doesNotMatch(styled, /#[0-9a-fA-F]{3,8}/);
    assert.doesNotMatch(source, /text-slate-|bg-slate-|text-red-|bg-red-|text-green-|bg-green-|text-blue-|bg-blue-/);
    assert.doesNotMatch(source, /text-yellow-|bg-yellow-|text-purple-|bg-purple-|text-gray-|bg-gray-|text-white|bg-white/);
  }
});

test("program text is 18px and tap targets are 48px", () => {
  const list = read(LIST);
  const detail = read(DETAIL);
  const welcome = read(WELCOME);
  const share = read(SHARE);
  const card = read(CARD);
  assert.match(list, /text-lg text-\[var\(--wc-dash-text\)\]">\{t\("programs\.more_programs_coming_title"\)\}/);
  assert.doesNotMatch(list, /coming_strength|coming_cardio|coming_yoga|commons\.new|available_programs/);
  assert.match(detail, /bg-\[var\(--wc-dash-accent\)\] px-6 py-4 text-lg font-bold text-\[var\(--wc-dash-ink\)\]/);
  assert.match(detail, /bg-\[var\(--wc-dash-panel\)\] px-3 text-lg font-medium text-\[var\(--wc-dash-text\)\]/);
  assert.match(card, /text-\[var\(--wc-dash-secondary\)\]">•/);
  assert.match(list, /animate-fade-in-up/);
  assert.match(list, /animationDelay: `\$\{index \* 100\}ms`/);
  assert.match(detail, /z-1 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-0/);
  assert.match(welcome, /!min-h-12 flex-1 !border-0 !bg-\[var\(--wc-dash-accent\)\] !text-lg !text-\[var\(--wc-dash-ink\)\]/);
  assert.match(welcome, /!min-h-12 flex-1 !border !border-\[var\(--wc-dash-border\)\]/);
  assert.match(welcome, /!bg-\[var\(--wc-dash-panel\)\] !text-lg !text-\[var\(--wc-dash-text\)\]/);
  assert.match(share, /sm: "min-h-12 min-w-12 p-2"/);
  assert.match(share, /md: "min-h-12 min-w-12 p-3"/);
  assert.match(share, /lg: "min-h-12 min-w-12 p-4"/);
  assert.match(card, /inline-flex min-h-12 items-center rounded-full border border-\[var\(--wc-dash-border\)\]/);
  assert.match(card, /px-3 text-lg font-semibold text-\[var\(--wc-dash-text\)\]/);
  assert.match(card, /px-3 text-lg font-semibold text-\[var\(--wc-dash-link\)\]/);
  assert.match(card, /bg-\[var\(--wc-dash-accent\)\] px-3 text-lg font-semibold text-\[var\(--wc-dash-ink\)\]/);
  assert.match(card, /className=\{levelConfig\.kicker\}/);
});

test("program contrast pairs meet AA", () => {
  const { light, dark } = tokens();
  const pairs = [
    ["ink", "accent"],
    ["error", "panel"],
    ["error", "card"],
    ["text", "panel"],
    ["text", "card"],
    ["text", "inner"],
    ["secondary", "panel"],
    ["secondary", "card"],
    ["secondary", "inner"],
    ["accent", "card"],
    ["link", "card"],
  ] as const;
  for (const [foreground, background] of pairs) {
    assert.ok(contrast(light[foreground], light[background]) >= 4.5, `light ${foreground} on ${background}`);
    assert.ok(contrast(dark[foreground], dark[background]) >= 4.5, `dark ${foreground} on ${background}`);
  }
});

test("program handlers, hrefs, disabled expressions, and conditionals stay byte-identical", () => {
  const card = read(CARD);
  const detail = read(DETAIL);
  const progress = read(PROGRESS);
  const list = read(LIST);
  const share = read(SHARE);
  const welcome = read(WELCOME);

  assert.match(card, /const isLocked = program\.isPremium && !SiteConfig\.allPremiumFeaturesFree;/);
  assert.match(card, /href=\{`\/programs\/\$\{programSlug\}`\}/);
  assert.match(card, /case "BEGINNER":/);
  assert.match(card, /case "INTERMEDIATE":/);
  assert.match(card, /case "ADVANCED":/);
  assert.match(card, /size === "large" \? 16 : 14/);
  assert.match(card, /size === "large" \? 24 : 20/);
  assert.equal(count(card, "size === \"large\" ? 24 : 20"), 2);
  assert.match(card, /program\.isPremium \? premiumKicker : levelKicker\.text/);
  assert.match(card, /program\.isPremium \? t\("programs\.premium"\) : t\("programs\.free"\)/);
  assert.doesNotMatch(card, />Premium</);
  assert.match(card, /t\("programs\.weeks", \{ count: program\.durationWeeks \}\)/);
  assert.match(card, /t\("programs\.sessions_per_week", \{ count: program\.sessionsPerWeek \}\)/);
  assert.match(card, /t\("programs\.session_duration"\)/);
  assert.match(
    card,
    new RegExp(
      "inline-flex min-h-12 w-full items-center justify-center rounded-xl border-2 " +
        "border-\\[var\\(--wc-dash-text\\)\\] bg-\\[var\\(--wc-dash-card\\)\\] px-4 text-lg " +
        "font-semibold text-\\[var\\(--wc-dash-text\\)\\]",
    ),
  );
  assert.match(card, /\{isLocked \? \(/);
  assert.match(card, /\{!isLocked && <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-\[var\(--wc-dash-accent\)\]" \/>\}/);
  assert.match(card, /program\.equipment && program\.equipment\.length > 0/);
  assert.match(card, /program\.equipment\.length > 3/);
  assert.match(card, /itemScope/);
  assert.match(card, /itemType="https:\/\/schema\.org\/Course"/);

  assert.match(list, /if \(programs\.length === 0\)/);
  assert.match(list, /\{programs\.length > 0 && \(/);
  assert.match(list, /size=\{index === 0 \? "medium" : "medium"\}/);
  assert.match(list, /env\.NEXT_PUBLIC_TOP_PROGRAMS_BANNER_AD_SLOT \|\| env\.NEXT_PUBLIC_EZOIC_TOP_PROGRAMS_PLACEMENT_ID/);
  assert.match(list, /env\.NEXT_PUBLIC_BOTTOM_PROGRAMS_BANNER_AD_SLOT \|\| env\.NEXT_PUBLIC_EZOIC_BOTTOM_PROGRAMS_PLACEMENT_ID/);

  assert.match(detail, /onClick=\{\(\) => setTab\("about"\)\}/);
  assert.match(detail, /onClick=\{\(\) => setTab\("sessions"\)\}/);
  assert.match(detail, /onClick=\{\(\) => setSelectedWeek\(week\.weekNumber\)\}/);
  assert.match(detail, /onClick=\{handleCTAClick\}/);
  assert.match(detail, /window\.location\.href = `\/\$\{currentLocale\}\/programs\/\$\{program\.slug\}\/session\/\$\{sessionSlug\}`;/);
  assert.equal(count(detail, "router.push(`/programs/${program.slug}/?tab=sessions`)"), 2);
  assert.equal(count(detail, "window.location.assign(getConfiguredPeptideOsSignupUrl("), 2);
  assert.match(detail, new RegExp(`tab === "about" \\? ${escapeRegExp(ACTIVE_TAB)} : ${escapeRegExp(INACTIVE_TAB)}`));
  assert.match(detail, new RegExp(`tab === "sessions" \\? ${escapeRegExp(ACTIVE_TAB)} : ${escapeRegExp(INACTIVE_TAB)}`));
  assert.match(
    detail,
    new RegExp(`selectedWeek === week\\.weekNumber\\s*\\?\\s*${escapeRegExp(ACTIVE_TAB)}\\s*:\\s*${escapeRegExp(INACTIVE_TAB)}`),
  );
  assert.equal(count(detail, ACTIVE_TAB), 3);
  assert.equal(count(detail, INACTIVE_TAB), 3);
  assert.match(detail, /\{tab === "about" && \(/);
  assert.match(detail, /\{tab === "sessions" && \(/);
  assert.match(detail, /\{isAuthenticated && <ProgramProgress programId=\{program\.id\} \/>\}/);
  assert.match(detail, /\{!isPremium && \(/);
  assert.match(detail, /program\.coaches\.length > 0/);
  assert.match(detail, /const sessionPaywalled = session\.isPremium && !SiteConfig\.allPremiumFeaturesFree;/);
  assert.match(detail, /const isCompleted = completedSessions\.has\(session\.id\);/);
  assert.match(detail, /if \(currentWeekSessions\.length === 0\)/);
  assert.match(detail, /\{isCompleted && \(/);
  assert.match(detail, /\{!isCompleted && !sessionPaywalled && \(/);
  assert.match(detail, /\{!isCompleted && sessionPaywalled && \(/);
  assert.match(detail, /\{!isProgramCompleted && tab !== "sessions" && \(/);
  assert.match(detail, /\{isProgramCompleted && \(/);
  assert.match(detail, /isAuthenticated && hasJoinedProgram \? t\("programs\.continue"\) : t\("programs\.join_cta"\)/);
  assert.match(detail, /data-tip=\{t\("commons\.share"\)\}/);
  assert.match(detail, /onClose=\{\(\) => setShowWelcomeModal\(false\)\}/);
  assert.match(detail, /onJoin=\{handleJoinProgram\}/);
  assert.match(detail, /env\.NEXT_PUBLIC_TOP_PROGRAM_DETAILS_BANNER_AD_SLOT \|\| env\.NEXT_PUBLIC_EZOIC_TOP_PROGRAM_DETAILS_PLACEMENT_ID/);
  assert.match(
    detail,
    /env\.NEXT_PUBLIC_BOTTOM_PROGRAM_DETAILS_BANNER_AD_SLOT \|\| env\.NEXT_PUBLIC_EZOIC_BOTTOM_PROGRAM_DETAILS_PLACEMENT_ID/,
  );

  assert.match(progress, /searchParams\.get\("refresh"\)/);
  assert.match(progress, /if \(refreshParam\)/);
  assert.match(progress, /if \(isLoading\)/);
  assert.match(progress, /if \(!progress\)/);

  assert.match(share, /disabled=\{isSharing\}/);
  assert.match(share, /onClick=\{handleShare\}/);
  assert.match(share, /\{isSharing \? \(/);
  assert.match(share, /\) : shareMessage \? \(/);
  assert.match(share, /\{shareMessage && \(/);

  assert.match(welcome, /if \(isOpen\)/);
  assert.match(welcome, /if \(!isOpen\) return null;/);
  assert.match(welcome, /isAnimating \? "scale-100 opacity-100" : "scale-95 opacity-0"/);
  assert.equal(count(welcome, "onClick={onClose}"), 2);
  assert.match(welcome, /onClick=\{handleJoin\}/);
});

test("program copy stays on the existing translation keys", () => {
  const expected: Record<string, Record<string, number>> = {
    [CARD]: {
      "`levels.${program.level}`": 2,
      "\"programs.weeks\"": 1,
      "\"programs.cover_alt\"": 1,
      "\"programs.program\"": 1,
      "\"programs.sessions_per_week\"": 1,
      "\"programs.session_duration\"": 1,
      "\"programs.premium\"": 1,
      "\"programs.free\"": 1,
      "\"programs.about\"": 1,
    },
    [DETAIL]: {
      "\"about\"": 1,
      "\"breadcrumbs.home\"": 1,
      "\"programs.workout_programs\"": 1,
      "\"refresh\"": 1,
      "`levels.${program.level}`": 3,
      "\"programs.about\"": 2,
      "\"programs.sessions\"": 2,
      "\"programs.important_info\"": 1,
      "\"programs.donation_teaser\"": 1,
      "\"programs.community\"": 1,
      "\"programs.community_count\"": 1,
      "\"commons.share\"": 1,
      "\"programs.characteristics\"": 1,
      "\"programs.weeks\"": 2,
      "\"programs.cover_alt\"": 1,
      "\"programs.sessions_per_week\"": 2,
      "\"programs.session_duration\"": 1,
      "\"programs.your_coach\"": 1,
      "\"programs.week_short\"": 1,
      "\"programs.sessions_coming_soon\"": 1,
      "\"programs.sessions_in_creation\"": 1,
      "\"programs.completed\"": 1,
      "\"programs.free\"": 1,
      "\"programs.premium\"": 1,
      "\"programs.exercises\"": 1,
      "\"programs.min_short\"": 1,
      "\"programs.continue\"": 1,
      "\"programs.join_cta\"": 1,
      "\"programs.program_completed\"": 1,
    },
    [PROGRESS]: {
      "\"refresh\"": 1,
      "\"programs.my_progress\"": 1,
      "\"programs.completed_sets\"": 1,
      "\"programs.completed_feminine\"": 1,
      "\"programs.week\"": 1,
      "\"programs.session\"": 1,
    },
    [LIST]: {
      "\"programs.kicker\"": 2,
      "\"programs.no_programs_available\"": 1,
      "\"programs.no_programs_available_description\"": 1,
      "\"programs.workout_programs\"": 2,
      "\"programs.workout_programs_description\"": 1,
      "\"programs.more_programs_coming_title\"": 1,
    },
    [WELCOME]: {
      "\"programs.welcome_modal.welcome_title\"": 1,
      "\"programs.welcome_modal.subtitle\"": 1,
      "\"programs.welcome_modal.level_label\"": 1,
      "\"programs.welcome_modal.duration_label\"": 1,
      "\"programs.welcome_modal.frequency_label\"": 1,
      "\"programs.welcome_modal.later_button\"": 1,
      "\"programs.welcome_modal.start_button\"": 1,
      "\"programs.welcome_modal.close\"": 1,
    },
  };

  for (const [path, keys] of Object.entries(expected)) {
    const source = read(path);
    const found = [...source.matchAll(/t\((`[^`]+`|"[^"]+")/g)].map((match) => match[1]);
    const actual: Record<string, number> = {};
    for (const key of found) actual[key] = (actual[key] ?? 0) + 1;
    assert.deepEqual(actual, keys, path);
  }
  assert.equal(count(read(SHARE), "t("), 0);
});

test("program tabs, washes, confetti, progress, and visibility stay locked", () => {
  const card = read(CARD);
  const detail = read(DETAIL);
  const progress = read(PROGRESS);
  const welcome = read(WELCOME);
  const openConfetti = `confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          ${CONFETTI_COLORS},
        })`;
  const joinConfetti = `confetti({
      particleCount: 200,
      spread: 120,
      origin: { y: 0.5 },
      ${CONFETTI_COLORS},
    })`;

  assert.equal(count(welcome, openConfetti), 1);
  assert.equal(count(welcome, joinConfetti), 1);
  assert.equal(count(welcome, CONFETTI_COLORS), 2);
  assert.equal(count(welcome, "particleCount: 100"), 1);
  assert.equal(count(welcome, "particleCount: 200"), 1);
  assert.match(card, /bg-\[color-mix\(in_srgb,var\(--wc-dash-page\)_40%,transparent\)\]/);
  assert.match(welcome, /bg-\[color-mix\(in_srgb,var\(--wc-dash-page\)_80%,transparent\)\]/);
  assert.doesNotMatch(card, /bg-\[var\(--wc-dash-page\)\]\/40/);
  assert.doesNotMatch(welcome, /bg-\[var\(--wc-dash-page\)\]\/80/);
  assert.match(progress, /\{stats\.completionPercentage\}%/);
  assert.match(detail, /isPremium\s*\?\s*"bg-\[var\(--wc-dash-accent\)\]"\s*:\s*"bg-\[var\(--wc-dash-link\)\]"/);
  assert.match(card, /kicker: levelKicker\.accent/);
  assert.match(card, /kicker: levelKicker\.link/);
  assert.equal(count(card, "kicker: levelKicker.text"), 2);

  for (const path of FILES) {
    const source = read(path);
    assert.equal(classCount(source, "hidden"), 0, path);
    assert.equal(classCount(source, "invisible"), 0, path);
    assert.equal(classCount(source, "sr-only"), 0, path);
  }
  assert.match(read(CARD), /line-clamp-2/);
  assert.match(read(CARD), /className=\{levelConfig\.kicker\}/);
});

test("breadcrumb Home is 18px with a 48px target", () => {
  const crumbs = read("src/components/seo/breadcrumbs.tsx");
  const detail = read(DETAIL);
  const list = read(LIST);
  assert.match(crumbs, /href=\{item\.href\}/);
  assert.match(crumbs, /inline-flex min-h-12 items-center text-lg/);
  assert.match(crumbs, /index === 0 \? " text-\[var\(--wc-dash-secondary\)\]" : " text-\[var\(--wc-dash-text\)\]"/);
  assert.match(crumbs, /aria-current="page" className="text-lg font-medium text-\[var\(--wc-dash-text\)\]"/);
  assert.doesNotMatch(crumbs, /text-gray-600|text-gray-900|dark:text-white/);
  assert.doesNotMatch(crumbs, /Home aria-hidden="true" className="h-3/);
  assert.match(detail, /relative min-h-40 bg-\[var\(--wc-dash-accent\)\] pr-24 sm:min-h-64/);
  assert.doesNotMatch(detail, /relative h-40 bg-\[var\(--wc-dash-accent\)\] sm:h-64/);
  assert.match(list, /flex flex-wrap items-start justify-between gap-y-2/);
  assert.match(list, /mb-3 min-w-0 break-words text-2xl font-bold tracking-tight/);
  assert.doesNotMatch(list, /WorkoutCoolWooow/);
  assert.doesNotMatch(list, /Mascotte/);
  assert.doesNotMatch(detail, /Mascotte|Communauté|Coachs|Rejoindre/);
  assert.doesNotMatch(read(WELCOME), /WorkoutCool Mascot/);
  assert.match(read(WELCOME), /aria-label=\{t\("programs\.welcome_modal\.close"\)\}/);
  assert.match(read(CARD), /t\("programs\.weeks", \{ count: program\.durationWeeks \}\)/);
  assert.match(read(CARD), /t\("programs\.sessions_per_week", \{ count: program\.sessionsPerWeek \}\)/);
  assert.match(read("locales/ru.ts"), /"weeks#one": "неделя"/);
  assert.match(read("locales/ru.ts"), /"weeks#few": "недели"/);
  assert.match(read("locales/ru.ts"), /"weeks#many": "недель"/);
  assert.match(read("locales/ru.ts"), /"sessions_per_week#one": "сессия\/неделя"/);
  assert.match(read("locales/ru.ts"), /"sessions_per_week#few": "сессии\/неделя"/);
  assert.match(read("locales/ru.ts"), /"sessions_per_week#many": "сессий\/неделя"/);
  assert.match(read("locales/zh-CN.ts"), /program: "计划"/);
  assert.match(read("locales/zh-CN.ts"), /workout_programs: "锻炼计划"/);
  assert.match(read("locales/zh-CN.ts"), /more_programs_coming_title: "更多计划即将推出！"/);
  for (const locale of ["en", "fr", "es", "pt", "ru", "zh-CN"]) {
    assert.match(read(`locales/${locale}.ts`), /cover_alt:/);
    assert.match(read(`locales/${locale}.ts`), /close:/);
  }
});
