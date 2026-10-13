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

  assert.match(header, /"border-\[var\(--wc-dash-accent\)\] bg-\[var\(--wc-dash-accent\)\] text-\[var\(--wc-dash-ink\)\]": isActive/);
  assert.match(header, /"border-\[var\(--wc-dash-accent\)\] bg-\[var\(--wc-dash-accent\)\] text-\[var\(--wc-dash-ink\)\]": isCompleted/);
  assert.match(header, /"text-\[var\(--wc-dash-accent\)\]": isActive/);
  assert.match(header, /"text-\[var\(--wc-dash-accent\)\]": isCompleted/);
  assert.match(header, /isCompleted \? <span className="text-lg font-semibold">✓<\/span>/);
  assert.equal(header.split("✓").length - 1, 2);
  assert.match(stepper, /data-wc-title="">Build your workout</);
  assert.match(css, /\[data-wc-step-mark\]\[data-wc-step-state="active"\][\s\S]*background:\s*var\(--wc-dash-accent\)/);
  assert.match(css, /\[data-wc-step-mark\]\[data-wc-step-state="done"\][\s\S]*color:\s*var\(--wc-dash-ink\)/);
  assert.doesNotMatch(header, /text-blue-/);
  assert.doesNotMatch(header, /bg-blue-/);
  assert.doesNotMatch(header, /#[0-9a-fA-F]{3,8}/);
});

test("builder contrast pairs meet AA", () => {
  const header = read("src/features/workout-builder/ui/stepper-header.tsx");
  const footer = read("src/features/workout-builder/ui/workout-stepper-footer.tsx");
  const quit = read("src/features/workout-session/ui/workout-session-header.tsx");
  const remove = read("src/features/workout-builder/ui/exercise-list-item.tsx");
  const { light, dark } = tokens();
  for (const name of DASH_NAMES) {
    assert.ok(light[name], name);
    assert.ok(dark[name], name);
  }

  const continueAt = footer.indexOf("workout_builder.navigation.continue");
  const continueClasses = footer.slice(Math.max(0, continueAt - 500), continueAt);
  const foreground = continueClasses.match(/!text-\[var\(--wc-dash-([a-z]+)\)\]/);
  const background = continueClasses.match(/!bg-\[var\(--wc-dash-([a-z]+)\)\]/);
  assert.ok(foreground);
  assert.ok(background);
  assert.ok(contrast(light[foreground[1]], light[background[1]]) >= 4.5);
  assert.ok(contrast(dark[foreground[1]], dark[background[1]]) >= 4.5);

  const inactiveTitle = '"text-[var(--wc-dash-secondary)]": !isActive && !isCompleted';
  const caption = 'isActive || isCompleted ? "text-[var(--wc-dash-text)]" : "text-[var(--wc-dash-secondary)]"';
  assert.equal(header.split(inactiveTitle).length - 1, 2);
  assert.equal(header.split(caption).length - 1, 2);
  assert.match(header, /text-lg/);
  assert.ok(contrast(light.secondary, light.panel) >= 4.5);
  assert.ok(contrast(light.text, light.panel) >= 4.5);
  assert.ok(contrast(light.accent, light.panel) >= 4.5);
  assert.ok(contrast(dark.secondary, dark.card) >= 4.5);
  assert.ok(contrast(dark.accent, dark.card) >= 4.5);
  assert.ok(contrast(dark.ink, dark.accent) >= 4.5);

  assert.match(quit, /!text-\[var\(--wc-dash-error\)\]/);
  assert.match(remove, /text-\[var\(--wc-dash-error\)\]/);
  assert.match(read("src/features/workout-builder/ui/exercise-card.tsx"), /workout_builder\.exercise\.remove/);
  assert.match(read("src/features/workout-builder/ui/quit-workout-dialog.tsx"), /!text-\[var\(--wc-dash-error\)\]/);
  assert.ok(contrast(light.error, light.panel) >= 4.5);
  assert.ok(contrast(dark.error, dark.card) >= 4.5);
});

test("builder handlers and conditionals stay byte-identical", () => {
  const header = read("src/features/workout-builder/ui/stepper-header.tsx");
  const footer = read("src/features/workout-builder/ui/workout-stepper-footer.tsx");
  const stepper = read("src/features/workout-builder/ui/workout-stepper.tsx");

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
});
