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
    /aria-label=\{t\("workout_builder\.session\.exercise_complete"\)\} className="text-lg font-semibold text-\[var\(--wc-dash-ink\)\]" role="img">\s*✓\s*<\/span>/,
  );
  assert.match(sets, /border-\[var\(--wc-dash-accent\)\] bg-\[var\(--wc-dash-accent\)\] text-\[var\(--wc-dash-ink\)\]/);
  assert.equal(sets.split("border-[var(--wc-dash-accent)] bg-[var(--wc-dash-accent)] text-[var(--wc-dash-ink)]").length - 1, 2);
  assert.doesNotMatch(sets, /<span aria-hidden="true">✓<\/span>\n\s+\{t\("workout_builder\.session\.finish_session"\)\}/);
  assert.match(sets, /<TrophyIcon className="h-6 w-6" \/>\n\s+\{t\("workout_builder\.session\.finish_session"\)\}/);
  assert.match(row, /!bg-\[var\(--wc-dash-accent\)\] !text-lg font-bold !text-\[var\(--wc-dash-ink\)\]/);
  assert.match(row, /<span aria-hidden="true">✓<\/span>\n\s+\{t\("workout_builder\.session\.finish_set"\)\}/);
  assert.match(row, /t\("workout_builder\.session\.set_number", \{ number: setIndex \+ 1 \}\)/);
  assert.doesNotMatch(row, /SET \{setIndex \+ 1\}/);
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
    "className=\"max-w-full border-0 bg-transparent px-3 !text-lg !whitespace-normal !text-[var(--wc-dash-error)] shadow-none hover:bg-transparent !min-h-12\"";
  assert.match(header, new RegExp(quitClass.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const dialogQuit =
    "className=\"w-full border-0 bg-transparent !text-lg !text-[var(--wc-dash-error)] shadow-none hover:bg-transparent !min-h-12\"";
  assert.match(quit, new RegExp(dialogQuit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(
    row,
    /aria-label=\{t\("workout_builder\.session\.delete_set"\)\}[\s\S]*className=\{`\$\{plainErrorButton\} !min-h-12 !min-w-12 px-3`\}/,
  );
  assert.doesNotMatch(row, /aria-label="[^"]+"/);
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

test("session handlers, disabled expressions, conditionals, and copy stay locked with regex matches", () => {
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
    new RegExp(
      "relative mx-auto mb-3 w-fit max-w-\\[calc\\(100vw-16px\\)\\] max-sm:fixed " +
        "max-sm:bottom-\\[calc\\(var\\(--wc-nav-h\\)\\+env\\(safe-area-inset-bottom\\)\\+96px\\)\\] " +
        "max-sm:left-1\\/2 max-sm:-translate-x-1\\/2 max-sm:z-50 max-sm:mb-0 " +
        "sm:fixed sm:right-6 sm:bottom-\\[320px\\] sm:left-auto sm:translate-x-0 sm:z-50 sm:mb-0",
    ),
  );
  assert.doesNotMatch(timer, /sm:bottom-28/);
  assert.doesNotMatch(timer, /\+33px/);
  assert.doesNotMatch(read(SETS), /Exercice terminé/);
  assert.doesNotMatch(read(SETS), /Exercice en cours/);
  assert.match(read("locales/en.ts"), /exercise_complete: "Exercise complete"/);
  assert.match(read("locales/en.ts"), /exercise_in_progress: "Exercise in progress"/);
  assert.match(read("locales/fr.ts"), /exercise_complete: "Exercice terminé"/);
  assert.match(read("locales/fr.ts"), /exercise_in_progress: "Exercice en cours"/);
  assert.match(read("locales/es.ts"), /exercise_complete: "Ejercicio completo"/);
  assert.match(read("locales/es.ts"), /exercise_in_progress: "Ejercicio en progreso"/);
  assert.match(read("locales/pt.ts"), /exercise_complete: "Exercício completo"/);
  assert.match(read("locales/pt.ts"), /exercise_in_progress: "Exercício em progresso"/);
  assert.match(read("locales/ru.ts"), /exercise_complete: "Упражнение завершено"/);
  assert.match(read("locales/ru.ts"), /exercise_in_progress: "Упражнение в процессе"/);
  assert.match(read("locales/zh-CN.ts"), /exercise_complete: "练习已完成"/);
  assert.match(read("locales/zh-CN.ts"), /exercise_in_progress: "练习进行中"/);
  assert.match(read("locales/en.ts"), /workout_in_progress: "Workout in Progress"/);
  assert.match(read("locales/fr.ts"), /workout_in_progress: "Entraînement en cours"/);
  assert.match(read("locales/es.ts"), /workout_in_progress: "Entrenamiento en progreso"/);
  assert.match(read("locales/pt.ts"), /workout_in_progress: "Treino em curso"/);
  assert.match(read("locales/ru.ts"), /workout_in_progress: "Тренировка в процессе"/);
  assert.match(read("locales/zh-CN.ts"), /workout_in_progress: "锻炼进行中"/);
  assert.match(read("locales/en.ts"), /set_number: "Set \{number\}"/);
  assert.match(read("locales/fr.ts"), /set_number: "Série \{number\}"/);
  assert.match(read("locales/es.ts"), /set_number: "Serie \{number\}"/);
  assert.match(read("locales/pt.ts"), /set_number: "Série \{number\}"/);
  assert.match(read("locales/ru.ts"), /set_number: "Подход \{number\}"/);
  assert.match(read("locales/zh-CN.ts"), /set_number: "第 \{number\} 组"/);
  assert.match(read("locales/en.ts"), /delete_set: "Delete set"/);
  assert.match(read("locales/fr.ts"), /delete_set: "Supprimer la série"/);
  assert.match(read("locales/es.ts"), /delete_set: "Eliminar serie"/);
  assert.match(read("locales/pt.ts"), /delete_set: "Eliminar série"/);
  assert.match(read("locales/ru.ts"), /delete_set: "Удалить подход"/);
  assert.match(read("locales/zh-CN.ts"), /delete_set: "删除组"/);
  assert.match(read("locales/en.ts"), /seconds_short: "sec"/);
  assert.match(read("locales/fr.ts"), /seconds_short: "sec"/);
  assert.match(read("locales/es.ts"), /seconds_short: "seg"/);
  assert.match(read("locales/pt.ts"), /seconds_short: "seg"/);
  assert.match(read("locales/ru.ts"), /seconds_short: "сек"/);
  assert.match(read("locales/zh-CN.ts"), /seconds_short: "秒"/);
  assert.match(read("locales/en.ts"), /exercise_image: "Exercise image"/);
  assert.match(read("locales/fr.ts"), /exercise_image: "Image de l'exercice"/);
  assert.match(read("locales/es.ts"), /exercise_image: "Imagen del ejercicio"/);
  assert.match(read("locales/pt.ts"), /exercise_image: "Imagem do exercício"/);
  assert.match(read("locales/ru.ts"), /exercise_image: "Изображение упражнения"/);
  assert.match(read("locales/zh-CN.ts"), /exercise_image: "练习图片"/);
  assert.match(read("locales/en.ts"), /trophy: "trophy"/);
  assert.match(read("locales/fr.ts"), /trophy: "trophée"/);
  assert.match(read("locales/es.ts"), /trophy: "trofeo"/);
  assert.match(read("locales/pt.ts"), /trophy: "troféu"/);
  assert.match(read("locales/ru.ts"), /trophy: "трофей"/);
  assert.match(read("locales/zh-CN.ts"), /trophy: "奖杯"/);
  assert.match(timer, /rounded-full border border-\[var\(--wc-dash-border\)\] bg-\[var\(--wc-dash-card\)\] px-4 py-2 shadow-lg/);
  assert.match(timer, /!h-12 !w-12 !min-h-12 !min-w-12/);
  assert.match(sets, /px-3 max-sm:pb-\[calc\(var\(--wc-nav-h\)\+168px\)\] sm:px-6 sm:pb-40/);
  assert.doesNotMatch(sets, /\[html\[data-wc-embed='1'\]_&\]:pb-8/);
  assert.match(header, /<h2 className="mb-3 text-2xl font-bold text-\[var\(--wc-dash-text\)\]">\{t\("workout_builder\.session\.workout_in_progress"\)\}<\/h2>/);
  assert.match(sets, /\{t\("workout_builder\.session\.next_exercise"\)\}\n\s+<ArrowRight className="h-5 w-5" \/>/);
  assert.doesNotMatch(sets, /<ArrowRight className="h-5 w-5" \/>\n\s+\{t\("workout_builder\.session\.next_exercise"\)\}/);
  assert.match(row, /\+ \{t\("workout_builder\.session\.add_row"\)\}/);
  assert.doesNotMatch(row, /add_column/);
  assert.doesNotMatch(row, /<Plus/);
  assert.match(header, /flex flex-col items-start gap-1 sm:flex-row sm:items-center/);
  assert.match(header, /min-w-0 break-words text-lg font-medium/);
  assert.match(sets, /min-w-0 flex-1 !whitespace-normal/);
  assert.match(sets, /details\?\.fullVideoUrl \? \([\s\S]*workout_builder\.exercise\.watch_video/);
  assert.match(read("src/features/workout-builder/ui/favorite-exercise-button.tsx"), /text-lg text-\[var\(--wc-dash-secondary\)\]/);
  assert.match(read("src/features/workout-builder/ui/favorite-exercise-button.tsx"), /!min-h-12 !border-\[var\(--wc-dash-border\)\] !bg-\[var\(--wc-dash-card\)\]/);
  assert.doesNotMatch(read("src/features/workout-builder/ui/favorite-exercise-button.tsx"), /text-sm text-slate-500/);
  assert.match(sets, /aria-label=\{t\("workout_builder\.session\.add_set"\)\}/);
  assert.match(sets, /aria-label=\{t\("workout_builder\.session\.next_exercise"\)\}/);
  assert.doesNotMatch(sets, /aria-label="Ajouter une série"/);
  assert.doesNotMatch(sets, /aria-label="Exercice suivant"/);
  assert.match(row, /mt-2 flex w-full flex-col gap-2 sm:flex-row/);
  assert.match(row, /!whitespace-normal/);
  assert.match(sets, /<FavoriteExerciseButton className="!h-auto !min-h-12 !min-w-12 !whitespace-normal" exerciseId=\{ex\.id\} \/>/);
  assert.match(quit, /\[&>button\]:!h-12 \[&>button\]:!w-12/);
  assert.match(read("src/features/workout-builder/ui/exercise-video-modal.tsx"), /\[&>button\]:min-h-12 \[&>button\]:min-w-12/);
  assert.match(sets, /t\("workout_builder\.session\.exercise_image"\)/);
  assert.match(sets, /t\("workout_builder\.session\.trophy"\)/);
  assert.doesNotMatch(sets, /Exercise image/);
  assert.doesNotMatch(sets, /" trophy"/);
  assert.doesNotMatch(header, /elapsed_time/);
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
  assert.match(row, /placeholder=\{t\("programs\.min_short"\)\}/);
  assert.match(row, /placeholder=\{t\("workout_builder\.session\.seconds_short"\)\}/);
  assert.match(row, /placeholder:text-\[var\(--wc-dash-secondary\)\]/);
  assert.match(row, /sm:min-w-60/);
  assert.doesNotMatch(row, /placeholder="min"/);
  assert.doesNotMatch(row, /placeholder="sec"/);
  assert.match(row, /t\("commons\.edit"\)/);
});
