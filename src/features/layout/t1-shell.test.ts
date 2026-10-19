import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

function read(path: string) {
  return readFileSync(path, "utf8");
}

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

function colorDeclarations(block: string, prefix: string) {
  const found: Record<string, string> = {};
  const pattern = new RegExp(`${prefix}([a-z]+)\\s*:\\s*(#[0-9a-fA-F]{3,8})\\s*;`, "g");
  for (const match of block.matchAll(pattern)) {
    assert.equal(found[match[1]], undefined, match[1]);
    found[match[1]] = match[2].toLowerCase();
  }
  return found;
}

function navSkeleton(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"(?:\\.|[^"\\])*"/g, "S")
    .replace(/'(?:\\.|[^'\\])*'/g, "S")
    .replace(/\s+/g, "");
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
  assert.match(stepper, /data-wc-intro/);
  assert.match(stepper, /data-wc-kicker/);
  assert.match(stepper, /<h2 className="mt-2 text-3xl font-bold text-\[var\(--wc-dash-text\)\]" data-wc-title="">/);
  assert.match(stepper, /\{t\("workout_builder\.title"\)\}/);
  assert.doesNotMatch(stepper, /<h1[^>]*data-wc-title/);
  assert.doesNotMatch(stepper, /Build your workout/);
  assert.doesNotMatch(stepper, /data-wc-lead/);
  assert.doesNotMatch(read("src/features/embed/embed-theme.css"), /data-wc-lead/);
  assert.doesNotMatch(stepper, /className="hidden[^"]*" data-wc-intro/);
  assert.match(read("src/features/workout-builder/ui/stepper-header.tsx"), /const StepTitle = isActive \? "h1" : "h3"/);
  assert.match(stepper, /data-wc-step-sheet/);
  assert.match(stepper, /bottom_navigation\.workouts/);
  assert.match(footer, /data-wc-step-next/);
  assert.match(footer, /data-wc-step-previous/);
  assert.match(footer, /disabled=\{isFirstStep\}/);
  assert.match(read("src/features/workout-builder/ui/stepper-header.tsx"), /data-wc-step-mark/);
  assert.match(read("src/features/embed/embed-theme.css"), /data-wc-intro/);
  assert.match(read("src/features/embed/embed-theme.css"), /data-wc-step-sheet/);
  assert.match(read("src/features/embed/embed-theme.css"), /order:\s*-1/);
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
  assert.match(layout, /<Version \/>/);
  assert.ok(layout.indexOf("<Version />") < layout.indexOf("{children}"));
  assert.doesNotMatch(root, /<Version \/>/);
  assert.match(root, /bg-hero-light/);
  assert.match(version, /data-wc-chrome="version"/);
  assert.match(version, /text-lg leading-snug text-\[var\(--wc-dash-secondary\)\]/);
  assert.doesNotMatch(version, /text-xs/);
  assert.match(version, /data-wc-version-meta/);
  assert.match(version, /className="hidden"/);
  assert.match(version, /v\{appVersion\}/);
  assert.doesNotMatch(nav, /text-\[9px\]/);
  assert.doesNotMatch(nav, /sm:text-xs/);
  assert.doesNotMatch(nav, /isPremium && "hidden"/);
});

test("T1 embed presentation is scoped, 18px, and does not letter-wrap", () => {
  const css = read("src/features/embed/embed-theme.css");
  assert.doesNotMatch(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /html\[data-wc-embed="1"\] \[data-wc-version-meta\][\s\S]*font-size:\s*18px/);
  assert.match(css, /html\[data-wc-embed="1"\] \[data-wc-chrome="nav"\] a[\s\S]*min-height:\s*56px/);
  assert.match(css, /html\[data-wc-embed="1"\] \[data-wc-chrome="nav"\] a span[\s\S]*font-size:\s*18px/);
  assert.match(css, /data-wc-nav-premium[\s\S]*var\(--wc-dash-link\)/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /@media \(min-width:\s*448px\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\[data-wc-chrome="version"\][\s\S]*display:\s*none/);
});

test("the premium tab filter is restored", () => {
  const nav = read("src/features/layout/BottomNavigation.tsx");
  const premiumFilter = [
    "  const tabs =",
    "    SiteConfig.allPremiumFeaturesFree ?",
    "      tabsRaw.filter((tab) => tab.id !== \"premium\")",
    "    : tabsRaw;",
  ].join("\n");
  assert.ok(nav.includes(premiumFilter));
  assert.doesNotMatch(nav, /isPremium && "hidden"/);
  assert.doesNotMatch(nav, /const tabs = tabsRaw;/);
});

test("public Log in is 18px and at least 48px", () => {
  const header = read("src/features/layout/Header.tsx");
  const loginCall = "{t(\"commons.login\")}";
  const loginAt = header.indexOf(loginCall);
  assert.ok(loginAt > 0);
  const login = header.slice(Math.max(0, loginAt - 500), loginAt + loginCall.length);
  assert.match(login, /!text-lg/);
  assert.match(login, /!min-h-12/);
  assert.match(login, /!min-w-12/);
  assert.match(login, /shrink-0/);
  assert.match(login, /inline-flex/);
  assert.match(login, /items-center/);
  assert.match(login, /getConfiguredPeptideOsLoginUrl\(\)/);
  assert.match(login, /commons\.login/);
});

test("header, nav, and version use wc-dash variables and contain no raw hex", () => {
  const files = ["src/features/layout/Header.tsx", "src/features/layout/BottomNavigation.tsx", "src/components/version.tsx"];
  const globals = read("src/shared/styles/globals.css");
  for (const file of files) {
    assert.doesNotMatch(read(file), /#[0-9a-fA-F]{3,8}\b/, file);
  }
  assert.match(read(files[0]), /var\(--wc-dash-accent\)/);
  assert.match(read(files[0]), /var\(--wc-dash-ink\)/);
  assert.match(read(files[1]), /var\(--wc-dash-link\)/);
  assert.match(read(files[1]), /var\(--wc-dash-text\)/);
  assert.match(read(files[2]), /var\(--wc-dash-secondary\)/);
  assert.match(globals, /:root \{[\s\S]*--wc-dash-accent:\s*#0a5c52/);
  assert.match(globals, /\.dark \{[\s\S]*--wc-dash-accent:\s*#2dd4bf/);
  assert.match(globals, /--wc-dash-ink:\s*#ffffff/);
  assert.match(globals, /--wc-dash-ink:\s*#04201c/);
});

test("wc-dash blocks mirror the embed light and dark dash maps", () => {
  const globals = read("src/shared/styles/globals.css");
  const embed = read("src/features/embed/embed-theme.css");
  const light = colorDeclarations(blockForSelector(globals, ":root"), "--wc-dash-");
  const dark = colorDeclarations(blockForSelector(globals, ".dark"), "--wc-dash-");
  const embedLight = colorDeclarations(blockForSelector(embed, "html[data-wc-embed=\"1\"]"), "--dash-");
  const embedDark = colorDeclarations(blockForSelector(embed, "html[data-wc-embed=\"1\"].dark"), "--dash-");

  assert.deepEqual(Object.keys(light).sort(), [...DASH_NAMES].sort());
  assert.deepEqual(Object.keys(dark).sort(), [...DASH_NAMES].sort());
  assert.deepEqual(Object.keys(embedLight).sort(), [...DASH_NAMES].sort());
  assert.deepEqual(Object.keys(embedDark).sort(), [...DASH_NAMES].sort());
  for (const name of DASH_NAMES) {
    assert.equal(light[name], embedLight[name], name);
    assert.equal(dark[name], embedDark[name], name);
  }
});

test("nav isActive and isPremium ternary structure is unchanged", () => {
  const skeleton = navSkeleton(read("src/features/layout/BottomNavigation.tsx"));
  const fourWay = "isActive&&isPremium?S:isActive?S:isPremium?S:S";
  assert.equal(skeleton.split(fourWay).length - 1, 2);
  assert.equal(skeleton.split("isActive||isPremium?S:S").length - 1, 1);
  assert.equal(skeleton.split("isPremium&&!isActive").length - 1, 1);
  assert.equal(skeleton.split("isPremium?S:S").length - 1, 5);
  assert.equal(skeleton.split("{isActive&&(").length - 1, 2);
});

test("phone nav clearance matches the two-column nav", () => {
  const nav = read("src/features/layout/BottomNavigation.tsx");
  const main = read("app/[locale]/(app)/layout.tsx");
  const version = read("src/components/version.tsx");
  const footer = read("src/features/workout-builder/ui/workout-stepper-footer.tsx");
  const globals = read("src/shared/styles/globals.css");
  assert.match(nav, /grid grid-cols-2 min-\[448px\]:grid-cols-3/);
  assert.match(nav, /tabs\.length <= 5 \? " lg:flex lg:items-center lg:justify-center lg:gap-1" : ""/);
  assert.match(nav, /whitespace-nowrap/);
  assert.match(nav, /aria-label=\{t\("bottom_navigation\.label"\)\}/);
  assert.match(globals, /--wc-nav-rows:\s*3/);
  assert.match(globals, /--wc-nav-row-h:\s*65px/);
  assert.match(globals, /--wc-nav-h:\s*calc\(var\(--wc-nav-rows\) \* var\(--wc-nav-row-h\)\)/);
  assert.match(globals, /@media \(min-width: 448px\) \{[\s\S]*--wc-nav-rows:\s*2/);
  assert.match(globals, /@media \(min-width: 448px\) \{[\s\S]*--wc-nav-row-h:\s*67px/);
  assert.match(main, /max-sm:pb-\[var\(--wc-nav-h\)\]/);
  assert.match(main, /max-sm:pb-\[var\(--wc-nav-h\)\][\s\S]*data-wc-shell=""/);
  const mainMarker = main.indexOf("data-wc-main=\"\"");
  assert.ok(mainMarker > 0);
  assert.doesNotMatch(main.slice(mainMarker - 180, mainMarker), /pb-\[var\(--wc-nav-h\)\]/);
  assert.match(version, /pointer-events-none/);
  assert.match(version, /z-20/);
  assert.doesNotMatch(version, /z-50/);
  assert.match(version, /relative z-20 w-fit self-start/);
  assert.doesNotMatch(version, /w-full/);
  assert.doesNotMatch(version, /sm:left-4/);
  assert.doesNotMatch(version, /sm:bottom-/);
  assert.doesNotMatch(version, /max-sm:bottom-/);
  assert.doesNotMatch(version, /\babsolute\b/);
  assert.match(main, /sm:pb-12/);
  assert.doesNotMatch(version, /\bfixed\b/);
  assert.match(footer, /max-sm:bottom-\[var\(--wc-nav-h\)\]/);
  assert.match(footer, /disabled:pointer-events-auto/);
  assert.doesNotMatch(footer, /max-sm:bottom-14/);
  assert.match(read("src/features/workout-session/ui/workout-session-timer.tsx"), /bottom-\[var\(--wc-nav-h\)\]/);
  assert.doesNotMatch(main, /max-sm:pb-36/);
  assert.doesNotMatch(version, /bottom-36/);
  for (const locale of ["en", "fr", "pt", "es", "ru", "zh-CN"]) {
    assert.match(read(`locales/${locale}.ts`), /label:\s*"/);
  }
  assert.match(read("locales/en.ts"), /label:\s*"Main navigation"/);
  assert.match(read("locales/en.ts"), /title:\s*"Build your workout"/);
  assert.match(read("locales/fr.ts"), /title:\s*"Construire votre entraînement"/);
  assert.match(read("locales/es.ts"), /title:\s*"Construir tu entrenamiento"/);
  assert.match(read("locales/pt.ts"), /title:\s*"Construir o seu treino"/);
  assert.match(read("locales/ru.ts"), /title:\s*"Составить свою тренировку"/);
  assert.match(read("locales/zh-CN.ts"), /title:\s*"构建您的锻炼"/);
});

test("header dropdown items are 18px and 48px", () => {
  const header = read("src/features/layout/Header.tsx");
  assert.match(header, /className="!no-underline min-h-12 text-lg" href="\/profile"/);
  assert.match(header, /className="!no-underline min-h-12 text-lg"\n\s+data-wc-entry="premium"/);
  assert.match(header, /min-h-12 items-center gap-2 text-lg text-gray-700/);
  assert.match(header, /data-wc-signout=""/);
  assert.match(header, /onClick=\{handleSignOut\}/);
  assert.match(header, /commons\.profile/);
  assert.match(header, /commons\.manage_subscription/);
  assert.match(header, /commons\.remove_ads/);
  assert.match(header, /commons\.logout/);
  const password = read("src/features/update-password/ui/change-password-menu-item.tsx");
  assert.match(password, /size="base"/);
  assert.match(password, /!min-h-12 !text-lg/);
});

test("embed nav grid fits five or six tabs", () => {
  const css = read("src/features/embed/embed-theme.css");
  const desktop = new RegExp(
    "\\[data-wc-nav-grid\\] \\{\\s*display: grid !important;\\s*" +
      "grid-template-columns: repeat\\(2, minmax\\(0, 1fr\\)\\);",
  );
  const phone = new RegExp(
    "@media \\(min-width: 448px\\) \\{\\s*html\\[data-wc-embed=\"1\"\\] \\[data-wc-nav-grid\\] \\{\\s*" +
      "grid-template-columns: repeat\\(3, minmax\\(0, 1fr\\)\\);",
  );
  assert.match(css, desktop);
  assert.doesNotMatch(read("src/features/layout/BottomNavigation.tsx"), /--wc-nav-tabs/);
  assert.match(css, phone);
  assert.doesNotMatch(css, /repeat\(5,/);
});

test("embed nav labels stay visible", () => {
  const css = read("src/features/embed/embed-theme.css");
  assert.match(css, /html\[data-wc-embed="1"\] \[data-wc-chrome="nav"\] a > span \{[^}]*display:\s*block\s*!important/);
  assert.match(css, /html\[data-wc-embed="1"\] \[data-wc-chrome="nav"\] a span \{[^}]*white-space:\s*normal\s*!important/);
  assert.doesNotMatch(css, /\[data-wc-chrome="nav"\] a > span \{[^}]*display:\s*none/);
  assert.doesNotMatch(css, /\[data-wc-chrome="nav"\] a span \{[^}]*white-space:\s*nowrap/);
});

test("embed active and meta contrast colors hold", () => {
  const css = read("src/features/embed/embed-theme.css");
  assert.match(
    css,
    /html\[data-wc-embed="1"\] \[data-wc-chrome="nav"\] a\[data-active="true"\] \{[^}]*background:\s*var\(--wc-dash-accent\)\s*!important;[^}]*color:\s*var\(--wc-dash-ink\)\s*!important/,
  );
  assert.match(css, /html\[data-wc-embed="1"\] \[data-wc-version-meta\] \{[^}]*color:\s*var\(--wc-dash-secondary\)\s*!important/);
});

test("embed nav icons stay visible at 24px", () => {
  const css = read("src/features/embed/embed-theme.css");
  const nav = read("src/features/layout/BottomNavigation.tsx");
  assert.match(nav, /data-wc-nav-icon=""/);
  assert.match(css, /html\[data-wc-embed="1"\] \[data-wc-nav-icon\] \{[^}]*display:\s*flex\s*!important/);
  assert.match(
    css,
    /html\[data-wc-embed="1"\] \[data-wc-nav-icon\] svg \{[^}]*width:\s*24px\s*!important;[^}]*height:\s*24px\s*!important/,
  );
  assert.doesNotMatch(css, /\[data-wc-chrome="nav"\] a > div \{\s*display:\s*none/);
});

test("public Sign up, nav labels, and the version chip are at least 18px", () => {
  const header = read("src/features/layout/Header.tsx");
  const nav = read("src/features/layout/BottomNavigation.tsx");
  const version = read("src/components/version.tsx");
  const signupCall = "{t(\"commons.signup\")}";
  const signupAt = header.indexOf(signupCall);
  assert.ok(signupAt > 0);
  const signup = header.slice(Math.max(0, signupAt - 800), signupAt + signupCall.length);
  assert.match(signup, /!text-lg/);
  assert.match(signup, /!min-h-12/);
  assert.match(signup, /whitespace-nowrap/);
  assert.match(signup, /commons\.signup/);
  assert.match(nav, /text-lg/);
  assert.match(nav, /whitespace-nowrap/);
  assert.doesNotMatch(nav, /whitespace-normal/);
  assert.match(nav, /grid grid-cols-2 min-\[448px\]:grid-cols-3/);
  assert.doesNotMatch(nav, /truncate/);
  assert.doesNotMatch(nav, /text-ellipsis/);
  assert.doesNotMatch(nav, /text-xs/);
  assert.doesNotMatch(nav, /text-\[9px\]/);
  assert.match(version, /text-lg/);
  assert.doesNotMatch(version, /text-xs/);
});

test("embed colors outside the token blocks use wc-dash variables", () => {
  const css = read("src/features/embed/embed-theme.css");
  const withoutTokens = css
    .replace(/html\[data-wc-embed="1"\] \{[\s\S]*?\n\}/, "")
    .replace(/html\[data-wc-embed="1"\]\.dark \{[\s\S]*?\n\}/, "");
  assert.doesNotMatch(withoutTokens, /#(?:5eead4|2dd4bf|10211e|f2f5f8|0a5c52|075e56|33414a|b4becb|ffffff)/i);
  assert.doesNotMatch(withoutTokens, /var\(--dash-/);
  assert.match(withoutTokens, /var\(--wc-dash-accent\)/);
  assert.match(withoutTokens, /var\(--wc-dash-link\)/);
  assert.match(withoutTokens, /var\(--wc-dash-ink\)/);
  assert.match(withoutTokens, /var\(--wc-dash-secondary\)/);
});

test("equipment card titles are 18px dash tokens", () => {
  const equipment = read("src/features/workout-builder/ui/equipment-selection.tsx");
  assert.match(equipment, /font-semibold text-lg leading-tight tracking-wide/);
  assert.match(equipment, /text-\[var\(--wc-dash-accent\)\]/);
  assert.match(equipment, /text-\[var\(--wc-dash-text\)\] group-hover:text-\[var\(--wc-dash-accent\)\]/);
  assert.doesNotMatch(equipment, /font-semibold text-sm/);
  assert.doesNotMatch(equipment, /text-emerald-700/);
  assert.doesNotMatch(equipment, /text-slate-700/);
});
