import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { auth } from "@/features/auth/lib/better-auth";

export default async function AuthSignOutFromPeptideOsPage() {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // Session may already be gone; still send the browser to public WC home.
  }

  redirect("/");
}
