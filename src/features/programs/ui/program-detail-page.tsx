"use client";

import { useState, useEffect } from "react";
import { useQueryState, parseAsString, parseAsInteger } from "nuqs";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  BarChart3,
  Target,
  Clock,
  Calendar,
  Timer,
  Dumbbell,
  Lock,
  Trophy,
  Users,
  Zap,
  CheckCircle2,
  Unlock,
  ArrowRight,
} from "lucide-react";
import { useCurrentLocale, useI18n } from "locales/client";

import { getProgramProgress } from "../actions/get-program-progress.action";
import { ProgramDetail } from "../actions/get-program-by-slug.action";

import { useIsPremium } from "@/shared/lib/premium/use-premium";
import { getSlugForLocale } from "@/shared/lib/locale-slug";
import { ATTRIBUTE_VALUE_TRANSLATION_KEYS, getAttributeValueLabel } from "@/shared/lib/attribute-value-translation";
import { SiteConfig } from "@/shared/config/site-config";
import { WelcomeModal } from "@/features/programs/ui/welcome-modal";
import { ShareButton } from "@/features/programs/ui/share-button";
import { ProgramProgress } from "@/features/programs/ui/program-progress";
import {
  getProgramDescription,
  getProgramTitle,
  getSessionDescription,
  getSessionTitle,
  getWeekDescription,
  getWeekTitle,
} from "@/features/programs/lib/translations-mapper";
import { getConfiguredPeptideOsSignupUrl } from "@/features/auth/lib/configured-peptideos-signup";
import { env } from "@/env";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { HorizontalBottomBanner, HorizontalTopBanner } from "@/components/ads";

interface ProgramDetailPageProps {
  program: ProgramDetail;
  isAuthenticated: boolean;
}

export function ProgramDetailPage({ program, isAuthenticated }: ProgramDetailPageProps) {
  const [tab, setTab] = useQueryState("tab", parseAsString.withDefault("about"));
  const [selectedWeek, setSelectedWeek] = useQueryState("week", parseAsInteger.withDefault(1));
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [completedSessions, setCompletedSessions] = useState<Set<string>>(new Set());
  const [_isLoadingProgress, setIsLoadingProgress] = useState(false);
  const [hasJoinedProgram, setHasJoinedProgram] = useState(false);
  const [isProgramCompleted, setIsProgramCompleted] = useState(false);
  const t = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentLocale = useCurrentLocale();
  const isPremium = useIsPremium();
  const programTitle = getProgramTitle(program, currentLocale);
  const programDescription = getProgramDescription(program, currentLocale);
  const currentWeekFull = program.weeks.find((w) => w.weekNumber === selectedWeek);
  const currentWeekTitle = currentWeekFull ? getWeekTitle(currentWeekFull, currentLocale) : "";
  const currentWeekDescription = currentWeekFull ? getWeekDescription(currentWeekFull, currentLocale) : "";

  const localizedTitle = getProgramTitle(program, currentLocale);

  const breadcrumbItems = [
    {
      label: t("breadcrumbs.home"),
      href: `/${currentLocale}`,
    },
    {
      label: t("programs.workout_programs"),
      href: `/${currentLocale}/programs`,
    },
    {
      label: localizedTitle,
      current: true,
    },
  ];

  // Load completed sessions when component mounts or when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadCompletedSessions();
    } else {
      // Reset states for non-authenticated users
      setHasJoinedProgram(false);
      setCompletedSessions(new Set());
      setSelectedWeek(1);
      setIsProgramCompleted(false);
    }
  }, [isAuthenticated]);

  // Reload progress when refresh param changes (indicating session completion)
  useEffect(() => {
    const refreshParam = searchParams.get("refresh");
    if (refreshParam && isAuthenticated) {
      loadCompletedSessions();
    }
  }, [searchParams, isAuthenticated]);

  const loadCompletedSessions = async () => {
    if (!isAuthenticated) return;

    setIsLoadingProgress(true);
    try {
      const progress = await getProgramProgress(program.id);
      if (progress?.enrollment) {
        setHasJoinedProgram(true);
        setSelectedWeek(progress.stats.currentWeek);
        setIsProgramCompleted(progress.stats.isProgramCompleted);
        if (progress.enrollment.sessionProgress) {
          const completed = new Set(
            progress.enrollment.sessionProgress.filter((sp: any) => sp.completedAt !== null).map((sp: any) => sp.session.id),
          );
          setCompletedSessions(completed);
        }
      } else {
        setHasJoinedProgram(false);
        setCompletedSessions(new Set());
        setSelectedWeek(1);
        setIsProgramCompleted(false);
      }
    } catch (error) {
      console.error("Failed to load completed sessions:", error);
      setHasJoinedProgram(false);
    } finally {
      setIsLoadingProgress(false);
    }
  };

  const handleCTAClick = () => {
    if (!isAuthenticated) {
      window.location.assign(getConfiguredPeptideOsSignupUrl(`/${currentLocale}/programs/${program.slug}`));
      return;
    }
    if (hasJoinedProgram) {
      router.push(`/programs/${program.slug}/?tab=sessions`);
    } else {
      setShowWelcomeModal(true);
    }
  };

  const handleJoinProgram = async () => {
    setShowWelcomeModal(false);

    if (!isAuthenticated) {
      window.location.assign(getConfiguredPeptideOsSignupUrl(`/${currentLocale}/programs/${program.slug}`));
      return;
    }

    router.push(`/programs/${program.slug}/?tab=sessions`);

    // if (isAuthenticated && hasJoinedProgram) {
    //   // Navigate to current session if user has already joined
    //   const currentWeekData = program.weeks.find((w) => w.weekNumber === selectedWeek);
    //   const currentSession = currentWeekData?.sessions.find((s) => s.sessionNumber === currentSessionNumber);

    //   if (currentSession) {
    //     const sessionSlug = getSlugForLocale(currentSession, currentLocale);
    //     window.location.href = `/${currentLocale}/programs/${program.slug}/session/${sessionSlug}`;
    //   } else {
    //     // Fallback to first session if current session not found
    //     const firstSession = program.weeks[0]?.sessions[0];
    //     if (firstSession) {
    //       const sessionSlug = getSlugForLocale(firstSession, currentLocale);
    //       window.location.href = `/${currentLocale}/programs/${program.slug}/session/${sessionSlug}`;
    //     }
    //   }
    // } else {
    //   // Navigate to first session for new users or non-authenticated users
    //   // Enrollment and authentication will be handled on the session page
    //   const firstSession = program.weeks[0]?.sessions[0];
    //   if (firstSession) {
    //     const sessionSlug = getSlugForLocale(firstSession, currentLocale);
    //     window.location.href = `/${currentLocale}/programs/${program.slug}/session/${sessionSlug}`;
    //   }
    // }
  };

  return (
    <div className="relative flex flex-col">
      <div className="pb-16">
        <Breadcrumbs items={breadcrumbItems} />
        {(env.NEXT_PUBLIC_TOP_PROGRAM_DETAILS_BANNER_AD_SLOT || env.NEXT_PUBLIC_EZOIC_TOP_PROGRAM_DETAILS_PLACEMENT_ID) && (
          <HorizontalTopBanner
            adSlot={env.NEXT_PUBLIC_TOP_PROGRAM_DETAILS_BANNER_AD_SLOT}
            ezoicPlacementId={env.NEXT_PUBLIC_EZOIC_TOP_PROGRAM_DETAILS_PLACEMENT_ID}
          />
        )}
        {/* Hero Image Section with Gamification */}
        <div className="relative min-h-40 bg-[var(--wc-dash-accent)] pr-24 sm:min-h-64">
          <Image
            alt={t("programs.cover_alt", { title: programTitle })}
            className="absolute inset-0 object-cover opacity-30"
            fill
            src={program.image}
          />

          {/* Mascot Emoji */}
          <div
            className={
              "absolute right-4 top-4 flex h-16 w-16 items-center justify-center rounded-full " +
              "border-2 border-[var(--wc-dash-ink)] bg-[var(--wc-dash-accent)]"
            }
          >
            <Image
              alt=""
              className="w-12 h-12 object-contain"
              height={48}
              src="/images/emojis/WorkoutCoolSwag.png"
              width={48}
            />
          </div>

          <div className="relative flex min-h-40 items-end p-6 sm:min-h-64">
            <div className="flex-1 text-[var(--wc-dash-ink)]">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className={
                    "inline-flex min-h-12 items-center gap-1 rounded-full bg-[var(--wc-dash-ink)] " +
                    "px-3 text-lg font-medium text-[var(--wc-dash-accent)]"
                  }
                >
                  <Zap className="h-5 w-5" size={12} />
                  {t(`levels.${program.level}` as keyof typeof t)}
                </span>
                <span
                  className={
                    "inline-flex min-h-12 items-center gap-1 rounded-full border border-[var(--wc-dash-border)] " +
                    "bg-[var(--wc-dash-panel)] px-3 text-lg font-medium text-[var(--wc-dash-text)]"
                  }
                >
                  <Users className="h-5 w-5" size={12} />
                  {program.participantCount}+
                </span>
              </div>
              <h1 className="mb-2 text-3xl font-bold text-[var(--wc-dash-ink)]">{programTitle}</h1>
            </div>
          </div>
        </div>

        <div className="px-0 sm:px-4 py-4">
          <div className="flex flex-wrap gap-2" role="tablist">
            <button
              aria-label={t("programs.about")}
              className={`min-h-12 rounded-xl px-4 text-lg ${
                tab === "about" ? "!bg-[var(--wc-dash-accent)] !text-[var(--wc-dash-ink)]" : "!text-[var(--wc-dash-text)]"
              }`}
              onClick={() => setTab("about")}
              type="button"
            >
              {t("programs.about")}
            </button>
            <button
              aria-label={t("programs.sessions")}
              className={`min-h-12 rounded-xl px-4 text-lg ${
                tab === "sessions" ? "!bg-[var(--wc-dash-accent)] !text-[var(--wc-dash-ink)]" : "!text-[var(--wc-dash-text)]"
              }`}
              onClick={() => setTab("sessions")}
              type="button"
            >
              {t("programs.sessions")}
            </button>
          </div>

          {/* About Tab Content */}
          {tab === "about" && (
            <div className="rounded-md border border-[var(--wc-dash-border)] bg-[var(--wc-dash-panel)] p-2 sm:p-6">
              <div className="space-y-6">
                {/* User Progress - Only show if authenticated */}
                {isAuthenticated && <ProgramProgress programId={program.id} />}

                {/* Early Access Teaser Section - Only show if not premium */}
                {!isPremium && (
                  <div
                    className={
                      "relative overflow-hidden rounded-xl border-2 border-dashed " +
                      "border-[var(--wc-dash-border)] bg-[var(--wc-dash-card)] p-6"
                    }
                  >
                    {/* Subtle animation background */}
                    <div className="absolute inset-0 bg-[var(--wc-dash-inner)]"></div>

                    <div className="relative z-10">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--wc-dash-accent)]">
                            <Trophy className="text-[var(--wc-dash-ink)]" size={24} />
                          </div>
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-bold text-[var(--wc-dash-text)]">{t("programs.important_info")}</h3>
                          </div>

                          <p className="text-lg italic text-[var(--wc-dash-secondary)]">💡 {t("programs.donation_teaser")}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Gamified Community Stats */}
                <div className="rounded-xl border-2 border-[var(--wc-dash-border)] bg-[var(--wc-dash-card)] p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-2">
                        <Image
                          alt=""
                          className="w-10 h-10 object-contain"
                          height={40}
                          src="/images/emojis/WorkoutCoolHappy.png"
                          width={40}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg font-bold text-[var(--wc-dash-accent)]">{t("programs.community")}</span>
                        </div>
                        <span className="text-lg text-[var(--wc-dash-secondary)]">
                          +{program.participantCount} {t("programs.community_count")}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="tooltip tooltip-bottom" data-tip={t("commons.share")}>
                        <ShareButton programDescription={programDescription} programTitle={programTitle} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border-2 border-[var(--wc-dash-border)] bg-[var(--wc-dash-card)] p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <h3 className="text-lg font-bold text-[var(--wc-dash-accent)]">{t("programs.characteristics")}</h3>
                  </div>

                  {/* Compact Layout - Mobile: List, Desktop: 2 columns */}
                  <div className="space-y-4 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-4 md:space-y-0">
                    <div className="flex items-center gap-4">
                      <BarChart3 className="h-5 w-5 flex-shrink-0 text-[var(--wc-dash-accent)]" size={20} />
                      <span className="text-lg font-medium text-[var(--wc-dash-text)]">
                        {t(`levels.${program.level}` as keyof typeof t)}
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <Target className="h-5 w-5 flex-shrink-0 text-[var(--wc-dash-accent)]" size={20} />
                      <span className="text-lg font-medium text-[var(--wc-dash-text)]">{getAttributeValueLabel(program.type, t)}</span>
                    </div>

                    <div className="flex items-center gap-4">
                      <Clock className="h-5 w-5 flex-shrink-0 text-[var(--wc-dash-accent)]" size={20} />
                      <span className="text-lg font-medium text-[var(--wc-dash-text)]">
                        {program.durationWeeks} {t("programs.weeks", { count: program.durationWeeks })}
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <Calendar className="h-5 w-5 flex-shrink-0 text-[var(--wc-dash-accent)]" size={20} />
                      <span className="text-lg font-medium text-[var(--wc-dash-text)]">
                        {program.sessionsPerWeek} {t("programs.sessions_per_week", { count: program.sessionsPerWeek })}
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <Timer className="h-5 w-5 flex-shrink-0 text-[var(--wc-dash-accent)]" size={20} />
                      <span className="text-lg font-medium text-[var(--wc-dash-text)]">
                        ~{program.sessionDurationMin} {t("programs.session_duration")}
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <Dumbbell className="h-5 w-5 flex-shrink-0 text-[var(--wc-dash-accent)]" size={20} />
                      <span className="text-lg font-medium text-[var(--wc-dash-text)]">
                        {program.equipment.map((equipment, index) => {
                          const isFirst = index === 0;
                          const label = t(ATTRIBUTE_VALUE_TRANSLATION_KEYS[equipment] as keyof typeof t);

                          return <span key={equipment}>{isFirst ? label : `, ${label.toLocaleLowerCase()}`}</span>;
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-4">
                  <p className="text-center text-lg text-[var(--wc-dash-text)]">{programDescription}</p>
                </div>

                {/* Gamified Coaches Section */}
                {program.coaches.length > 0 && (
                  <div className="rounded-xl border-2 border-[var(--wc-dash-border)] bg-[var(--wc-dash-card)] p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <h3 className="text-lg font-bold text-[var(--wc-dash-accent)]">
                        {t("programs.your_coach", { count: program.coaches.length })}
                      </h3>
                      <div
                        className={
                          "inline-flex min-h-12 items-center rounded-full bg-[var(--wc-dash-accent)] px-3 " +
                          "text-lg font-bold text-[var(--wc-dash-ink)]"
                        }
                      >
                        {program.coaches.length}
                      </div>
                    </div>
                    <div className="flex gap-6 overflow-x-auto pb-2">
                      {program.coaches.map((coach) => (
                        <div
                          className={
                            "flex flex-shrink-0 flex-col items-center gap-3 rounded-xl border-2 " +
                            "border-[var(--wc-dash-border)] bg-[var(--wc-dash-panel)] p-3 transition-all " +
                            "duration-200 ease-in-out"
                          }
                          key={coach.id}
                        >
                          <div className="relative">
                            <Image
                              alt={coach.name}
                              className="h-24 w-24 rounded-full border-4 border-[var(--wc-dash-accent)] object-cover"
                              height={96}
                              src={coach.image}
                              width={96}
                            />
                            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center">
                              <Image
                                alt=""
                                className="w-6 h-6 object-contain"
                                height={24}
                                src="/images/emojis/WorkoutCoolLove.png"
                                width={24}
                              />
                            </div>
                          </div>
                          <span className="text-center text-lg font-bold text-[var(--wc-dash-text)]">{coach.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sessions Tab Content */}
          {tab === "sessions" && (
            <div className="rounded-box border border-[var(--wc-dash-border)] bg-[var(--wc-dash-panel)] p-6">
              <div className="space-y-6">
                {/* Week Selector with DaisyUI Tabs */}
                <div className="overflow-x-auto">
                  <div className="flex w-fit flex-nowrap gap-2">
                    {program.weeks.map((week) => (
                      <button
                        className={`min-h-12 flex-shrink-0 rounded-xl px-4 text-lg ${
                          selectedWeek === week.weekNumber
                            ? "!bg-[var(--wc-dash-accent)] !text-[var(--wc-dash-ink)]"
                            : "!text-[var(--wc-dash-text)]"
                        }`}
                        key={week.id}
                        onClick={() => setSelectedWeek(week.weekNumber)}
                      >
                        {t("programs.week_short")} {week.weekNumber}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Current Week Title */}
                <h2 className="text-xl font-bold text-[var(--wc-dash-text)]">{currentWeekTitle}</h2>
                <p className="text-lg text-[var(--wc-dash-secondary)]">{currentWeekDescription}</p>

                {/* Gamified Sessions List */}
                <div className="space-y-3">
                  {(() => {
                    const currentWeekSessions = program.weeks.find((w) => w.weekNumber === selectedWeek)?.sessions || [];

                    if (currentWeekSessions.length === 0) {
                      return (
                        <div
                          className={
                            "rounded-xl border-2 border-dashed border-[var(--wc-dash-border)] " + "bg-[var(--wc-dash-card)] p-8 text-center"
                          }
                        >
                          <div className="flex flex-col items-center gap-3">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--wc-dash-inner)]">
                              <Timer className="h-8 w-8 text-[var(--wc-dash-accent)]" size={32} />
                            </div>
                            <h4 className="text-lg font-bold text-[var(--wc-dash-text)]">{t("programs.sessions_coming_soon")}</h4>
                            <p className="max-w-md text-lg text-[var(--wc-dash-secondary)]">{t("programs.sessions_in_creation")}</p>
                          </div>
                        </div>
                      );
                    }

                    return currentWeekSessions.map((session) => {
                      const sessionSlug = getSlugForLocale(session, currentLocale);
                      const sessionName = getSessionTitle(session, currentLocale);
                      const sessionDescription = getSessionDescription(session, currentLocale);
                      const sessionPaywalled = session.isPremium && !SiteConfig.allPremiumFeaturesFree;

                      const isCompleted = completedSessions.has(session.id);
                      return (
                        <div
                          className={`
                            flex min-h-12 min-w-0 cursor-pointer items-center gap-4 rounded-xl border-2
                            bg-[var(--wc-dash-card)] p-4 text-[var(--wc-dash-text)] transition-all
                            duration-200 ease-in-out ${
                              isCompleted
                                ? "border-[var(--wc-dash-accent)] bg-[var(--wc-dash-inner)]"
                                : sessionPaywalled
                                  ? "border-[var(--wc-dash-link)] bg-[var(--wc-dash-inner)]"
                                  : "border-[var(--wc-dash-border)]"
                            }`}
                          key={session.id}
                          onClick={() => {
                            window.location.href = `/${currentLocale}/programs/${program.slug}/session/${sessionSlug}`;
                          }}
                        >
                          {/* Session Number Badge */}
                          <div className="relative">
                            <div
                              className={`
                                flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl
                                font-bold text-[var(--wc-dash-ink)] ${
                                  isCompleted
                                    ? "bg-[var(--wc-dash-accent)]"
                                    : sessionPaywalled
                                      ? isPremium
                                        ? "bg-[var(--wc-dash-accent)]"
                                        : "bg-[var(--wc-dash-link)]"
                                      : "bg-[var(--wc-dash-accent)]"
                                }`}
                            >
                              {isCompleted ? (
                                <CheckCircle2 size={18} />
                              ) : sessionPaywalled ? (
                                isPremium ? (
                                  <Unlock size={18} />
                                ) : (
                                  <Lock size={18} />
                                )
                              ) : (
                                <span className="text-lg">{session.sessionNumber}</span>
                              )}
                            </div>
                          </div>

                          {/* Session Info */}
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2">
                              <h4
                                className={`
                                  min-w-0 break-words text-lg font-bold ${
                                    isCompleted ? "text-[var(--wc-dash-accent)]" : "text-[var(--wc-dash-text)]"
                                  }`}
                              >
                                {sessionName}
                              </h4>
                              {isCompleted && (
                                <div
                                  className={
                                    "inline-flex min-h-12 items-center rounded-full bg-[var(--wc-dash-accent)] px-3 " +
                                    "text-lg font-bold text-[var(--wc-dash-ink)]"
                                  }
                                >
                                  {t("programs.completed")}
                                </div>
                              )}
                              {!isCompleted && !sessionPaywalled && (
                                <div
                                  className={
                                    "inline-flex min-h-12 items-center rounded-full bg-[var(--wc-dash-accent)] px-3 " +
                                    "text-lg font-bold text-[var(--wc-dash-ink)]"
                                  }
                                >
                                  {t("programs.free")}
                                </div>
                              )}
                              {!isCompleted && sessionPaywalled && (
                                <div
                                  className={
                                    "inline-flex min-h-12 items-center rounded-full border " +
                                    "border-[var(--wc-dash-link)] bg-[var(--wc-dash-card)] px-3 text-lg font-bold " +
                                    "text-[var(--wc-dash-link)]"
                                  }
                                >
                                  {t("programs.premium")}
                                </div>
                              )}
                            </div>
                            {sessionDescription && (
                              <p className="flex items-center gap-1 text-lg text-[var(--wc-dash-secondary)]">{sessionDescription}</p>
                            )}
                            <p className="mt-1 text-lg text-[var(--wc-dash-secondary)]">
                              {session.totalExercises} {t("programs.exercises")} • {session.estimatedMinutes} {t("programs.min_short")}
                            </p>
                          </div>

                          {/* Status Icon */}
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center">
                            {isCompleted ? (
                              <CheckCircle2 className="h-6 w-6 text-[var(--wc-dash-accent)]" size={24} />
                            ) : (
                              <ArrowRight className="h-6 w-6 text-[var(--wc-dash-secondary)]" size={24} />
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
                {(env.NEXT_PUBLIC_BOTTOM_PROGRAM_DETAILS_BANNER_AD_SLOT || env.NEXT_PUBLIC_EZOIC_BOTTOM_PROGRAM_DETAILS_PLACEMENT_ID) && (
                  <HorizontalBottomBanner
                    adSlot={env.NEXT_PUBLIC_BOTTOM_PROGRAM_DETAILS_BANNER_AD_SLOT}
                    ezoicPlacementId={env.NEXT_PUBLIC_EZOIC_BOTTOM_PROGRAM_DETAILS_PLACEMENT_ID}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Enhanced Persuasive Floating CTA - Only show if program is not completed */}
      {!isProgramCompleted && tab !== "sessions" && (
        <div className="absolute bottom-2 right-0 left-0 max-w-sm mx-auto px-4 z-[10]">
          <button
            className={
              "z-1 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-0 " +
              "bg-[var(--wc-dash-accent)] px-6 py-4 text-lg font-bold text-[var(--wc-dash-ink)] " +
              "transition-all duration-200 ease-in-out"
            }
            onClick={handleCTAClick}
          >
            <Image alt="" className="w-6 h-6 object-contain" height={24} src="/images/emojis/WorkoutCoolSwag.png" width={24} />
            <div className="flex flex-col items-center">
              <span className="text-lg">{isAuthenticated && hasJoinedProgram ? t("programs.continue") : t("programs.join_cta")}</span>
            </div>
            <Trophy className="h-5 w-5 text-[var(--wc-dash-ink)]" size={18} />
          </button>
        </div>
      )}

      {/* Program Completed Message */}
      {isProgramCompleted && (
        <div
          className={
            "absolute bottom-2 left-0 right-0 z-1 mx-auto flex min-h-12 max-w-xs items-center " +
            "justify-center gap-2 rounded-full bg-[var(--wc-dash-accent)] px-4 py-3 text-lg " +
            "font-bold text-[var(--wc-dash-ink)]"
          }
        >
          <Trophy className="h-5 w-5 text-[var(--wc-dash-ink)]" size={18} />
          {t("programs.program_completed")}
          <CheckCircle2 className="h-5 w-5 text-[var(--wc-dash-ink)]" size={18} />
        </div>
      )}

      {/* Welcome Modal */}
      <WelcomeModal
        isOpen={showWelcomeModal}
        onClose={() => setShowWelcomeModal(false)}
        onJoin={handleJoinProgram}
        programDuration={`${program.durationWeeks} ${t("programs.weeks", { count: program.durationWeeks })}`}
        programFrequency={`${program.sessionsPerWeek} ${t("programs.sessions_per_week", { count: program.sessionsPerWeek })}`}
        programLevel={t(`levels.${program.level}` as keyof typeof t)}
        programTitle={programTitle}
      />
    </div>
  );
}
