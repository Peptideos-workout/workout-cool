import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_WORKOUT_COOL_ORIGIN, workoutCoolPublicOrigin } from "./workout-cool-public-origin";

test("public origin defaults to workouts.peptideos.us", () => {
  assert.equal(DEFAULT_WORKOUT_COOL_ORIGIN, "https://workouts.peptideos.us");
  assert.equal(workoutCoolPublicOrigin(undefined), DEFAULT_WORKOUT_COOL_ORIGIN);
  assert.equal(workoutCoolPublicOrigin("  "), DEFAULT_WORKOUT_COOL_ORIGIN);
});

test("public origin uses the configured app URL origin", () => {
  assert.equal(workoutCoolPublicOrigin("https://workouts.peptideos.us/app"), "https://workouts.peptideos.us");
  assert.equal(workoutCoolPublicOrigin("https://staging.workouts.example.test"), "https://staging.workouts.example.test");
});
