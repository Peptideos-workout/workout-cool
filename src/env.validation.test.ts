import { test } from "node:test";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const placeholderEnv: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/workout-cool",
  BETTER_AUTH_URL: "https://workouts.example.test",
  NEXT_PUBLIC_APP_URL: "https://workouts.example.test",
  BETTER_AUTH_SECRET: "test-better-auth-secret",
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret"
};

function importEnv(overrides: Record<string, string | undefined>) {
  const env: NodeJS.ProcessEnv = { ...placeholderEnv, ...overrides };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key];
  }

  return spawnSync(process.execPath, ["--import", "tsx", "-e", "void import('./src/env.ts')"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env
  });
}

test("createEnv names a missing required Production var", () => {
  const result = importEnv({ DATABASE_URL: undefined });

  assert.notEqual(result.status, 0);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /Invalid environment variables:/);
  assert.match(output, /DATABASE_URL:/);
});

test("createEnv names an invalid optional enum var", () => {
  const result = importEnv({
    SMTP_SECURE: "yes",
    NEXT_PUBLIC_SHOW_ADS: "1",
    NEXT_PUBLIC_ENABLE_GATEKEEPER_CONSENT: "TRUE",
    NEXT_PUBLIC_AD_PROVIDER: "AdSense"
  });

  assert.notEqual(result.status, 0);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /SMTP_SECURE:/);
  assert.match(output, /NEXT_PUBLIC_SHOW_ADS:/);
  assert.match(output, /NEXT_PUBLIC_ENABLE_GATEKEEPER_CONSENT:/);
  assert.match(output, /NEXT_PUBLIC_AD_PROVIDER:/);
  assert.match(output, /true/);
  assert.match(output, /adsense/);
});

test("createEnv accepts documented enum literals", () => {
  const result = importEnv({
    SMTP_SECURE: "false",
    NEXT_PUBLIC_SHOW_ADS: "true",
    NEXT_PUBLIC_ENABLE_GATEKEEPER_CONSENT: "false",
    NEXT_PUBLIC_AD_PROVIDER: "ezoic"
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("RevenueCat API client can load at build time without REVENUECAT_SECRET_KEY", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "-e", "void import('./src/shared/lib/revenuecat/revenuecat.api.ts')"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...placeholderEnv }
    }
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("Stripe provider can load at build time without STRIPE_SECRET_KEY", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "-e", "void import('./src/shared/lib/premium/premium.manager.ts')"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...placeholderEnv }
    }
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
