import type { User } from "@prisma/client";

import type { auth } from "@/features/auth/lib/better-auth";

export interface SessionUser extends Omit<User, "image" | "createdAt" | "updatedAt" | "onboardingPreferences"> {
  image?: string | null;
}

export type Session = typeof auth.$Infer.Session;
