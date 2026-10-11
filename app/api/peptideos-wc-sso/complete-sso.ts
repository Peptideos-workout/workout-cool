import { logSsoEmailCollision } from "./sso-error-log";
import { resolveSsoAccountAction } from "./resolve-sso-account";
import { createSsoUserIfAbsent } from "./create-sso-user";
import { isAccountUniqueViolation } from "./account-unique-violation";

import type { SsoAccountSnapshot } from "./resolve-sso-account";
import type { CreatePeptideosAccountResult } from "./create-peptideos-account";

export interface CompleteSsoLoginDeps {
  findUserByEmail: () => Promise<{ id: string } | null>;
  signUp: () => Promise<{ userId: string } | null>;
  createPeptideosAccount: (userId: string) => Promise<void | CreatePeptideosAccountResult>;
  findPeptideosAccountByUserId: (userId: string) => Promise<{ accountId: string } | null>;
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

    let linked: void | CreatePeptideosAccountResult;
    try {
      linked = await deps.createPeptideosAccount(created.userId);
    } catch (error) {
      if (!isAccountUniqueViolation(error)) {
        throw error;
      }
      const matched = await continueIfMatchingPeptideosAccount(peptideosUserId, created.userId, deps, error);
      if (!matched) {
        return { ok: false, error: "sso_email_collision", status: 409, wroteUserState: true };
      }
    }
    if (linked && linked.ok === false) {
      const matched = await continueIfMatchingPeptideosAccount(peptideosUserId, created.userId, deps);
      if (!matched) {
        return { ok: false, error: "sso_email_collision", status: 409, wroteUserState: true };
      }
    }
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

async function continueIfMatchingPeptideosAccount(
  peptideosUserId: string,
  userId: string,
  deps: Pick<CompleteSsoLoginDeps, "findPeptideosAccountByUserId">,
  error?: unknown
): Promise<boolean> {
  const existing = await deps.findPeptideosAccountByUserId(userId);
  if (existing?.accountId === peptideosUserId) {
    return true;
  }
  logSsoEmailCollision("peptideos_account_unique", error ?? { message: "account unique without matching peptideos accountId" });
  return false;
}
