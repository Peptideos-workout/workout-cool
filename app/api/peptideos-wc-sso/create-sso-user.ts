import { logSsoEmailCollision } from "./sso-error-log";

export type CreateSsoUserResult =
  | { ok: true; userId: string }
  | { ok: false; error: "sso_email_collision" | "sso_signup_failed"; status: number; collidingUserId?: string };

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
    return { ok: false, error: "sso_email_collision", status: 409, collidingUserId: prior.id };
  }

  let signedUp: { userId: string } | null = null;
  try {
    signedUp = await deps.signUp();
  } catch (error) {
    logSsoEmailCollision("signup_threw", error);
    const afterThrow = await deps.findUserByEmail();
    return afterThrow
      ? { ok: false, error: "sso_email_collision", status: 409, collidingUserId: afterThrow.id }
      : { ok: false, error: "sso_email_collision", status: 409 };
  }

  if (!signedUp?.userId) {
    const afterFailedSignUp = await deps.findUserByEmail();
    if (afterFailedSignUp) {
      logSsoEmailCollision("user_appeared_after_failed_signup");
      return { ok: false, error: "sso_email_collision", status: 409, collidingUserId: afterFailedSignUp.id };
    }
    return { ok: false, error: "sso_signup_failed", status: 500 };
  }

  const created = await deps.findUserByEmail();
  if (!created || created.id !== signedUp.userId) {
    logSsoEmailCollision("signup_user_mismatch");
    return created
      ? { ok: false, error: "sso_email_collision", status: 409, collidingUserId: created.id }
      : { ok: false, error: "sso_email_collision", status: 409 };
  }

  return { ok: true, userId: signedUp.userId };
}
