import { resolvePeptideOsSignupUrl } from "./peptideos-signup-url";

import { env } from "@/env";

export function getConfiguredPeptideOsSignupUrl(): string {
  return resolvePeptideOsSignupUrl(env.NEXT_PUBLIC_PEPTIDEOS_URL, env.NEXT_PUBLIC_APP_URL);
}
