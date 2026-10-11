import { redirect } from "next/navigation";

import { resolvePeptideOsSignupUrl } from "@/features/auth/lib/peptideos-signup-url";
import { env } from "@/env";

export const metadata = {
  title: "Sign Up - Workout.cool",
  description: "Create your account on PeptideOS"
};

export default function AuthSignUpPage() {
  redirect(resolvePeptideOsSignupUrl(env.NEXT_PUBLIC_PEPTIDEOS_URL, env.NEXT_PUBLIC_APP_URL));
}
