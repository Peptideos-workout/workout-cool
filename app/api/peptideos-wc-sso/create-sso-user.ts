import { logSsoEmailCollision } from "./sso-error-log";

export type CreateSsoUserResult =
  | { ok: true; userId: string }
  | { ok: false; error: "sso_email_collision" | "sso_signup_failed"; status: number };

/**
 * Create a workout-cool user for a new PeptideOS email.
 * Never adopt an existing row after a failed/racy signup — that is the account-takeover path.
 */
export async function createSsoUserIfAbsent(deps: {
  findUserByEmail: () => Promise<{ id: string } | null>;
  signUp: () => Promise<{ userId: string } | null>;
}): Promise<CreateSsoUserResult> {
  const prior = await deps.findUserByEmail();
  if (prior) {
    logSsoEmailCollision("prior_user");
    return { ok: false, error: "sso_email_collision", status: 409 };
  }

  let signedUp: { userId: string } | null = null;
  try {
    signedUp = await deps.signUp();
  } catch (error) {
    logSsoEmailCollision("signup_threw", error);
    return { ok: false, error: "sso_email_collision", status: 409 };
  }

  if (!signedUp?.userId) {
    const afterFailedSignUp = await deps.findUserByEmail();
    if (afterFailedSignUp) {
      logSsoEmailCollision("user_appeared_after_failed_signup");
      return { ok: false, error: "sso_email_collision", status: 409 };
    }
    return { ok: false, error: "sso_signup_failed", status: 500 };
  }

  const created = await deps.findUserByEmail();
  if (!created || created.id !== signedUp.userId) {
    logSsoEmailCollision("signup_user_mismatch");
    return { ok: false, error: "sso_email_collision", status: 409 };
  }

  return { ok: true, userId: signedUp.userId };
}
