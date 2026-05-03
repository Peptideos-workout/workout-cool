import { Metadata } from "next";
import { redirect } from "next/navigation";

import { PremiumUpgradeCard } from "@/features/premium/ui/premium-upgrade-card";
import { SiteConfig } from "@/shared/config/site-config";

export const metadata: Metadata = {
  title: "Premium Plans - Train freely, support the mission",
  description:
    "Join thousands of fitness enthusiasts who believe in open-source training freedom. Support our mission while unlocking advanced features.",
  keywords: ["premium", "fitness", "workout", "open-source", "subscription", "training"],
  openGraph: {
    title: "Premium Plans - Support the WorkoutOS Mission 💪",
    description: "For passionate fitness enthusiasts who believe in open-source and training freedom. Core features always free!",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Premium Plans - WorkoutOS",
    description: "Train freely, support the mission. Join the passionate fitness community!",
  },
};

export default async function PremiumPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (SiteConfig.allPremiumFeaturesFree) {
    redirect(`/${locale}`);
  }
  return (
    <div className="bg-white dark:bg-gray-950">
      <div className="relative" data-section="pricing">
        <PremiumUpgradeCard />
      </div>
    </div>
  );
}
