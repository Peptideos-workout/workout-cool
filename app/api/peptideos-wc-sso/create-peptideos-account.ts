import { logSsoEmailCollision } from "./sso-error-log";
import { isAccountUniqueViolation } from "./account-unique-violation";

export type CreatePeptideosAccountResult = { ok: true } | { ok: false; error: "sso_email_collision"; status: 409 };

export async function createPeptideosAccountLink(input: {
  userId: string;
  peptideosUserId: string;
  insert: (row: { userId: string; peptideosUserId: string }) => Promise<void>;
}): Promise<CreatePeptideosAccountResult> {
  try {
    await input.insert({ userId: input.userId, peptideosUserId: input.peptideosUserId });
    return { ok: true };
  } catch (error) {
    if (isAccountUniqueViolation(error)) {
      logSsoEmailCollision("peptideos_account_unique", error);
      return { ok: false, error: "sso_email_collision", status: 409 };
    }
    throw error;
  }
}
