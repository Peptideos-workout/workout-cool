import { test } from "node:test";
import assert from "node:assert/strict";

import { logoutThenClearSession } from "./logout-then-clear-session";

test("runs sign-out before invalidating or clearing the session query", async () => {
  const order: string[] = [];

  await logoutThenClearSession(
    async () => {
      order.push("signOut");
    },
    () => {
      order.push("clearSession");
    }
  );

  assert.deepEqual(order, ["signOut", "clearSession"]);
});

test("does not clear the session query if sign-out throws", async () => {
  const order: string[] = [];

  await assert.rejects(
    () =>
      logoutThenClearSession(
        async () => {
          order.push("signOut");
          throw new Error("sign-out failed");
        },
        () => {
          order.push("clearSession");
        }
      ),
    /sign-out failed/
  );

  assert.deepEqual(order, ["signOut"]);
});
