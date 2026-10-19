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

function wcDash(block: string) {
  const found: Record<string, string> = {};
  for (const match of block.matchAll(/--wc-dash-([a-z]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    found[match[1]] = match[2].toLowerCase();
  }
  return found;
}

function channel(hex: string) {
  const value = hex.slice(1);
  const full = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
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
    dark: wcDash(blockForSelector(globals, ".dark"))
  };
}

test("stepper uses teal accent tokens and a check on finished steps", () => {
  const header = read("src/features/workout-builder/ui/stepper-header.tsx");
  const stepper = read("src/features/workout-builder/ui/workout-stepper.tsx");
  const css = read("src/features/embed/embed-theme.css");

  const tealMark =
    "\"border-[var(--wc-dash-accent)] bg-[var(--wc-dash-accent)] text-[var(--wc-dash-ink)]\": isActive || isCompleted";
  const tealLabel = "\"text-[var(--wc-dash-accent)]\": isActive || isCompleted";
  assert.equal(header.split(tealMark).length - 1, 2);
  assert.equal(header.split(tealLabel).length - 1, 2);
  assert.doesNotMatch(header, /": isCompleted,/);
  assert.doesNotMatch(header, /": isActive,/);
  assert.match(header, /isCompleted \? <span className="text-lg font-semibold">✓<\/span>/);
  assert.equal(header.split("✓").length - 1, 2);
  assert.match(stepper, /data-wc-title="">\s*\{t\("workout_builder\.title"\)\}/);
  assert.match(stepper, /data-wc-kicker="">\s*\{steps\.find\(\(step\) => step\.stepNumber === currentStep\)\?\.title\}/);
  assert.match(stepper, /currentStep === 1 \?/);
  assert.match(stepper, /data-wc-lead="">\s*\{t\("workout_builder\.selection\.select_equipment_description"\)\}/);
  assert.doesNotMatch(stepper, /hidden px-2/);
  assert.match(read("locales/en.ts"), /title:\s*"Build your workout"/);
  assert.match(read("locales/fr.ts"), /title:\s*"Construire votre entraînement"/);
  assert.match(read("locales/es.ts"), /title:\s*"Construir tu entrenamiento"/);
  assert.match(read("locales/pt.ts"), /title:\s*"Construir o seu treino"/);
  assert.match(read("locales/ru.ts"), /title:\s*"Составить свою тренировку"/);
  assert.match(read("locales/zh-CN.ts"), /title:\s*"构建您的锻炼"/);
  assert.doesNotMatch(css, /\[data-wc-lead\]/);
  assert.match(
    read("src/features/workout-builder/ui/workout-stepper-footer.tsx"),
    /hover:\[&:not\(:disabled\)\]:!bg-\[color-mix\(in_srgb,var\(--wc-dash-accent\)_78%,var\(--wc-dash-ink\)\)\]/,
  );
  assert.equal(read("src/features/workout-builder/ui/workout-stepper-footer.tsx").split("hover:!scale-100").length - 1, 3);
  assert.match(css, /\[data-wc-step-mark\]\[data-wc-step-state="active"\][\s\S]*background:\s*var\(--wc-dash-accent\)/);
  assert.match(css, /\[data-wc-step-mark\]\[data-wc-step-state="done"\][\s\S]*color:\s*var\(--wc-dash-ink\)/);
  assert.doesNotMatch(header, /text-blue-/);
  assert.doesNotMatch(header, /bg-blue-/);
  assert.doesNotMatch(header, /#[0-9a-fA-F]{3,8}/);
});

test("builder contrast pairs meet AA", () => {
  const header = read("src/features/workout-builder/ui/stepper-header.tsx");
  const footer = read("src/features/workout-builder/ui/workout-stepper-footer.tsx");
  const remove = read("src/features/workout-builder/ui/exercise-list-item.tsx");
  const { light, dark } = tokens();
  for (const name of DASH_NAMES) {
    assert.ok(light[name], name);
    assert.ok(dark[name], name);
  }

  const continueAt = footer.indexOf("workout_builder.navigation.continue");
  const continueClasses = footer.slice(Math.max(0, continueAt - 700), continueAt);
  const foreground = continueClasses.match(/!text-\[var\(--wc-dash-([a-z]+)\)\]/);
  const background = continueClasses.match(/!bg-\[var\(--wc-dash-([a-z]+)\)\]/);
  assert.ok(foreground);
  assert.ok(background);
  assert.ok(contrast(light[foreground[1]], light[background[1]]) >= 4.5);
  assert.ok(contrast(dark[foreground[1]], dark[background[1]]) >= 4.5);

  const inactiveTitle = "\"text-[var(--wc-dash-secondary)]\": !isActive && !isCompleted";
  const caption = "isActive || isCompleted ? \"text-[var(--wc-dash-text)]\" : \"text-[var(--wc-dash-secondary)]\"";
  assert.equal(header.split(inactiveTitle).length - 1, 2);
  assert.equal(header.split(caption).length - 1, 2);
  assert.match(header, /text-lg/);
  const muscles = read("src/features/workout-builder/ui/muscle-selection.tsx");
  assert.match(
    muscles,
    /className="text-lg text-\[var\(--wc-dash-secondary\)\]">\{t\("workout_builder\.selection\.muscle_selection_description"\)\}/
  );
  assert.match(read("locales/en.ts"), /muscle_selection_description: "Select the muscle\(s\) you want to train by clicking on them\."/);
  assert.ok(contrast(light.secondary, light.panel) >= 4.5);
  assert.ok(contrast(light.text, light.panel) >= 4.5);
  assert.ok(contrast(light.accent, light.panel) >= 4.5);
  assert.ok(contrast(dark.secondary, dark.card) >= 4.5);
  assert.ok(contrast(dark.accent, dark.card) >= 4.5);
  assert.ok(contrast(dark.ink, dark.accent) >= 4.5);
  assert.ok(contrast(light.secondary, light.inner) >= 3);
  assert.ok(contrast(dark.secondary, dark.inner) >= 3);
  const embed = read("src/features/embed/embed-theme.css");
  assert.match(embed, /\[data-wc-step-previous\]:disabled \{[^}]*color:\s*var\(--wc-dash-secondary\)/);
  assert.match(embed, /\[data-wc-step-next\]:not\(:disabled\):hover \{[^}]*color-mix\(in srgb, var\(--wc-dash-accent\)/);
  assert.match(embed, /\[data-wc-step-previous\]:not\(:disabled\):hover \{[^}]*var\(--wc-dash-card\)/);

  assert.match(remove, /text-\[var\(--wc-dash-error\)\]/);
  assert.match(read("src/features/workout-builder/ui/exercise-card.tsx"), /workout_builder\.exercise\.remove/);
  assert.match(footer, /disabled:!opacity-100 disabled:!border-\[var\(--wc-dash-border\)\] disabled:!bg-\[var\(--wc-dash-inner\)\]/);
  assert.match(footer, /disabled:!bg-\[color-mix\(in_srgb,var\(--wc-dash-accent\)_16%,var\(--wc-dash-panel\)\)\]/);
  assert.match(footer, /dark:disabled:!bg-\[color-mix\(in_srgb,var\(--wc-dash-accent\)_22%,var\(--wc-dash-page\)\)\]/);
  assert.doesNotMatch(footer, /disabled:opacity-30/);
  assert.equal(footer.split("!bg-[var(--wc-dash-accent)] !text-lg").length - 1, 2);
  assert.equal(footer.split("!text-[var(--wc-dash-ink)]").length - 1, 2);
  assert.ok(contrast(light.error, light.panel) >= 4.5);
  assert.ok(contrast(dark.error, dark.card) >= 4.5);
});

test("builder handlers and conditionals stay in place", () => {
  const header = read("src/features/workout-builder/ui/stepper-header.tsx");
  const footer = read("src/features/workout-builder/ui/workout-stepper-footer.tsx");
  const stepper = read("src/features/workout-builder/ui/workout-stepper.tsx");
  const card = read("src/features/workout-builder/ui/exercise-card.tsx");
  const listItem = read("src/features/workout-builder/ui/exercise-list-item.tsx");

  assert.match(header, /const canClick = stepNumber < currentStep \|\| isCompleted;/);
  assert.match(header, /isCompleted \? "done" : isActive \? "active" : "todo"/);
  assert.match(header, /canClick \? "cursor-pointer" : "cursor-default"/);
  assert.match(footer, /const isFirstStep = currentStep === 1;/);
  assert.match(footer, /const isFinalStep = currentStep === totalSteps;/);
  assert.match(footer, /isFinalStep && onStartWorkout \?/);
  assert.match(footer, /onClick=\{onPrevious\}/);
  assert.match(footer, /onClick=\{onNext\}/);
  assert.match(footer, /onRewardGranted=\{onStartWorkout\}/);
  assert.match(stepper, /onNext=\{nextStep\}/);
  assert.match(stepper, /onPrevious=\{prevStep\}/);
  assert.match(stepper, /onStartWorkout=\{handleStartWorkout\}/);
  assert.match(stepper, /onStepClick=\{handleStepClick\}/);
  assert.match(stepper, /workout_builder\.steps\.equipment\.title/);
  assert.match(stepper, /workout_builder\.steps\.muscles\.title/);
  assert.match(stepper, /workout_builder\.steps\.exercises\.title/);
  assert.match(card, /onClick=\{\(\) => onDelete\(exercise\.id, muscle\)\}/);
  assert.match(listItem, /onDelete\(exercise\.id, muscle\)/);
  assert.match(listItem, /onClick=\{handleShuffle\}/);
  assert.match(listItem, /setModalTab\("statistics"\)/);
  assert.match(listItem, /disabled=\{isShuffling\}/);
  assert.match(footer, /data-wc-step-previous=""\n\s+disabled=\{isFirstStep\}\n\s+onClick=\{onPrevious\}/);
  assert.match(footer, /disabled=\{!canContinue\}\n\s+onClick=\{onNext\}/);
  assert.equal(footer.split("disabled={!canContinue}").length - 1, 2);
  assert.equal(card.split("h-12 w-12 min-h-12 min-w-12").length - 1, 2);
  assert.match(listItem, /!min-h-12 !border-\[var\(--wc-dash-border\)\] !text-lg !text-\[var\(--wc-dash-text\)\] hover:!scale-100/);
  assert.match(listItem, /className="inline-flex min-h-12 min-w-12 items-center justify-center/);
});

test("equipment count bar, exercise labels, and shuffle text stay 18px", () => {
  const equipment = read("src/features/workout-builder/ui/equipment-selection.tsx");
  const exercises = read("src/features/workout-builder/ui/exercises-selection.tsx");
  const listItem = read("src/features/workout-builder/ui/exercise-list-item.tsx");
  const card = read("src/features/workout-builder/ui/exercise-card.tsx");
  assert.match(equipment, /data-wc-equipment-bar/);
  assert.ok(equipment.indexOf("data-wc-equipment-bar") < equipment.indexOf("grid auto-rows-fr grid-cols-2"));
  assert.match(equipment, /grid auto-rows-fr grid-cols-2/);
  assert.match(equipment, /aria-describedby=\{descriptionId\}/);
  assert.match(equipment, /<span className="sr-only" id=\{descriptionId\}>\s*\{translation\.description\}/);
  assert.doesNotMatch(equipment, /✓/);
  assert.match(equipment, /<Check className="h-3\.5 w-3\.5" strokeWidth=\{3\} \/>/);
  assert.match(
    equipment,
    new RegExp(
      "absolute right-2 top-2 inline-flex h-6 w-6 min-h-6 min-w-6 items-center justify-center rounded-full",
    ),
  );
  assert.match(equipment, /bg-\[var\(--wc-dash-accent\)\] text-\[var\(--wc-dash-ink\)\]/);
  assert.match(equipment, /aria-pressed=\{isSelected\}/);
  assert.match(equipment, /type="button"/);
  assert.match(
    equipment,
    /border-\[var\(--wc-dash-accent\)\] bg-\[color-mix\(in_srgb,var\(--wc-dash-accent\)_35%,var\(--wc-dash-card\)\)\]/,
  );
  assert.match(equipment, /focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-\[var\(--wc-dash-text\)\]/);
  assert.match(equipment, /onTap\(\);\n\s+onToggle\(\);/);
  assert.doesNotMatch(equipment, /w-2 h-2 rounded-full/);
  assert.match(equipment, /workout_builder\.stats\.equipment_selected/);
  assert.match(equipment, /workout_builder\.selection\.clear_all/);
  assert.match(equipment, /onClick=\{onClearEquipment\}/);
  assert.match(equipment, /min-h-12 items-center rounded-lg px-3 text-lg/);
  assert.doesNotMatch(equipment, /choose_your_arsenal/);
  assert.doesNotMatch(equipment, /select_equipment_description/);
  assert.match(listItem, /flex flex-wrap items-center/);
  assert.match(listItem, /break-words text-lg font-semibold/);
  assert.match(listItem, /break-words text-lg font-medium/);
  assert.doesNotMatch(listItem, /text-xs sm:text-sm/);
  assert.doesNotMatch(listItem, /truncate/);
  assert.doesNotMatch(listItem, /hidden sm:inline/);
  assert.match(listItem, /workout_builder\.exercise\.shuffle/);
  assert.match(listItem, /workout_builder\.exercise\.watch_video/);
  assert.match(listItem, /workout_builder\.exercise\.remove/);
  assert.match(listItem, /text-lg text-\[var\(--wc-dash-error\)\]/);
  assert.match(card, /className="min-h-12 text-lg" onClick=\{\(\) => onShuffle\(exercise\.id, muscle\)\}/);
  assert.match(listItem, /data-wc-exercise-name=""/);
  assert.match(listItem, /min-w-\[120px\] flex-1/);
  assert.match(listItem, /flex w-full min-w-0 flex-wrap items-center gap-2/);
  assert.match(listItem, /h-12 w-12 min-h-12 min-w-12 shrink-0 cursor-grab/);
  assert.match(listItem, /\{\.\.\.attributes\}/);
  assert.match(listItem, /\{\.\.\.listeners\}/);
  assert.match(listItem, /touchAction: "none"/);
  assert.match(listItem, /h-12 w-12 min-h-12 min-w-12/);
  assert.match(listItem, /text-lg font-bold text-\[var\(--wc-dash-text\)\]/);
  assert.match(listItem, /aria-label=\{t\("statistics\.title"\)\}/);
  assert.match(exercises, /<Plus className="h-5 w-5" \/>/);
  assert.match(exercises, /<span>\{t\("workout_builder\.addExercise"\)\}<\/span>/);
  assert.doesNotMatch(exercises, /\+ \{t\("workout_builder\.addExercise"\)\}/);
  assert.match(exercises, /min-h-12 w-full/);
  assert.match(exercises, /bg-\[var\(--wc-dash-accent\)\]/);
  assert.match(equipment, /disabled=\{selectedEquipment\.length === 0\}/);
  assert.match(equipment, /disabled:text-\[var\(--wc-dash-secondary\)\]/);
  assert.doesNotMatch(equipment, /aria-disabled/);
  assert.doesNotMatch(equipment, /selectedEquipment\.length > 0 &&/);
  assert.match(card, /workout_builder\.exercise\.type/);
  assert.doesNotMatch(card, /<strong>Type:<\/strong>/);
  assert.match(read("src/features/embed/embed-theme.css"), /\[data-wc-step-actions\] > :has\(\[data-wc-step-next\]\)/);
  assert.match(read("locales/en.ts"), /type: "Type:"/);
  assert.match(read("locales/fr.ts"), /type: "Type :"/);
  assert.match(read("locales/es.ts"), /type: "Tipo:"/);
  assert.match(read("locales/pt.ts"), /type: "Tipo:"/);
  assert.match(read("locales/ru.ts"), /type: "Тип:"/);
  assert.match(read("locales/zh-CN.ts"), /type: "类型："/);
  assert.match(card, /break-words text-lg font-semibold leading-tight/);
  assert.doesNotMatch(card, /line-clamp-2/);
  assert.doesNotMatch(card, /text-sm leading-tight line-clamp-2/);
});
