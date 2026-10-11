"use server";


import { prisma } from "@/shared/lib/prisma";
import { ActionError } from "@/shared/api/safe-actions";
import { mobileAuthenticatedActionClient } from "@/shared/api/mobile-safe-actions";
import { UpdatePasswordSchema } from "@/features/update-password/model/update-password.schema";
import { validatePassword } from "@/features/update-password/lib/validate-password";
import { CREDENTIAL_PROVIDER_ID, updateCredentialPassword } from "@/features/update-password/lib/update-credential-password";
import { hashStringWithSalt } from "@/features/update-password/lib/hash";
import { env } from "@/env";

/**
 * Core password update logic that can be used by both the action and API route.
 * Only the Better Auth `credential` account is read or written.
 */
export async function updateUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
) {
  try {
    await updateCredentialPassword(
      userId,
      { currentPassword, newPassword, confirmPassword },
      {
        findCredentialAccount: async (where) =>
          prisma.account.findFirst({
            where,
            select: { password: true, id: true }
          }),
        updateAccountPassword: async (accountId, ownerId, hashedPassword) => {
          await prisma.account.updateMany({
            where: { id: accountId, userId: ownerId, providerId: CREDENTIAL_PROVIDER_ID },
            data: { password: hashedPassword }
          });
        },
        hash: (password) => hashStringWithSalt(password, env.BETTER_AUTH_SECRET),
        validateNewPassword: validatePassword
      }
    );
  } catch (error) {
    if (error instanceof Error) {
      throw new ActionError(error.message);
    }
    throw error;
  }
}

export const updatePasswordAction = mobileAuthenticatedActionClient
  .schema(UpdatePasswordSchema)
  .action(async ({ parsedInput, ctx }) => {
      const { confirmPassword, currentPassword, newPassword } = parsedInput;
      const { user } = ctx as { user: { id: string } };

      return updateUserPassword(user.id, currentPassword, newPassword, confirmPassword);
    });
