import React from "react";
import { getI18n } from "locales/server";

import { ExercisesBrowser } from "@/features/statistics/components/ExercisesBrowser";
import { PremiumGate } from "@/components/ui/premium-gate";

export default async function StatisticsPage() {
  const t = await getI18n();
  return (
    <div className="container mx-auto px-2 sm:px-4 py-8 max-w-7xl">
      <div className="text-center mb-12">
        <p className="mb-2 text-lg font-bold text-[var(--wc-dash-accent)]" data-wc-kicker="">
          {t("statistics.kicker")}
        </p>
        <h1 className="mb-4 text-4xl font-black text-[var(--wc-dash-text)] sm:text-6xl">{t("statistics.title")}</h1>
        <p className="mx-auto mb-8 max-w-2xl text-lg text-[var(--wc-dash-secondary)]">{t("statistics.page_subtitle")}</p>

        <PremiumGate feature="Statistics">
          {/* this is the premium content ↓ */}
          <div />
        </PremiumGate>
      </div>

      {/* Main Content */}
      <ExercisesBrowser />
    </div>
  );
}
