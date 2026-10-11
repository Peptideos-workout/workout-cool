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
    return { ok: false, error: "sso_email_collision", status: 409 };
  }

  let signedUp: { userId: string } | null = null;
  try {
    signedUp = await deps.signUp();
  } catch {
    return { ok: false, error: "sso_email_collision", status: 409 };
  }

  if (!signedUp?.userId) {
    const afterFailedSignUp = await deps.findUserByEmail();
    if (afterFailedSignUp) {
      return { ok: false, error: "sso_email_collision", status: 409 };
    }
    return { ok: false, error: "sso_signup_failed", status: 500 };
  }

  const created = await deps.findUserByEmail();
  if (!created || created.id !== signedUp.userId) {
    return { ok: false, error: "sso_email_collision", status: 409 };
  }

  return { ok: true, userId: signedUp.userId };
}
