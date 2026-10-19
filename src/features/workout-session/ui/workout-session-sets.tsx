"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Play, ArrowRight, Trophy as TrophyIcon, Plus, Hourglass } from "lucide-react";
import { useCurrentLocale, useI18n } from "locales/client";
import confetti from "canvas-confetti";
import TrophyImg from "@public/images/trophy.png";

import { FavoriteExerciseButton } from "../../workout-builder/ui/favorite-exercise-button";
import { WorkoutSessionSet } from "./workout-session-set";

import { cn } from "@/shared/lib/utils";
import { useWorkoutFeedback } from "@/shared/hooks/use-workout-feedback";
import { useWorkoutSession } from "@/features/workout-session/model/use-workout-session";
import { useSyncWorkoutSessions } from "@/features/workout-session/model/use-sync-workout-sessions";
import { ExerciseVideoModal } from "@/features/workout-builder/ui/exercise-video-modal";
import { useSyncFavoriteExercises } from "@/features/workout-builder/hooks/use-sync-favorite-exercises";
import { env } from "@/env";
import { PremiumUpsellAlert } from "@/components/ui/premium-upsell-alert";
import { Button } from "@/components/ui/button";
import { HorizontalBottomBanner } from "@/components/ads";

const secondaryButton =
  "!min-h-12 !border !border-[var(--wc-dash-border)] !bg-[var(--wc-dash-panel)] " +
  "!text-lg !text-[var(--wc-dash-text)] shadow-none hover:!bg-[var(--wc-dash-inner)]";
const accentButton = "!min-h-12 !bg-[var(--wc-dash-accent)] !text-lg !text-[var(--wc-dash-ink)] hover:!bg-[var(--wc-dash-accent)]";

export function WorkoutSessionSets({
  showCongrats,
  onCongrats,
  isWorkoutActive,
}: {
  showCongrats: boolean;
  onCongrats: VoidFunction;
  isWorkoutActive: boolean;
}) {
  const t = useI18n();
  const router = useRouter();
  const locale = useCurrentLocale();
  const { currentExerciseIndex, session, addSet, updateSet, removeSet, finishSet, goToNextExercise, goToExercise, completeWorkout } =
    useWorkoutSession();
  const exerciseDetailsMap = Object.fromEntries(session?.exercises.map((ex) => [ex.id, ex]) || []);
  const [videoModal, setVideoModal] = useState<{ open: boolean; exerciseId?: string }>({ open: false });
  const { syncSessions } = useSyncWorkoutSessions();
  const prevExerciseIndexRef = useRef<number>(currentExerciseIndex);
  const { syncFavoriteExercises } = useSyncFavoriteExercises();
  const feedback = useWorkoutFeedback();

  // auto-scroll to current exercise when index changes (but not when adding sets)
  useEffect(() => {
    if (session && currentExerciseIndex >= 0 && prevExerciseIndexRef.current !== currentExerciseIndex) {
      const exerciseElement = document.getElementById(`exercise-${currentExerciseIndex}`);
      if (exerciseElement) {
        const scrollContainer = exerciseElement.closest(".overflow-auto");

        if (scrollContainer) {
          const containerRect = scrollContainer.getBoundingClientRect();
          const elementRect = exerciseElement.getBoundingClientRect();
          const offset = 10;

          const scrollTop = scrollContainer.scrollTop + elementRect.top - containerRect.top - offset;

          scrollContainer.scrollTo({
            top: scrollTop,
            behavior: "smooth",
          });
        } else {
          exerciseElement.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      }
      prevExerciseIndexRef.current = currentExerciseIndex;
    }
  }, [currentExerciseIndex, session]);

  if (showCongrats) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-16">
        <Image
          alt={`${t("workout_builder.session.complete")} ${t("workout_builder.session.trophy")}`}
          className="h-56 w-56"
          src={TrophyImg}
        />
        <h2 className="mb-2 text-2xl font-bold text-[var(--wc-dash-text)]">{t("workout_builder.session.complete") + " ! 🎉"}</h2>
        <p className="mb-6 text-lg text-[var(--wc-dash-secondary)]">{t("workout_builder.session.workout_in_progress")}</p>
        <Button
          className="!min-h-12 !bg-[var(--wc-dash-accent)] !text-lg !text-[var(--wc-dash-ink)] hover:!bg-[var(--wc-dash-accent)]"
          onClick={() => router.push("/profile")}
        >
          {t("commons.go_to_profile")}
        </Button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="py-12 text-center text-lg text-[var(--wc-dash-secondary)]">{t("workout_builder.session.no_exercise_selected")}</div>
    );
  }

  const handleExerciseClick = (targetIndex: number) => {
    if (targetIndex !== currentExerciseIndex) {
      goToExercise(targetIndex);
    }
  };

  const renderStepIcon = (idx: number, allSetsCompleted: boolean) => {
    if (allSetsCompleted) {
      return (
        <span aria-label={t("workout_builder.session.exercise_complete")} className="text-lg font-semibold text-[var(--wc-dash-ink)]" role="img">
          ✓
        </span>
      );
    }
    if (idx === currentExerciseIndex) {
      return (
        <svg
          aria-label={t("workout_builder.session.exercise_in_progress")}
          className="h-6 w-6 animate-ping text-[var(--wc-dash-ink)]"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="12" />
        </svg>
      );
    }

    return <Hourglass aria-label={t("workout_builder.session.exercise_in_progress")} className="h-6 w-6 text-[var(--wc-dash-secondary)]" />;
  };

  const renderStepBackground = (idx: number, allSetsCompleted: boolean) => {
    if (allSetsCompleted) {
      return "border-[var(--wc-dash-accent)] bg-[var(--wc-dash-accent)] text-[var(--wc-dash-ink)]";
    }
    if (idx === currentExerciseIndex) {
      return "border-[var(--wc-dash-accent)] bg-[var(--wc-dash-accent)] text-[var(--wc-dash-ink)]";
    }
    return "border-[var(--wc-dash-border)] bg-[var(--wc-dash-inner)] text-[var(--wc-dash-secondary)]";
  };

  const handleAddSet = () => {
    feedback.onAddSet();
    addSet();
  };

  const handleNextExercise = () => {
    feedback.onNextExercise();
    goToNextExercise();
  };

  const handleFinishSet = (exerciseIdx: number, setIdx: number) => {
    feedback.onFinishSet();
    finishSet(exerciseIdx, setIdx);
  };

  const handleFinishSession = () => {
    feedback.onFinishWorkout();
    completeWorkout();
    syncFavoriteExercises();
    syncSessions();
    onCongrats();
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-3 max-sm:pb-[calc(var(--wc-nav-h)+168px)] sm:px-6 sm:pb-40">
      <div className="mb-6">
        <PremiumUpsellAlert />
      </div>
      <ol className="relative ml-6 border-l-2 border-[var(--wc-dash-border)] pl-4">
        {session.exercises.map((ex, idx) => {
          const allSetsCompleted = ex.sets.length > 0 && ex.sets.every((set) => set.completed);
          const exerciseName = locale === "fr" ? ex.name : ex.nameEn;

          const details = exerciseDetailsMap[ex.id];
          return (
            <li
              className={`mb-8 ml-2 md:ml-4 ${idx !== currentExerciseIndex ? "cursor-pointer hover:opacity-80" : ""}`}
              id={`exercise-${idx}`}
              key={ex.id}
              onClick={() => handleExerciseClick(idx)}
            >
              {/* Cercle étape */}
              <span
                className={cn(
                  "absolute -left-6 z-10 flex h-12 w-12 min-h-12 min-w-12 items-center justify-center rounded-full border-2",
                  renderStepBackground(idx, allSetsCompleted),
                )}
              >
                {renderStepIcon(idx, allSetsCompleted)}
              </span>
              {/* Image + nom de l'exercice */}
              <div className="ml-2 flex flex-col gap-3 hover:opacity-80 sm:flex-row sm:items-start">
                {details?.fullVideoUrl ? (
                  <div
                    className="flex w-full max-w-full shrink-0 flex-col gap-2 sm:max-w-60"
                    onClick={(e) => {
                      e.stopPropagation();
                      setVideoModal({ open: true, exerciseId: ex.id });
                    }}
                  >
                    {details.fullVideoImageUrl && (
                      <div
                        className={
                          "relative aspect-video overflow-hidden rounded-lg " +
                          "border border-[var(--wc-dash-border)] bg-[var(--wc-dash-inner)]"
                        }
                      >
                        <Image
                          alt={exerciseName || t("workout_builder.session.exercise_image")}
                          className="h-full w-full object-cover"
                          height={48}
                          src={details.fullVideoImageUrl}
                          width={48}
                        />
                      </div>
                    )}
                    <Button className={`${secondaryButton} w-full`} type="button" variant="ghost">
                      <Play className="h-5 w-5" />
                      {t("workout_builder.exercise.watch_video")}
                    </Button>
                  </div>
                ) : details?.fullVideoImageUrl ? (
                  <div className="flex w-full max-w-full shrink-0 flex-col gap-2 sm:max-w-60">
                    <div
                      className={
                        "relative aspect-video overflow-hidden rounded-lg " +
                        "border border-[var(--wc-dash-border)] bg-[var(--wc-dash-inner)]"
                      }
                    >
                      <Image
                        alt={exerciseName || t("workout_builder.session.exercise_image")}
                        className="h-full w-full object-cover"
                        height={48}
                        src={details.fullVideoImageUrl}
                        width={48}
                      />
                    </div>
                  </div>
                ) : null}
                <div
                  className={cn(
                    "flex-1 text-lg leading-[1.3]",
                    idx === currentExerciseIndex ? "font-bold text-[var(--wc-dash-accent)]" : "text-[var(--wc-dash-text)]",
                  )}
                >
                  <span className="flex-1 text-lg leading-[1.3]">{exerciseName}</span>
                  {details?.introduction && (
                    <span
                      className="mt-1 flex min-h-12 cursor-pointer items-center text-lg text-[var(--wc-dash-link)] underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setVideoModal({ open: true, exerciseId: ex.id });
                      }}
                    >
                      {t("workout_builder.session.see_instructions")}
                    </span>
                  )}
                </div>
              </div>
              {/* Modale vidéo */}
              {details && details.fullVideoUrl && videoModal.open && videoModal.exerciseId === ex.id && (
                <ExerciseVideoModal
                  exercise={details}
                  onOpenChange={(open) => setVideoModal({ open, exerciseId: open ? ex.id : undefined })}
                  open={videoModal.open}
                />
              )}
              {/* Si exercice courant, afficher le détail */}
              {idx === currentExerciseIndex && (
                <div className="mb-10 mt-6 rounded-xl border border-[var(--wc-dash-border)] bg-[var(--wc-dash-card)]">
                  {/* Liste des sets */}
                  <div className="flex justify-start items-center gap-2">
                    <FavoriteExerciseButton className="!h-auto !min-h-12 !min-w-12 !whitespace-normal" exerciseId={ex.id} />
                  </div>
                  <div className="space-y-10 mb-8">
                    {ex.sets.map((set, setIdx) => (
                      <WorkoutSessionSet
                        key={set.id}
                        onChange={(sIdx: number, data: Partial<typeof set>) => updateSet(idx, sIdx, data)}
                        onFinish={() => handleFinishSet(idx, setIdx)}
                        onRemove={() => {
                          feedback.onDelete();
                          removeSet(idx, setIdx);
                        }}
                        set={set}
                        setIndex={setIdx}
                      />
                    ))}
                  </div>
                  {/* Actions bas de page */}
                  <div className="mt-2 flex w-full min-w-0 flex-col gap-3 px-2 md:flex-row">
                    <Button
                      aria-label={t("workout_builder.session.add_set")}
                      className={`${secondaryButton} min-w-0 flex-1 !whitespace-normal font-bold`}
                      onClick={handleAddSet}
                    >
                      <Plus className="h-5 w-5" />
                      {t("workout_builder.session.add_set")}
                    </Button>
                    <Button
                      aria-label={t("workout_builder.session.next_exercise")}
                      className={`${secondaryButton} min-w-0 flex-1 !whitespace-normal font-bold`}
                      onClick={handleNextExercise}
                    >
                      {t("workout_builder.session.next_exercise")}
                      <ArrowRight className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {isWorkoutActive && (
        <div className="flex justify-center mt-8 mb-4">
          <Button
            aria-label={t("workout_builder.session.finish_session")}
            className={`${accentButton} px-8 font-bold`}
            onClick={handleFinishSession}
          >
            <TrophyIcon className="h-6 w-6" />
            {t("workout_builder.session.finish_session")}
          </Button>
        </div>
      )}

      {(env.NEXT_PUBLIC_BOTTOM_WORKOUT_SESSION_BANNER_AD_SLOT || env.NEXT_PUBLIC_EZOIC_BOTTOM_WORKOUT_SESSION_PLACEMENT_ID) && (
        <HorizontalBottomBanner
          adSlot={env.NEXT_PUBLIC_BOTTOM_WORKOUT_SESSION_BANNER_AD_SLOT}
          ezoicPlacementId={env.NEXT_PUBLIC_EZOIC_BOTTOM_WORKOUT_SESSION_PLACEMENT_ID}
        />
      )}
    </div>
  );
}
