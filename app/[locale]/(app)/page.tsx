import type { Metadata } from "next";

import { getHomePageMetadata } from "@/shared/config/home-metadata";
import { WorkoutStepper } from "@/features/workout-builder";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return getHomePageMetadata(locale);
}

export default async function HomePage() {
  return (
    <div className="bg-background text-foreground relative flex flex-col h-full">
      <WorkoutStepper />
    </div>
  );
}
