import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, Crown, Lock, Play, TrendingUp, Zap } from "lucide-react";
import { useCurrentLocale, useI18n } from "locales/client";
import { ExerciseAttributeNameEnum, ExerciseAttributeValueEnum } from "@prisma/client";

import type { ExerciseWithAttributes } from "@/entities/exercise/types/exercise.types";

import { getYouTubeEmbedUrl } from "@/shared/lib/youtube";
import { useIsPremium } from "@/shared/lib/premium/use-premium";
import { getAttributeValueLabel } from "@/shared/lib/attribute-value-translation";
import { StatisticsTimeframe } from "@/shared/constants/statistics";
import { ExerciseCharts } from "@/features/statistics/components/ExerciseStatisticsTab";
import { TimeframeSelector } from "@/features/statistics/components";
import { getExerciseAttributesValueOf } from "@/entities/exercise/shared/muscles";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ExerciseVideoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise: ExerciseWithAttributes;
  defaultTab?: "video" | "statistics";
}

export function ExerciseVideoModal({ open, onOpenChange, exercise, defaultTab = "video" }: ExerciseVideoModalProps) {
  const t = useI18n();
  const locale = useCurrentLocale();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [selectedTimeframe, setSelectedTimeframe] = useState<StatisticsTimeframe>("8weeks");
  const isPremium = useIsPremium();

  useEffect(() => {
    if (open) setActiveTab(defaultTab);
  }, [open, defaultTab]);

  const title = locale === "fr" ? exercise.name : exercise.nameEn || exercise.name;
  const introduction = locale === "fr" ? exercise.introduction : exercise.introductionEn || exercise.introduction;
  const description = locale === "fr" ? exercise.description : exercise.descriptionEn || exercise.description;
  const videoUrl = exercise.fullVideoUrl;
  const youTubeEmbedUrl = getYouTubeEmbedUrl(videoUrl ?? "");

  const type = getExerciseAttributesValueOf(exercise, ExerciseAttributeNameEnum.TYPE);
  const pMuscles = getExerciseAttributesValueOf(exercise, ExerciseAttributeNameEnum.PRIMARY_MUSCLE);
  const sMuscles = getExerciseAttributesValueOf(exercise, ExerciseAttributeNameEnum.SECONDARY_MUSCLE);
  const equipment = getExerciseAttributesValueOf(exercise, ExerciseAttributeNameEnum.EQUIPMENT);
  const mechanics = getExerciseAttributesValueOf(exercise, ExerciseAttributeNameEnum.MECHANICS_TYPE);

  // Couleurs pour les badges
  const badgeColors: Record<string, string> = {
    TYPE: "bg-[var(--wc-dash-accent)] text-[var(--wc-dash-ink)]",
    PRIMARY_MUSCLE: "bg-[var(--wc-dash-card)] text-[var(--wc-dash-text)]",
    SECONDARY_MUSCLE: "bg-[var(--wc-dash-inner)] text-[var(--wc-dash-text)]",
    EQUIPMENT: "border border-[var(--wc-dash-border)] bg-[var(--wc-dash-panel)] text-[var(--wc-dash-text)]",
    MECHANICS_TYPE: "bg-[var(--wc-dash-link)] text-[var(--wc-dash-ink)]",
  };

  const renderBadge = (value: ExerciseAttributeValueEnum, color: string) => {
    return (
      <span className={`inline-flex min-h-12 items-center rounded-xl px-3 py-2 text-lg font-medium ${color}`} key={value}>
        {getAttributeValueLabel(value, t)}
      </span>
    );
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="!z-[240] max-h-[80vh] w-[calc(100vw-16px)] max-w-[calc(100vw-16px)] overflow-x-hidden border-[var(--wc-dash-border)] bg-[var(--wc-dash-panel)] p-0 text-[var(--wc-dash-text)] sm:max-w-2xl [&>button]:!right-2 [&>button]:top-2 [&>button]:min-h-12 [&>button]:min-w-12 [&>button]:text-[var(--wc-dash-text)] [&>button]:dark:!bg-[var(--wc-dash-panel)] [&>button]:dark:!text-[var(--wc-dash-text)]">
        <DialogHeader className="flex flex-row items-start justify-between px-4 pb-2 pr-16 pt-4">
          <DialogTitle className="text-lg md:text-xl font-bold flex min-w-0 flex-col gap-2">
            <span className="break-words text-left text-lg text-[var(--wc-dash-text)]">{title}</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {type.map((type) => renderBadge(type, badgeColors.TYPE))}
              {pMuscles.map((pMuscle) => renderBadge(pMuscle, badgeColors.PRIMARY_MUSCLE))}
              {sMuscles.map((sMuscle) => renderBadge(sMuscle, badgeColors.SECONDARY_MUSCLE))}
              {equipment.map((eq) => renderBadge(eq, badgeColors.EQUIPMENT))}
              {mechanics.map((mechanic) => renderBadge(mechanic, badgeColors.MECHANICS_TYPE))}
            </div>
          </DialogTitle>
        </DialogHeader>
        {/* @ts-expect-error Tabs shadcn */}
        <Tabs className="flex-1" onValueChange={setActiveTab} value={activeTab}>
          <TabsList className="mx-4 grid w-[calc(100%-2rem)] min-w-0 grid-cols-2 rounded-xl bg-[var(--wc-dash-inner)]">
            <TabsTrigger
              className="!min-h-12 !text-lg !text-[var(--wc-dash-text)] min-w-0 !whitespace-normal data-[state=active]:!bg-[var(--wc-dash-accent)] data-[state=active]:!text-[var(--wc-dash-ink)]"
              value="video"
            >
              <Play size={16} />
              {t("statistics.tabs.video")}
            </TabsTrigger>
            <TabsTrigger
              className="!min-h-12 !text-lg !text-[var(--wc-dash-text)] min-w-0 !whitespace-normal data-[state=active]:!bg-[var(--wc-dash-accent)] data-[state=active]:!text-[var(--wc-dash-ink)]"
              value="statistics"
            >
              <BarChart3 size={16} />
              {t("statistics.title")}
            </TabsTrigger>
          </TabsList>

          <TabsContent className="mt-0" value="video">
            {/* Introduction */}
            {introduction && (
              <div
                className="prose max-w-none px-6 pb-2 pt-2 text-lg text-[var(--wc-dash-text)]"
                dangerouslySetInnerHTML={{ __html: introduction }}
              />
            )}

            {/* Vidéo */}
            <div className="flex aspect-video w-full items-center justify-center bg-[var(--wc-dash-page)]">
              {videoUrl ? (
                youTubeEmbedUrl ? (
                  <iframe
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                    className="w-full h-full border-0"
                    referrerPolicy="strict-origin-when-cross-origin"
                    src={youTubeEmbedUrl}
                    title={title ?? ""}
                  />
                ) : (
                  <video autoPlay className="h-full w-full bg-[var(--wc-dash-page)] object-contain" controls poster="" src={videoUrl} />
                )
              ) : (
                <div className="p-8 text-center text-lg text-[var(--wc-dash-text)]">{t("workout_builder.exercise.no_video_available")}</div>
              )}
            </div>

            {/* Instructions (description) */}
            {description && (
              <div
                className="prose mt-2 max-w-none border-t border-[var(--wc-dash-border)] px-6 pb-6 pt-4 text-lg text-[var(--wc-dash-text)]"
                dangerouslySetInnerHTML={{ __html: description }}
              />
            )}
          </TabsContent>

          <TabsContent className="mt-0" value="statistics">
            <div className="space-y-5 px-3 pb-6 pt-4 md:px-6">
              {/* Header — title + timeframe aligned */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 max-w-full flex-1 items-center gap-2">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--wc-dash-accent)]">
                    <BarChart3 className="h-5 w-5 text-[var(--wc-dash-ink)]" />
                  </div>
                  <h3 className="min-w-0 whitespace-normal text-lg font-semibold text-[var(--wc-dash-text)]">
                    {t("statistics.performance_over_time")}
                  </h3>
                </div>
                <TimeframeSelector className="max-w-full" onSelect={setSelectedTimeframe} selected={selectedTimeframe} />
              </div>

              {/* Charts in card */}
              <div className="rounded-xl border border-[var(--wc-dash-border)] bg-[var(--wc-dash-card)] p-3 md:p-4">
                <ExerciseCharts exerciseId={exercise.id} timeframe={selectedTimeframe} />
              </div>

              {/* Premium teaser — Blurred advanced insights (loss aversion + Zeigarnik effect) */}
              {!isPremium && (
                <div className="relative overflow-hidden rounded-xl border border-dashed border-[var(--wc-dash-border)]">
                  <div aria-hidden="true" className="pointer-events-none select-none space-y-3 p-4 opacity-50 blur-[6px]">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-[var(--wc-dash-link)]" />
                      <span className="text-lg font-semibold text-[var(--wc-dash-text)]">{t("exercise_modal.pr_title")}</span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--wc-dash-inner)]">
                      <div className="h-2 w-3/4 rounded-full bg-[var(--wc-dash-accent)]" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-[var(--wc-dash-inner)] p-2.5 text-center">
                        <p className="text-lg text-[var(--wc-dash-secondary)]">{t("statistics.one_rm_est")}</p>
                      </div>
                      <div className="rounded-xl bg-[var(--wc-dash-inner)] p-2.5 text-center">
                        <p className="text-lg text-[var(--wc-dash-secondary)]">{t("statistics.volume")}</p>
                      </div>
                      <div className="rounded-xl bg-[var(--wc-dash-inner)] p-2.5 text-center">
                        <p className="text-lg text-[var(--wc-dash-secondary)]">{t("statistics.sessions")}</p>
                      </div>
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--wc-dash-panel)_30%,transparent)]">
                    <Link
                      className="flex min-h-12 flex-col items-center gap-2.5 rounded-2xl border border-[var(--wc-dash-border)] bg-[var(--wc-dash-panel)] px-6 py-4"
                      data-wc-entry="premium"
                      href="/premium"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--wc-dash-accent)]">
                          <Crown className="h-5 w-5 text-[var(--wc-dash-ink)]" />
                        </div>
                        <span className="text-lg font-bold text-[var(--wc-dash-text)]">{t("exercise_modal.unlock_insights")}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-lg text-[var(--wc-dash-secondary)]">
                        <span className="flex items-center gap-1">
                          <Zap className="h-5 w-5 text-[var(--wc-dash-accent)]" />
                          {t("exercise_modal.feature_pr")}
                        </span>
                        <span className="flex items-center gap-1">
                          <Lock className="h-5 w-5 text-[var(--wc-dash-accent)]" />
                          {t("exercise_modal.feature_volume")}
                        </span>
                      </div>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
