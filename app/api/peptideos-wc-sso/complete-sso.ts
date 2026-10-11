import { resolveSsoAccountAction } from "./resolve-sso-account";

import type { SsoAccountSnapshot } from "./resolve-sso-account";

export interface CompleteSsoLoginDeps {
  signUpNewUser: () => Promise<{ userId: string }>;
  createCredential: (userId: string) => Promise<void>;
  createPeptideosAccount: (userId: string) => Promise<void>;
  updateCredentialPassword: (credentialId: string, passwordHash: string) => Promise<void>;
  signInWithDerivedPassword: () => Promise<boolean>;
  signInWithTrustedSession: (userId: string) => Promise<boolean>;
}

export type CompleteSsoLoginResult =
  | { ok: true; userId: string }
  | { ok: false; error: "sso_email_collision" | "sso_signup_failed" | "sso_signin_failed" | "sso_existing_credentials"; status: number };

export async function completePeptideOsSsoLogin(
  peptideosUserId: string,
  derivedPasswordHash: string,
  snapshot: SsoAccountSnapshot,
  deps: CompleteSsoLoginDeps,
): Promise<CompleteSsoLoginResult> {
  const action = resolveSsoAccountAction(peptideosUserId, derivedPasswordHash, snapshot);

  if (action.type === "reject") {
    return { ok: false, error: action.error, status: 409 };
  }

  if (action.type === "create_user") {
    const created = await deps.signUpNewUser();
    await deps.createPeptideosAccount(created.userId);
    const signedIn = await deps.signInWithDerivedPassword();
    if (!signedIn) return { ok: false, error: "sso_signup_failed", status: 500 };
    return { ok: true, userId: created.userId };
  }

  if (action.createCredential) {
    await deps.createCredential(action.userId);
  }
  if (action.createPeptideosAccount) {
    await deps.createPeptideosAccount(action.userId);
  }

  const signedIn = await deps.signInWithDerivedPassword();
  if (signedIn) return { ok: true, userId: action.userId };

  if (action.allowTrustedSession) {
    const trusted = await deps.signInWithTrustedSession(action.userId);
    if (trusted) return { ok: true, userId: action.userId };
    return { ok: false, error: "sso_existing_credentials", status: 409 };
  }

  return { ok: false, error: "sso_signin_failed", status: 500 };
}
