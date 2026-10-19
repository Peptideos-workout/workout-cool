import Image from "next/image";
import { Crown, TrendingUp } from "lucide-react";
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
const chip =
  "inline-flex min-h-12 items-center rounded-full border border-[var(--wc-dash-border)] " +
  "bg-[var(--wc-dash-card)] px-4 text-lg font-medium text-[var(--wc-dash-accent)]";

export async function ProgramsPage({ locale }: ProgramsPageProps) {
  const programs = await getPublicPrograms();
  const t = await getI18n();

  if (programs.length === 0) {
    return (
      <div className={`${pageShell} h-full flex-1`}>
        <div className="flex flex-1 flex-col items-center justify-center p-6">
          <div className="mb-6">
            <Image
              alt="Mascotte WorkoutCool triste"
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
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="mb-2 text-lg font-bold text-[var(--wc-dash-accent)]" data-wc-kicker="">
                {t("programs.kicker")}
              </p>
              <div className="mb-3 flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-[var(--wc-dash-text)] sm:text-3xl">
                  {t("programs.workout_programs")}
                </h1>
                <div className="relative">
                  <span
                    className={
                      "inline-flex min-h-12 items-center rounded-full bg-[var(--wc-dash-accent)] px-3 " +
                      "text-lg font-bold text-[var(--wc-dash-ink)]"
                    }
                  >
                    {t("commons.new")}
                  </span>
                </div>
              </div>
              <p className="max-w-lg text-lg leading-relaxed text-[var(--wc-dash-secondary)]">
                {t("programs.workout_programs_description")}
              </p>
            </div>

            <div className="relative ml-4">
              <div className="relative h-16 w-16 sm:h-20 sm:w-20">
                <Image
                  alt="Mascotte WorkoutCool"
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
            <h2 className="sr-only">{t("programs.available_programs")}</h2>

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

            <aside className="relative mt-12">
              <div
                className={
                  "relative rounded-2xl border-2 border-dashed border-[var(--wc-dash-border)] " +
                  "bg-[var(--wc-dash-card)] p-3 text-center sm:p-8"
                }
              >
                <div className="absolute -right-2 -top-2 sm:right-4 sm:top-4">
                  <Image
                    alt="Mascotte WorkoutCool excitée"
                    className="h-12 w-12 object-contain opacity-60 sm:h-12 sm:w-12"
                    height={48}
                    src="/images/emojis/WorkoutCoolWooow.png"
                    width={48}
                  />
                </div>

                {(env.NEXT_PUBLIC_BOTTOM_PROGRAMS_BANNER_AD_SLOT || env.NEXT_PUBLIC_EZOIC_BOTTOM_PROGRAMS_PLACEMENT_ID) && (
                  <HorizontalBottomBanner
                    adSlot={env.NEXT_PUBLIC_BOTTOM_PROGRAMS_BANNER_AD_SLOT}
                    ezoicPlacementId={env.NEXT_PUBLIC_EZOIC_BOTTOM_PROGRAMS_PLACEMENT_ID}
                  />
                )}

                <div className="mb-4 flex items-center justify-center gap-3">
                  <TrendingUp className="h-6 w-6 text-[var(--wc-dash-accent)]" />
                  <h3 className="text-xl font-bold text-[var(--wc-dash-text)]">{t("programs.more_programs_coming_title")}</h3>
                </div>

                <p className="mx-auto mb-6 max-w-md text-lg leading-relaxed text-[var(--wc-dash-secondary)]">
                  {t("programs.more_programs_coming_description")}
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <span className={chip}>{t("programs.coming_strength")}</span>
                  <span className={chip}>{t("programs.coming_cardio")}</span>
                  <span className={chip}>{t("programs.coming_yoga")}</span>
                </div>
              </div>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}
