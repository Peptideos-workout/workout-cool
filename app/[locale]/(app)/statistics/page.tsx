import React from "react";
import { getI18n } from "locales/server";

import { ExercisesBrowser } from "@/features/statistics/components/ExercisesBrowser";

export default async function StatisticsPage() {
  const t = await getI18n();
  return (
    <div className="container mx-auto px-2 sm:px-4 py-8 max-w-7xl">
      <div className="text-center mb-12">
        <h1 className="mb-2 text-lg font-bold text-[var(--wc-dash-text)]">{t("statistics.title")}</h1>
        <p className="mx-auto max-w-2xl text-lg text-[var(--wc-dash-secondary)]">{t("statistics.page_subtitle")}</p>
      </div>

      {/* Main Content */}
      <ExercisesBrowser />
    </div>
  );
}
