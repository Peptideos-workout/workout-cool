import { ERROR_MESSAGES } from "@/shared/constants/errors";

export const CREDENTIAL_PROVIDER_ID = "credential";

export function credentialAccountWhere(userId: string) {
  return { userId, providerId: CREDENTIAL_PROVIDER_ID };
}

export function hasCredentialPasswordAccount(accounts: { providerId: string }[]): boolean {
  return accounts.some((account) => account.providerId === CREDENTIAL_PROVIDER_ID);
}

export interface UpdateCredentialPasswordDeps {
  findCredentialAccount: (where: { userId: string; providerId: string }) => Promise<{ id: string; password: string | null } | null>;
  updateAccountPassword: (accountId: string, userId: string, hashedPassword: string) => Promise<void>;
  hash: (password: string) => string;
  validateNewPassword: (password: string) => boolean;
}

export async function updateCredentialPassword(
  userId: string,
  input: { currentPassword: string; newPassword: string; confirmPassword: string },
  deps: UpdateCredentialPasswordDeps
) {
  if (input.newPassword !== input.confirmPassword) {
    throw new Error(ERROR_MESSAGES.PASSWORDS_DO_NOT_MATCH);
  }

  const account = await deps.findCredentialAccount(credentialAccountWhere(userId));
  if (!account) {
    throw new Error(ERROR_MESSAGES.NO_CREDENTIAL_ACCOUNT);
  }

  if (deps.hash(input.currentPassword) !== account.password) {
    throw new Error(ERROR_MESSAGES.INVALID_CURRENT_PASSWORD);
  }

  if (!deps.validateNewPassword(input.newPassword)) {
    throw new Error(ERROR_MESSAGES.INVALID_NEW_PASSWORD);
  }

  await deps.updateAccountPassword(account.id, userId, deps.hash(input.newPassword));
}
