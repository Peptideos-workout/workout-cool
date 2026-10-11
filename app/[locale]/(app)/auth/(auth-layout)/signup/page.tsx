import { redirect } from "next/navigation";

import { resolvePeptideOsSignupUrl } from "@/features/auth/lib/peptideos-signup-url";
import { env } from "@/env";

export const metadata = {
  title: "Sign Up - Workout.cool",
  description: "Create your account on PeptideOS"
};

interface AuthSignUpPageParams {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AuthSignUpPage({ searchParams }: AuthSignUpPageParams) {
  const params = await searchParams;
  const returnTo = typeof params.redirect === "string" ? params.redirect : undefined;
  redirect(resolvePeptideOsSignupUrl(env.NEXT_PUBLIC_PEPTIDEOS_URL, env.NEXT_PUBLIC_APP_URL, returnTo));
}
