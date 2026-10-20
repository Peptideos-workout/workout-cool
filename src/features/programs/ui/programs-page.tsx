import Image from "next/image";
import { Crown } from "lucide-react";
import { Locale } from "locales/types";
import { getI18n } from "locales/server";

import { getPublicPrograms } from "../actions/get-public-programs.action";
import { ProgramCard } from "./program-card";

import { env } from "@/env";
import { HorizontalBottomBanner, HorizontalTopBanner } from "@/components/ads";

interface ProgramsPageProps {
  locale: Locale;
}

const pageShell = "flex flex-col bg-[var(--wc-dash-page)] text-[var(--wc-dash-text)]";

export async function ProgramsPage({ locale }: ProgramsPageProps) {
  const programs = await getPublicPrograms();
  const t = await getI18n();

  if (programs.length === 0) {
    return (
      <div className={`${pageShell} h-full flex-1`}>
        <div className="flex flex-1 flex-col items-center justify-center p-6">
          <div className="mb-6">
            <Image
              alt=""
              className="object-contain w-20 h-20"
              height={80}
              priority
              src="/images/emojis/WorkoutCoolCry.png"
              width={80}
            />
          </div>
          <p className="mb-2 text-lg font-bold text-[var(--wc-dash-accent)]" data-wc-kicker="">
            {t("programs.kicker")}
          </p>
          <h1 className="mb-3 text-center text-xl font-bold text-[var(--wc-dash-text)] sm:text-2xl">
            {t("programs.no_programs_available")}
          </h1>
          <p className="max-w-md text-center text-lg text-[var(--wc-dash-secondary)]">{t("programs.no_programs_available_description")}</p>
        </div>
      </div>
    );
  }

  return (
    <main className={pageShell}>
      {(env.NEXT_PUBLIC_TOP_PROGRAMS_BANNER_AD_SLOT || env.NEXT_PUBLIC_EZOIC_TOP_PROGRAMS_PLACEMENT_ID) && (
        <HorizontalTopBanner
          adSlot={env.NEXT_PUBLIC_TOP_PROGRAMS_BANNER_AD_SLOT}
          ezoicPlacementId={env.NEXT_PUBLIC_EZOIC_TOP_PROGRAMS_PLACEMENT_ID}
        />
      )}
      <header className="border-b border-[var(--wc-dash-border)] bg-[var(--wc-dash-panel)]">
        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="mb-2 text-lg font-bold text-[var(--wc-dash-accent)]" data-wc-kicker="">
                {t("programs.kicker")}
              </p>
              <h1 className="mb-3 min-w-0 break-words text-2xl font-bold tracking-tight text-[var(--wc-dash-text)] sm:text-3xl">
                {t("programs.workout_programs")}
              </h1>
              <p className="max-w-lg text-lg leading-relaxed text-[var(--wc-dash-secondary)]">
                {t("programs.workout_programs_description")}
              </p>
            </div>

            <div className="relative ml-4">
              <div className="relative h-16 w-16 sm:h-20 sm:w-20">
                <Image
                  alt=""
                  className="object-contain w-full h-full"
                  height={80}
                  priority
                  src="/images/emojis/WorkoutCoolBiceps.png"
                  width={80}
                />
                <div className="absolute -right-2 -top-2 rounded-full bg-[var(--wc-dash-accent)] p-1.5">
                  <Crown className="h-5 w-5 text-[var(--wc-dash-ink)]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="flex-1 space-y-8 p-4 sm:p-6">
        {programs.length > 0 && (
          <div>
            <div aria-label={t("programs.workout_programs")} className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6" role="list">
              {programs.map((program, index) => (
                <article
                  className="relative animate-fade-in-up"
                  key={program.id}
                  role="listitem"
                  style={{
                    animationDelay: `${index * 100}ms`,
                    animationFillMode: "both",
                  }}
                >
                  <ProgramCard locale={locale} program={program} size={index === 0 ? "medium" : "medium"} />
                </article>
              ))}
            </div>

            <aside className="mt-6 space-y-4">
              {(env.NEXT_PUBLIC_BOTTOM_PROGRAMS_BANNER_AD_SLOT || env.NEXT_PUBLIC_EZOIC_BOTTOM_PROGRAMS_PLACEMENT_ID) && (
                <HorizontalBottomBanner
                  adSlot={env.NEXT_PUBLIC_BOTTOM_PROGRAMS_BANNER_AD_SLOT}
                  ezoicPlacementId={env.NEXT_PUBLIC_EZOIC_BOTTOM_PROGRAMS_PLACEMENT_ID}
                />
              )}
              <p className="text-lg text-[var(--wc-dash-text)]">{t("programs.more_programs_coming_title")}</p>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}
