"use server";

import { ActionError, actionClient } from "@/shared/api/safe-actions";
import { signUpSchema } from "@/features/auth/signup/schema/signup.schema";
import { PUBLIC_SIGNUP_DISABLED } from "@/features/auth/lib/public-signup-guard";

export const signUpAction = actionClient.schema(signUpSchema).action(async () => {
  throw new ActionError(PUBLIC_SIGNUP_DISABLED);
});
