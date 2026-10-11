import { test } from "node:test";
import assert from "node:assert/strict";

import { isEmailInfraConfigured, sendAccountsLinkedEmail } from "./link-email";

test("treats SMTP as unconfigured when host or from is missing", () => {
  assert.equal(isEmailInfraConfigured({ SMTP_HOST: undefined, SMTP_FROM: undefined }), false);
  assert.equal(isEmailInfraConfigured({ SMTP_HOST: "smtp.example", SMTP_FROM: undefined }), false);
  assert.equal(isEmailInfraConfigured({ SMTP_HOST: "smtp.example", SMTP_FROM: "hi@example.com" }), true);
});

test("skips sending when email infra is not configured", async () => {
  const sent: unknown[] = [];
  const result = await sendAccountsLinkedEmail({
    to: "jane@example.com",
    isConfigured: false,
    send: async (payload) => {
      sent.push(payload);
    }
  });

  assert.equal(result, "skipped");
  assert.deepEqual(sent, []);
});

test("sends a linked-accounts notice when email infra is configured", async () => {
  const sent: Array<{ to: string; subject: string }> = [];
  const result = await sendAccountsLinkedEmail({
    to: "jane@example.com",
    isConfigured: true,
    send: async (payload) => {
      sent.push({ to: payload.to, subject: payload.subject });
    }
  });

  assert.equal(result, "sent");
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.to, "jane@example.com");
  assert.match(sent[0]?.subject ?? "", /linked/i);
});
