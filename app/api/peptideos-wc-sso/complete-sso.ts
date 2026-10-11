import { resolveSsoAccountAction } from "./resolve-sso-account";
import { createSsoUserIfAbsent } from "./create-sso-user";

import type { SsoAccountSnapshot } from "./resolve-sso-account";

export interface CompleteSsoLoginDeps {
  findUserByEmail: () => Promise<{ id: string } | null>;
  signUp: () => Promise<{ userId: string } | null>;
  createPeptideosAccount: (userId: string) => Promise<void>;
  createSignedSession: (userId: string) => Promise<{ ok: boolean; wroteSession: boolean }>;
}

export type CompleteSsoLoginResult =
  | { ok: true; userId: string; wroteUserState: true }
  | {
      ok: false;
      error: "sso_email_collision" | "sso_signup_failed" | "sso_signin_failed";
      status: number;
      wroteUserState: boolean;
    };

export async function completePeptideOsSsoLogin(
  peptideosUserId: string,
  snapshot: SsoAccountSnapshot,
  deps: CompleteSsoLoginDeps,
): Promise<CompleteSsoLoginResult> {
  const action = resolveSsoAccountAction(peptideosUserId, snapshot);

  if (action.type === "reject") {
    return { ok: false, error: action.error, status: 409, wroteUserState: false };
  }

  if (action.type === "create_user") {
    const created = await createSsoUserIfAbsent({
      findUserByEmail: deps.findUserByEmail,
      signUp: deps.signUp
    });
    if (!created.ok) {
      return { ...created, wroteUserState: false };
    }

    await deps.createPeptideosAccount(created.userId);
    const signedIn = await deps.createSignedSession(created.userId);
    if (!signedIn.ok) {
      return { ok: false, error: "sso_signup_failed", status: 500, wroteUserState: true };
    }
    return { ok: true, userId: created.userId, wroteUserState: true };
  }

  const signedIn = await deps.createSignedSession(action.userId);
  if (!signedIn.ok) {
    return { ok: false, error: "sso_signin_failed", status: 500, wroteUserState: signedIn.wroteSession };
  }
  return { ok: true, userId: action.userId, wroteUserState: true };
}
