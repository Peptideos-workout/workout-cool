"use client";
import { ArrowLeft, ArrowRight, Play } from "lucide-react";
import { useI18n } from "locales/client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { RewardedAdGate } from "@/components/ads/custom/RewardedAdGate";

export function WorkoutBuilderFooter({
  currentStep,
  totalSteps,
  canContinue,
  onPrevious,
  onNext,
  onStartWorkout,
  bottomBanner,
}: {
  currentStep: number;
  totalSteps: number;
  canContinue: boolean;
  onPrevious: VoidFunction;
  onNext: VoidFunction;
  onStartWorkout?: VoidFunction;
  bottomBanner?: ReactNode;
}) {
  const t = useI18n();
  const isFirstStep = currentStep === 1;
  const isFinalStep = currentStep === totalSteps;

  return (
    <div
      className="sticky bottom-0 z-30 w-full max-sm:bottom-[calc(var(--wc-nav-h)+env(safe-area-inset-bottom))]"
      data-wc-step-footer=""
    >
      {/* Mobile layout - vertical stack */}
      <div className="flex flex-col gap-4 px-2 sm:px-6 pb-2">
        {bottomBanner}
        {/* Center stats on top for mobile */}

        {/* Navigation buttons */}
        <div
          className={`mt-4 min-h-12 flex items-center justify-between bg-white dark:bg-slate-900 w-full p-0.5 border border-slate-400 dark:border-slate-700 ${isFinalStep ? "flex-col sm:flex-row gap-2 sm:gap-3 rounded-2xl sm:rounded-full" : "flex-row gap-3 rounded-full"}`}
          data-wc-step-actions=""
        >
          {/* Previous button */}
          <Button
            className={`flex-1 rounded-full !h-auto !min-h-12 !text-lg text-[var(--wc-dash-text)] disabled:pointer-events-auto ${isFinalStep ? "w-full" : ""}`}
            data-wc-step-previous=""
            disabled={isFirstStep}
            onClick={onPrevious}
            size="default"
            variant="ghost"
          >
            <div className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              <span className="font-medium">{t("workout_builder.navigation.previous")}</span>
            </div>
          </Button>

          {/* Next/Start Workout button */}
          {isFinalStep && onStartWorkout ? (
            <RewardedAdGate onRewardGranted={onStartWorkout}>
              <Button
                asChild
                className="flex-1 w-full rounded-full !h-auto !min-h-12 !bg-[var(--wc-dash-accent)] !text-lg !text-[var(--wc-dash-ink)] hover:!bg-[var(--wc-dash-accent)] disabled:pointer-events-auto"
                data-wc-step-next=""
                disabled={!canContinue}
                size="default"
                variant="default"
              >
                <div className="flex items-center justify-center gap-2">
                  <Play className="h-4 w-4" />
                  <span className="font-semibold">{t("workout_builder.navigation.start_workout")}</span>
                </div>
              </Button>
            </RewardedAdGate>
          ) : (
            <Button
              className="flex-1 w-full rounded-full !h-auto !min-h-12 !bg-[var(--wc-dash-accent)] !text-lg !text-[var(--wc-dash-ink)] hover:!bg-[var(--wc-dash-accent)] disabled:pointer-events-auto"
              data-wc-step-next=""
              disabled={!canContinue}
              onClick={onNext}
              size="default"
              variant="default"
            >
              <div className="flex items-center justify-center gap-2">
                <span className="font-semibold">{t("workout_builder.navigation.continue")}</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
