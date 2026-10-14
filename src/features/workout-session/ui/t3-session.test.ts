import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

function read(path: string) {
  return readFileSync(path, "utf8");
}

const HEADER = "src/features/workout-session/ui/workout-session-header.tsx";
const TIMER = "src/features/workout-session/ui/workout-session-timer.tsx";
const SETS = "src/features/workout-session/ui/workout-session-sets.tsx";
const SET = "src/features/workout-session/ui/workout-session-set.tsx";
const QUIT = "src/features/workout-builder/ui/quit-workout-dialog.tsx";
const FILES = [HEADER, TIMER, SETS, SET, QUIT];

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

test("session screens use dash tokens and no raw hex", () => {
  const { light, dark } = tokens();
  for (const name of DASH_NAMES) {
    assert.ok(light[name], name);
    assert.ok(dark[name], name);
  }
  for (const path of FILES) {
    const source = read(path);
    assert.match(source, /--wc-dash-/);
    assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}/);
    assert.doesNotMatch(source, /text-slate-|bg-slate-|text-red-|bg-red-|text-green-|bg-green-|text-blue-|bg-blue-/);
  }
});

test("finished steps and finish actions are teal with a check", () => {
  const sets = read(SETS);
  const row = read(SET);
  assert.match(
    sets,
    /aria-label="Exercice terminé" className="text-lg font-semibold text-\[var\(--wc-dash-ink\)\]" role="img">\s*✓\s*<\/span>/,
  );
  assert.match(sets, /border-\[var\(--wc-dash-accent\)\] bg-\[var\(--wc-dash-accent\)\] text-\[var\(--wc-dash-ink\)\]/);
  assert.equal(sets.split("border-[var(--wc-dash-accent)] bg-[var(--wc-dash-accent)] text-[var(--wc-dash-ink)]").length - 1, 2);
  assert.match(sets, /<span aria-hidden="true">✓<\/span>\n\s+\{t\("workout_builder\.session\.finish_session"\)\}/);
  assert.match(row, /!bg-\[var\(--wc-dash-accent\)\] !text-lg font-bold !text-\[var\(--wc-dash-ink\)\]/);
  assert.match(row, /<span aria-hidden="true">✓<\/span>\n\s+\{t\("workout_builder\.session\.finish_set"\)\}/);
  assert.match(row, /\{set\.completed \? "✓" : ""\} SET \{setIndex \+ 1\}/);
  assert.match(row, /set\.completed\n\s+\? "bg-\[var\(--wc-dash-accent\)\] text-\[var\(--wc-dash-ink\)\]"/);
});

test("watch video, quit, and remove stay labeled at 18px and 48px", () => {
  const sets = read(SETS);
  const header = read(HEADER);
  const row = read(SET);
  const quit = read(QUIT);
  assert.match(sets, /\{t\("workout_builder\.exercise\.watch_video"\)\}/);
  assert.match(sets, /!min-h-12 !border !border-\[var\(--wc-dash-border\)\] !bg-\[var\(--wc-dash-panel\)\]/);
  assert.match(sets, /!text-lg !text-\[var\(--wc-dash-text\)\]/);
  const quitClass =
    'className="border-0 bg-transparent px-3 !text-lg !text-[var(--wc-dash-error)] shadow-none hover:bg-transparent !min-h-12"';
  assert.match(header, new RegExp(quitClass.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const dialogQuit =
    'className="w-full border-0 bg-transparent !text-lg !text-[var(--wc-dash-error)] shadow-none hover:bg-transparent !min-h-12"';
  assert.match(quit, new RegExp(dialogQuit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(row, /aria-label="Supprimer la série"[\s\S]*className=\{`\$\{plainErrorButton\} !min-h-12 !min-w-12 px-3`\}/);
  assert.match(row, /<Trash2 className="h-5 w-5" \/>/);
  assert.match(row, /!text-\[var\(--wc-dash-error\)\] shadow-none hover:bg-transparent/);
  assert.doesNotMatch(row, /\{t\("workout_builder\.exercise\.remove"\)\}/);
  assert.match(row, /<Minus className="h-5 w-5" \/>/);
  assert.match(header, /min-h-12 min-w-12 rounded px-3 text-lg/);
  assert.match(row, /min-h-14 rounded border border-\[var\(--wc-dash-border\)\] bg-\[var\(--wc-dash-inner\)\]/);
  assert.match(row, /text-lg font-bold text-\[var\(--wc-dash-text\)\]/);
});

test("session contrast pairs meet AA", () => {
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

test("session handlers, disabled expressions, conditionals, and copy stay byte-identical", () => {
  const header = read(HEADER);
  const timer = read(TIMER);
  const sets = read(SETS);
  const row = read(SET);
  const quit = read(QUIT);

  assert.match(header, /onClick=\{handleQuitClick\}/);
  assert.match(header, /onClick=\{\(\) => handleVolumeUnitChange\("kg"\)\}/);
  assert.match(header, /onClick=\{\(\) => handleVolumeUnitChange\("lbs"\)\}/);
  assert.match(header, /onClose=\{\(\) => setShowQuitDialog\(false\)\}/);
  assert.match(header, /onQuitWithoutSave=\{handleQuitWithoutSave\}/);
  assert.match(header, /volumeUnit === "kg"/);
  assert.match(header, /volumeUnit === "lbs"/);
  assert.match(header, /volumeUnit === "lbs" \? 1 : 0/);
  assert.match(header, /t\("workout_builder\.session\.started_at"\)/);
  assert.match(header, /t\("workout_builder\.session\.quit_workout"\)/);
  assert.match(header, /t\("workout_builder\.session\.exercise_progress"\)/);
  assert.match(header, /t\("workout_builder\.session\.total_volume"\)/);
  assert.match(header, /t\("workout_builder\.session\.complete"\)/);

  assert.match(quit, /onClick=\{onQuitWithoutSave\}/);
  assert.match(quit, /onClick=\{onClose\}/);
  assert.match(quit, /onOpenChange=\{onClose\}/);
  assert.match(quit, /t\("workout_builder\.session\.quit_workout_title"\)/);
  assert.match(quit, /t\("workout_builder\.session\.progress"\)/);
  assert.match(quit, /t\("workout_builder\.session\.quit_warning"\)/);
  assert.match(quit, /t\("workout_builder\.session\.quit_without_save"\)/);
  assert.match(quit, /t\("workout_builder\.session\.continue_workout"\)/);

  assert.match(timer, /<Timer initialSeconds=\{0\} isRunning=\{isTimerRunning\} key=\{resetCount\} \/>/);
  assert.match(
    timer,
    /relative mx-auto mb-3 w-fit max-w-\[calc\(100vw-16px\)\] max-sm:sticky max-sm:bottom-\[182px\] sm:fixed sm:bottom-20 sm:left-1\/2 sm:z-50 sm:-translate-x-1\/2/,
  );
  assert.match(timer, /rounded-full border border-\[var\(--wc-dash-border\)\] bg-\[var\(--wc-dash-card\)\] px-4 py-2 shadow-lg/);
  assert.match(timer, /!h-12 !w-12 !min-h-12 !min-w-12/);
  assert.match(sets, /px-3 pb-20 sm:px-6 sm:pb-8 \[html\[data-wc-embed='1'\]_&\]:pb-8/);
  assert.match(header, /style=\{\{ width: `\$\{\(exercisesCompleted \/ totalExercises\) \* 100\}%` \}\}/);
  assert.match(quit, /style=\{\{ width: `\$\{\(exercisesCompleted \/ totalExercises\) \* 100\}%` \}\}/);
  assert.match(timer, /onClick=\{toggleTimer\}/);
  assert.match(timer, /onClick=\{handleReset\}/);
  assert.match(timer, /isTimerRunning \? <Pause className="h-5 w-5" \/> : <Play className="h-5 w-5" \/>/);
  assert.match(timer, /isTimerRunning\s*\?\s*"!bg-\[var\(--wc-dash-inner\)\] !text-\[var\(--wc-dash-text\)\]"/);

  assert.match(sets, /onClick=\{\(\) => router\.push\("\/profile"\)\}/);
  assert.match(sets, /onClick=\{\(\) => handleExerciseClick\(idx\)\}/);
  assert.equal(sets.split("setVideoModal({ open: true, exerciseId: ex.id })").length - 1, 2);
  assert.match(sets, /onOpenChange=\{\(open\) => setVideoModal\(\{ open, exerciseId: open \? ex\.id : undefined \}\)\}/);
  assert.match(sets, /onClick=\{handleAddSet\}/);
  assert.match(sets, /onClick=\{handleNextExercise\}/);
  assert.match(sets, /onClick=\{handleFinishSession\}/);
  assert.match(sets, /if \(showCongrats\)/);
  assert.match(sets, /if \(!session\)/);
  assert.match(sets, /if \(allSetsCompleted\)/);
  assert.match(sets, /if \(idx === currentExerciseIndex\)/);
  assert.match(sets, /idx !== currentExerciseIndex \? "cursor-pointer hover:opacity-80" : ""/);
  assert.match(sets, /\{isWorkoutActive && \(/);
  assert.match(sets, /t\("workout_builder\.session\.see_instructions"\)/);
  assert.match(sets, /t\("workout_builder\.session\.add_set"\)/);
  assert.match(sets, /t\("workout_builder\.session\.next_exercise"\)/);
  assert.match(sets, /t\("commons\.go_to_profile"\)/);

  assert.match(row, /onClick=\{onRemove\}/);
  assert.match(row, /onClick=\{\(\) => removeColumn\(columnIndex\)\}/);
  assert.match(row, /onClick=\{addColumn\}/);
  assert.match(row, /onClick=\{onFinish\}/);
  assert.match(row, /onClick=\{handleEdit\}/);
  assert.equal(row.split("disabled={set.completed}").length - 1, 10);
  assert.match(row, /types\.length > 1 && \(/);
  assert.match(row, /types\.length < MAX_WORKOUT_SET_COLUMNS && !set\.completed && \(/);
  assert.match(row, /\{set\.completed && \(/);
  assert.match(row, /t\("workout_builder\.session\.add_row"\)/);
  assert.match(row, /t\("workout_builder\.session\.add_column"\)/);
  assert.match(row, /t\("commons\.edit"\)/);
});
