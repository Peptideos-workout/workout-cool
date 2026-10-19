import Link from "next/link";
import Image from "next/image";
import { Lock, Dumbbell } from "lucide-react";
import { Locale } from "locales/types";
import { getI18n } from "locales/server";
import { ExerciseAttributeValueEnum } from "@prisma/client";

import { PublicProgram } from "../actions/get-public-programs.action";

import { getAttributeValueLabel } from "@/shared/lib/attribute-value-translation";
import { SiteConfig } from "@/shared/config/site-config";
import { getProgramDescription, getProgramSlug, getProgramTitle } from "@/features/programs/lib/translations-mapper";

interface ProgramCardProps {
  program: PublicProgram;
  size?: "small" | "medium" | "large";
  locale: Locale;
}

const cardShell =
  "block overflow-hidden rounded-2xl border border-[var(--wc-dash-border)] bg-[var(--wc-dash-card)] " +
  "text-[var(--wc-dash-text)] transition-colors duration-300 ease-out";
const levelKicker = {
  accent:
    "inline-flex min-h-12 items-center rounded-full border border-[var(--wc-dash-accent)] " +
    "bg-[var(--wc-dash-accent)] px-3 text-lg font-semibold text-[var(--wc-dash-ink)]",
  link:
    "inline-flex min-h-12 items-center rounded-full border border-[var(--wc-dash-link)] " +
    "bg-[var(--wc-dash-card)] px-3 text-lg font-semibold text-[var(--wc-dash-link)]",
  text:
    "inline-flex min-h-12 items-center rounded-full border border-[var(--wc-dash-text)] " +
    "bg-[var(--wc-dash-inner)] px-3 text-lg font-semibold text-[var(--wc-dash-text)]",
};
const premiumKicker =
  "inline-flex min-h-12 items-center rounded-full border border-[var(--wc-dash-border)] " +
  "bg-[var(--wc-dash-card)] px-3 text-lg font-semibold text-[var(--wc-dash-link)]";

export async function ProgramCard({ program, size = "medium", locale }: ProgramCardProps) {
  const isLocked = program.isPremium && !SiteConfig.allPremiumFeaturesFree;
  const t = await getI18n();
  const title = getProgramTitle(program, locale);
  const description = getProgramDescription(program, locale);
  const programSlug = getProgramSlug(program, locale);

  const paddingClass = {
    small: "p-3 sm:p-4",
    medium: "p-4 sm:p-5",
    large: "p-4 sm:p-6",
  }[size];

  const titleClass = {
    small: "text-lg font-bold",
    medium: "text-lg font-bold",
    large: "text-xl font-bold",
  }[size];

  const subtitleClass = {
    small: "text-lg",
    medium: "text-lg",
    large: "text-lg",
  }[size];

  const getLevelConfig = (level: string) => {
    switch (level) {
      case "BEGINNER":
        return {
          emoji: "/images/emojis/WorkoutCoolHappy.png",
          kicker: levelKicker.accent,
        };
      case "INTERMEDIATE":
        return {
          emoji: "/images/emojis/WorkoutCoolBiceps.png",
          kicker: levelKicker.link,
        };
      case "ADVANCED":
        return {
          emoji: "/images/emojis/WorkoutCoolSwag.png",
          kicker: levelKicker.text,
        };
      default:
        return {
          emoji: "/images/emojis/WorkoutCoolHappy.png",
          kicker: levelKicker.text,
        };
    }
  };

  const levelConfig = getLevelConfig(program.level);

  return (
    <div className="group">
      <div className={`${cardShell} relative`} itemScope itemType="https://schema.org/Course">
        <Link
          aria-label={`${title} - ${t(`levels.${program.level}` as keyof typeof t)} ${t("programs.program")}`}
          className="absolute inset-0 z-0"
          href={`/programs/${programSlug}`}
        />
        <div className="pointer-events-none relative z-10">
        <div className="h-1 bg-[var(--wc-dash-accent)]" />

        <div className="relative h-32 sm:h-36 overflow-hidden">
          <Image alt={t("programs.cover_alt", { title })} className="w-full h-full object-cover" fill loading="lazy" src={program.image} />
          <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--wc-dash-page)_40%,transparent)]" />

          <div className="absolute top-3 left-3 right-3 flex items-start justify-end gap-2">
            <div className="flex flex-wrap justify-end gap-2">
              <span className={program.isPremium ? premiumKicker : levelKicker.text}>
                {program.isPremium ? t("programs.premium") : t("programs.free")}
              </span>
            </div>

            <div className="relative">
              <div
                className={
                  "flex h-12 w-12 items-center justify-center rounded-full border border-[var(--wc-dash-border)] " +
                  "bg-[var(--wc-dash-panel)]"
                }
              >
                {isLocked ? (
                  <Lock className="h-5 w-5 text-[var(--wc-dash-text)]" size={size === "large" ? 16 : 14} />
                ) : (
                  <Image
                    alt=""
                    className={"object-contain h-6 w-6"}
                    height={size === "large" ? 24 : 20}
                    loading="lazy"
                    src={levelConfig.emoji}
                    width={size === "large" ? 24 : 20}
                  />
                )}
              </div>
              {!isLocked && <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-[var(--wc-dash-accent)]" />}
            </div>
          </div>
        </div>

        <div className={`${paddingClass} space-y-3`}>
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h4 className={`${titleClass} leading-tight text-[var(--wc-dash-text)]`} itemProp="name">
                {title}
              </h4>
              <span className={levelConfig.kicker}>{t(`levels.${program.level}` as keyof typeof t)}</span>
            </div>
            <p className={`${subtitleClass} leading-relaxed text-[var(--wc-dash-secondary)] line-clamp-2`} itemProp="description">
              {description}
            </p>
          </div>

          <p className="text-lg break-words text-[var(--wc-dash-secondary)]">
            {program.durationWeeks} {t("programs.weeks", { count: program.durationWeeks })}
            {" · "}
            {program.sessionsPerWeek} {t("programs.sessions_per_week", { count: program.sessionsPerWeek })}
            {" · "}
            {program.sessionDurationMin} {t("programs.session_duration")}
          </p>

          {program.equipment && program.equipment.length > 0 && (
            <div className="flex items-start gap-2">
              <Dumbbell className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--wc-dash-secondary)]" />
              <div className="flex flex-wrap gap-1 text-lg text-[var(--wc-dash-secondary)]">
                {program.equipment.slice(0, 3).map((equipment, index) => (
                  <span className="inline-flex items-center" key={equipment}>
                    {getAttributeValueLabel(equipment as ExerciseAttributeValueEnum, t)}
                    {index < Math.min(program.equipment.length, 3) - 1 && <span className="ml-1 text-[var(--wc-dash-secondary)]">•</span>}
                  </span>
                ))}
                {program.equipment.length > 3 && <span className="text-[var(--wc-dash-secondary)]">+{program.equipment.length - 3}</span>}
              </div>
            </div>
          )}

          <Link
            className="pointer-events-auto inline-flex min-h-12 w-full items-center justify-center rounded-xl border-2 border-[var(--wc-dash-text)] bg-[var(--wc-dash-card)] px-4 text-lg font-semibold text-[var(--wc-dash-text)]"
            href={`/programs/${programSlug}`}
          >
            {t("programs.about")}
          </Link>
        </div>
        </div>
      </div>
    </div>
  );
}
