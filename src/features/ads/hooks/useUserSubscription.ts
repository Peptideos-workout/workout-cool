"use client";

import { useSession } from "@/features/auth/lib/auth-client";
import { SiteConfig } from "@/shared/config/site-config";

export function useUserSubscription() {
  const { data: session, ...rest } = useSession();
  const isPremium = Boolean(session?.user) && (SiteConfig.allPremiumFeaturesFree || !!session?.user?.isPremium);

  return { isPremium, ...rest };
}
