"use client";

import { useState, useEffect } from "react";
import { X, Target, Weight } from "lucide-react";
import { useCurrentLocale, useI18n } from "locales/client";

import { QuitWorkoutDialog } from "../../workout-builder/ui/quit-workout-dialog";

import { type WeightUnit } from "@/shared/lib/weight-conversion";
import { cn } from "@/shared/lib/utils";
import { useWorkoutSession } from "@/features/workout-session/model/use-workout-session";
import { Button } from "@/components/ui/button";

interface WorkoutSessionHeaderProps {
  onQuitWorkout: VoidFunction;
}

export function WorkoutSessionHeader({ onQuitWorkout }: WorkoutSessionHeaderProps) {
  const t = useI18n();
  const [showQuitDialog, setShowQuitDialog] = useState(false);
  const [volumeUnit, setVolumeUnit] = useState<WeightUnit>("kg");
  const locale = useCurrentLocale();
  const { getExercisesCompleted, getTotalExercises, session, getTotalVolumeInUnit } = useWorkoutSession();
  const exercisesCompleted = getExercisesCompleted();
  const totalExercises = getTotalExercises();
  const totalVolume = getTotalVolumeInUnit(volumeUnit);

  // Format time with animated colons
  const formatTimeWithAnimatedColons = (date: Date) => {
    const timeString = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    const parts = timeString.split(":");

    if (parts.length === 2) {
      return (
        <>
          {parts[0]}
          <span className="animate-colon-blink">:</span>
          {parts[1]}
        </>
      );
    }
    return timeString;
  };

  // Load volume unit preference from localStorage
  useEffect(() => {
    const savedUnit = localStorage.getItem("volumeUnit") as WeightUnit;
    if (savedUnit === "kg" || savedUnit === "lbs") {
      setVolumeUnit(savedUnit);
    }
  }, []);

  // Save volume unit preference to localStorage
  const handleVolumeUnitChange = (unit: WeightUnit) => {
    setVolumeUnit(unit);
    localStorage.setItem("volumeUnit", unit);
  };

  const handleQuitClick = () => {
    setShowQuitDialog(true);
  };

  const handleQuitWithoutSave = () => {
    onQuitWorkout();
    setShowQuitDialog(false);
  };

  return (
    <>
      <div className="w-full mt-2 mb-6 px-2 sm:px-6">
        <h2 className="mb-3 text-2xl font-bold text-[var(--wc-dash-text)]">{t("workout_builder.session.workout_in_progress")}</h2>
        <div className="rounded-lg border border-[var(--wc-dash-border)] bg-[var(--wc-dash-panel)] p-2 sm:p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 sm:mb-3">
            <span className="text-lg font-medium text-[var(--wc-dash-secondary)]">
              {t("workout_builder.session.started_at")} {formatTimeWithAnimatedColons(new Date(session?.startedAt || ""))}
            </span>

            <Button
              className="border-0 bg-transparent px-3 !text-lg !text-[var(--wc-dash-error)] shadow-none hover:bg-transparent !min-h-12"
              onClick={handleQuitClick}
              variant="ghost"
            >
              <X className="h-3 w-3 mr-1" />
              {t("workout_builder.session.quit_workout")}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Card 1: Exercise Progress */}
            <div className="rounded-md border border-[var(--wc-dash-border)] bg-[var(--wc-dash-card)] p-2">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--wc-dash-inner)]">
                  <Target className="h-5 w-5 text-[var(--wc-dash-accent)]" />
                </div>
                <h3 className="min-w-0 text-lg font-medium text-[var(--wc-dash-text)]">{t("workout_builder.session.exercise_progress")}</h3>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-[var(--wc-dash-text)]">{exercisesCompleted}</span>
                  <span className="text-lg text-[var(--wc-dash-secondary)]">/ {totalExercises}</span>
                </div>

                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--wc-dash-inner)]">
                  <div
                    className="h-full bg-[var(--wc-dash-accent)] transition-all duration-500 ease-out"
                    style={{ width: `${(exercisesCompleted / totalExercises) * 100}%` }}
                  />
                </div>

                <div className="text-center">
                  <span className="text-lg text-[var(--wc-dash-secondary)]">
                    {Math.round((exercisesCompleted / totalExercises) * 100)}% {t("workout_builder.session.complete")}
                  </span>
                </div>
              </div>
            </div>

            {/* Card 2: Total Volume */}
            <div className="rounded-md border border-[var(--wc-dash-border)] bg-[var(--wc-dash-card)] p-2">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--wc-dash-inner)]">
                  <Weight className="h-5 w-5 text-[var(--wc-dash-accent)]" />
                </div>
                <h3 className="min-w-0 text-lg font-medium text-[var(--wc-dash-text)]">{t("workout_builder.session.total_volume")}</h3>
              </div>

              <div className="text-center">
                <div className="mb-1 text-lg font-bold text-[var(--wc-dash-text)]">{totalVolume.toFixed(volumeUnit === "lbs" ? 1 : 0)}</div>
                <div className="flex flex-wrap items-center justify-center gap-1">
                  <button
                    className={cn(
                      "min-h-12 min-w-12 rounded px-3 text-lg transition-colors",
                      volumeUnit === "kg" ? "bg-[var(--wc-dash-accent)] text-[var(--wc-dash-ink)]" : "text-[var(--wc-dash-secondary)]",
                    )}
                    onClick={() => handleVolumeUnitChange("kg")}
                  >
                    kg
                  </button>
                  <span className="text-lg text-[var(--wc-dash-secondary)]">|</span>
                  <button
                    className={cn(
                      "min-h-12 min-w-12 rounded px-3 text-lg transition-colors",
                      volumeUnit === "lbs" ? "bg-[var(--wc-dash-accent)] text-[var(--wc-dash-ink)]" : "text-[var(--wc-dash-secondary)]",
                    )}
                    onClick={() => handleVolumeUnitChange("lbs")}
                  >
                    lbs
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <QuitWorkoutDialog
        exercisesCompleted={exercisesCompleted}
        isOpen={showQuitDialog}
        onClose={() => setShowQuitDialog(false)}
        onQuitWithoutSave={handleQuitWithoutSave}
        totalExercises={totalExercises}
      />
    </>
  );
}
