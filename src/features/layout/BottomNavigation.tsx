"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Dumbbell, Grid, Hammer, Crown, Activity, Trophy } from "lucide-react";
import { useCurrentLocale, useI18n } from "locales/client";

import type { CSSProperties } from "react";

import { cn } from "@/shared/lib/utils";
import { paths } from "@/shared/constants/paths";
import { SiteConfig } from "@/shared/config/site-config";

export function BottomNavigation() {
  const pathname = usePathname();
  const t = useI18n();
  const locale = useCurrentLocale();

  const tabsRaw = [
    {
      id: "workout-builder",
      label: t("bottom_navigation.workouts"),
      shortLabel: t("bottom_navigation.workouts"),
      mobileLabel: t("bottom_navigation.workouts"),
      href: paths.root,
      icon: Dumbbell,
      emoji: "WorkoutCoolHappy.png",
      description: t("bottom_navigation.workouts_tooltip"),
      isActive: pathname === paths.root || pathname === `/${locale}`,
    },
    {
      id: "programs",
      label: t("bottom_navigation.programs"),
      shortLabel: t("bottom_navigation.programs"),
      mobileLabel: t("bottom_navigation.programs"),
      href: `${paths.programs}`,
      icon: Grid,
      emoji: "WorkoutCoolSwag.png",
      description: t("bottom_navigation.programs_tooltip"),
      isActive: pathname.includes(paths.programs),
    },
    {
      id: "statistics",
      label: t("bottom_navigation.statistics"),
      shortLabel: t("bottom_navigation.statistics"),
      mobileLabel: t("bottom_navigation.statistics"),
      href: `/${locale}/statistics`,
      icon: Activity,
      emoji: "WorkoutCoolBiceps.png",
      description: t("bottom_navigation.statistics_tooltip"),
      isActive: pathname.includes("/statistics"),
    },
    {
      id: "tools",
      label: t("bottom_navigation.tools"),
      shortLabel: t("bottom_navigation.tools"),
      mobileLabel: t("bottom_navigation.tools"),
      href: `/${locale}/tools`,
      icon: Hammer,
      description: t("bottom_navigation.tools_tooltip"),
      isActive: pathname.includes("/tools"),
    },
    {
      id: "leaderboard",
      label: t("bottom_navigation.leaderboard"),
      shortLabel: t("bottom_navigation.leaderboard"),
      mobileLabel: t("bottom_navigation.leaderboard"),
      href: `/${locale}${paths.leaderboard}`,
      icon: Trophy,
      description: t("bottom_navigation.leaderboard_tooltip"),
      isActive: pathname.includes(paths.leaderboard),
    },
    {
      id: "premium",
      label: t("bottom_navigation.premium"),
      shortLabel: t("bottom_navigation.premium"),
      mobileLabel: t("bottom_navigation.premium"),
      href: `/${locale}/premium`,
      icon: Crown,
      emoji: "WorkoutCoolRich.png",
      description: t("bottom_navigation.premium_tooltip"),
      isActive: pathname.includes("/premium"),
    },
  ];

  const tabs =
    SiteConfig.allPremiumFeaturesFree ?
      tabsRaw.filter((tab) => tab.id !== "premium")
    : tabsRaw;

  return (
    <nav
      aria-label={t("bottom_navigation.label")}
      className="relative bg-white/90 dark:bg-[color-mix(in_srgb,var(--wc-dash-card)_90%,transparent)] backdrop-blur-xl border-t border-[color-mix(in_srgb,var(--wc-dash-accent)_15%,transparent)] dark:border-slate-700/50 max-sm:fixed max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:z-40"
      data-wc-chrome="nav"
    >
      {/* Subtle background gradient */}
      <div className="pointer-events-none absolute inset-0 bg-[color-mix(in_srgb,var(--wc-dash-accent)_3%,transparent)]" />

      <div className="relative sm:px-3 py-2">
        <div
          className="grid grid-cols-2 min-[431px]:grid-cols-3 gap-1 max-w-full mx-auto sm:flex sm:items-center sm:justify-center sm:gap-2"
          data-wc-nav-grid=""
          style={{ "--wc-nav-tabs": String(tabs.length) } as CSSProperties}
        >
          {tabs.map((tab) => {
            const isActive = tab.isActive;
            const isPremium = tab.id === "premium";
            const IconComponent = tab.icon;

            return (
              <Link
                className={cn(
                  "group relative flex min-h-12 flex-col items-center gap-0.5 sm:gap-1 flex-1 min-w-0 px-1 sm:px-4 py-1 rounded-2xl transition-all duration-300 ease-out",
                  "hover:scale-105 active:scale-95",
                  isActive && isPremium
                    ? "border border-[color-mix(in_srgb,var(--wc-dash-link)_20%,transparent)] bg-[color-mix(in_srgb,var(--wc-dash-link)_8%,transparent)]"
                    : isActive
                      ? "border border-[color-mix(in_srgb,var(--wc-dash-accent)_20%,transparent)] bg-[color-mix(in_srgb,var(--wc-dash-accent)_8%,transparent)]"
                      : isPremium
                        ? "hover:bg-[color-mix(in_srgb,var(--wc-dash-link)_5%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--wc-dash-link)_10%,transparent)]"
                        : "hover:bg-gray-50/80 dark:hover:bg-slate-800/50",
                )}
                data-active={isActive ? "true" : "false"}
                data-wc-entry={tab.id === "leaderboard" || tab.id === "premium" ? tab.id : undefined}
                data-wc-nav-premium={isPremium ? "" : undefined}
                href={tab.href}
                key={tab.id}
              >
                {/* Active top indicator */}
                {isActive && (
                  <div
                    className={cn(
                      "absolute -top-0.5 left-1/2 transform -translate-x-1/2 w-4 sm:w-6 h-0.5 rounded-full",
                      isPremium ? "bg-[var(--wc-dash-link)]" : "bg-[var(--wc-dash-accent)]",
                    )}
                  />
                )}

                {/* Icon container */}
                <div className="relative flex items-center justify-center" data-wc-nav-icon="">
                  {/* Active glow effect */}
                  {isActive && (
                    <div
                      className={cn(
                        "absolute inset-0 rounded-full blur-sm scale-150",
                        isPremium
                          ? "bg-[color-mix(in_srgb,var(--wc-dash-link)_15%,transparent)]"
                          : "bg-[color-mix(in_srgb,var(--wc-dash-accent)_15%,transparent)]",
                      )}
                    />
                  )}

                  {/* Main icon */}
                  <div
                    className={cn(
                      "relative flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full transition-all duration-300 ease-out",
                      isActive && isPremium
                        ? "scale-110 bg-[var(--wc-dash-link)] text-[var(--wc-dash-ink)]"
                        : isActive
                          ? "scale-110 bg-[var(--wc-dash-accent)] text-[var(--wc-dash-ink)]"
                          : isPremium
                            ? "text-[var(--wc-dash-link)]"
                            : "text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300",
                    )}
                  >
                    <IconComponent size={isActive ? 15 : 13} strokeWidth={isActive ? 2.5 : 2} />

                    {/* Premium sparkle effect */}
                    {isPremium && !isActive && (
                      <div className="absolute -top-1 -right-1 h-2 w-2 animate-pulse rounded-full bg-[var(--wc-dash-link)] opacity-80" />
                    )}
                  </div>
                </div>

                {/* Label - responsive text */}
                <span
                  className={cn(
                    "text-lg font-semibold transition-all duration-300 ease-out leading-tight whitespace-nowrap text-center",
                    isActive || isPremium ? "text-[var(--wc-dash-link)]" : "text-[var(--wc-dash-text)]",
                  )}
                >
                  <span className="hidden sm:inline">{tab.shortLabel}</span>
                  <span className="inline sm:hidden">{tab.mobileLabel}</span>
                </span>

                {/* Hover tooltip - only on non-touch devices and larger screens */}
                <div
                  className={cn(
                    "absolute -top-12 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-900/90 text-white text-lg rounded-lg opacity-0 pointer-events-none transition-all duration-200 whitespace-nowrap z-50",
                    "after:content-[''] after:absolute after:top-full after:left-1/2 after:transform after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-gray-900/90",
                    "hidden sm:block sm:group-hover:opacity-100 sm:group-hover:-translate-y-1",
                  )}
                >
                  {tab.description}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
