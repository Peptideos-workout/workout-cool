import Link from "next/link";
import { getI18n } from "locales/server";

import { ExercisesBrowser } from "@/features/statistics/components/ExercisesBrowser";
import { PremiumGate } from "@/components/ui/premium-gate";

export default async function StatisticsPage() {
  const t = await getI18n();
  return (
    <div className="container mx-auto px-2 sm:px-4 py-8 max-w-7xl">
      <div className="text-center mb-12">
        <h1 className="mb-2 text-lg font-bold text-[var(--wc-dash-accent)]">{t("statistics.title")}</h1>
        <p className="mx-auto mb-8 max-w-2xl text-lg text-[var(--wc-dash-secondary)]">{t("statistics.page_subtitle")}</p>

        {/* Stats hero social proof */}
        <PremiumGate
          fallback={
            <div className="flex flex-col flex-wrap items-center justify-center gap-4">
              <p className="text-lg text-[var(--wc-dash-text)]">{t("premium.upgrade_to_access_feature")}</p>
              <Link
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--wc-dash-accent)] px-6 text-lg font-bold text-[var(--wc-dash-ink)]"
                data-wc-entry="premium"
                href="/premium"
              >
                {t("premium.actions.go_premium")}
              </Link>
            </div>
          }
          feature="Statistics"
        >
          {/* this is the premium content ↓ */}
          <div />
        </PremiumGate>
      </div>

      {/* Main Content */}
      <ExercisesBrowser />
    </div>
  );
}
