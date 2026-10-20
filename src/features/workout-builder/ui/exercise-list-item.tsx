import React, { useCallback, useState } from "react";
import Image from "next/image";
import { Play, Shuffle, Trash2, GripVertical, Loader2, BarChart3 } from "lucide-react";
import { useCurrentLocale, useI18n } from "locales/client";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";

import { ExerciseVideoModal } from "./exercise-video-modal";

import type { ExerciseWithAttributes } from "../types";

import useBoolean from "@/shared/hooks/useBoolean";
import { Button } from "@/components/ui/button";

const MUSCLE_CONFIGS: Record<string, string> = {
  ABDOMINALS: "bg-red-500",
  BICEPS: "bg-purple-500",
  BACK: "bg-blue-500",
  CHEST: "bg-green-500",
  SHOULDERS: "bg-orange-500",
  OBLIQUES: "bg-pink-500",
};

/**
 * Lightweight overlay shown inside DragOverlay while dragging.
 * No drag hooks, no interactivity — pure visual clone.
 */
export function ExerciseListItemOverlay({ exercise, muscle }: { exercise: ExerciseWithAttributes; muscle: string }) {
  const locale = useCurrentLocale();
  const exerciseName = locale === "fr" ? exercise.name : exercise.nameEn;
  const muscleColor = MUSCLE_CONFIGS[muscle] || "bg-gray-500";

  return (
    <div
      className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-600 rounded-lg shadow-2xl shadow-blue-500/20 select-none"
      style={{ scale: "1.03", opacity: 0.95 }}
    >
      <GripVertical className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400 animate-pulse" />
      {exercise.fullVideoImageUrl && (
        <div className="relative h-8 w-8 sm:h-10 sm:w-10 rounded overflow-hidden shrink-0 bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50">
          <Image
            alt={exerciseName ?? ""}
            className="w-full h-full object-cover scale-[1.5]"
            height={32}
            loading="lazy"
            src={exercise.fullVideoImageUrl}
            width={32}
          />
        </div>
      )}
      <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded text-white text-[10px] sm:text-xs font-bold flex items-center justify-center shrink-0 ${muscleColor}`}>
        {muscle.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <span className="block break-words text-lg font-semibold text-slate-900 dark:text-slate-100">{exerciseName}</span>
      </div>
    </div>
  );
}

interface ExerciseListItemProps {
  exercise: ExerciseWithAttributes;
  muscle: string;
  onShuffle: (exerciseId: string, muscle: string) => void;
  onPick: (exerciseId: string) => void;
  onDelete: (exerciseId: string, muscle: string) => void;
  isShuffling?: boolean;
  isActive?: boolean;
  onShuffleFeedback?: () => void;
  onDeleteFeedback?: () => void;
}

export const ExerciseListItem = React.memo(function ExerciseListItem({
  exercise,
  muscle,
  onShuffle,
  onDelete,
  isShuffling,
  isActive,
  onShuffleFeedback,
  onDeleteFeedback,
}: Omit<ExerciseListItemProps, "onPick">) {
  const t = useI18n();
  const locale = useCurrentLocale();
  const playVideo = useBoolean();
  const [modalTab, setModalTab] = useState<"video" | "statistics">("video");

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: exercise.id,
    transition: {
      duration: 200,
      easing: "cubic-bezier(0.25, 1, 0.5, 1)",
    },
  });

  // When this item is being dragged, it becomes a ghost placeholder
  const isGhost = isDragging;

  const exerciseName = locale === "fr" ? exercise.name : exercise.nameEn;
  const muscleTitle = t(("workout_builder.muscles." + muscle.toLowerCase()) as keyof typeof t);

  const handleShuffle = useCallback(() => {
    onShuffleFeedback?.();
    onShuffle(exercise.id, muscle);
  }, [onShuffle, exercise.id, muscle, onShuffleFeedback]);

  const handleDelete = useCallback(() => {
    onDeleteFeedback?.();
    onDelete(exercise.id, muscle);
  }, [onDelete, exercise.id, muscle, onDeleteFeedback]);

  return (
    <div
      className={`border-b select-none transition-all duration-200 ${
        isGhost
          ? "border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/20 rounded-lg"
          : "flex flex-wrap items-center gap-2 sm:gap-3 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
      } p-2 sm:p-3`}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isGhost ? 0 : 1,
        userSelect: "none",
        WebkitUserSelect: "none",
        MozUserSelect: "none",
        msUserSelect: "none",
      }}
    >
      {isGhost ? (
        <div className="h-6 sm:h-8" />
      ) : (
        <>
          <div
            className="flex h-12 w-12 min-h-12 min-w-12 shrink-0 cursor-grab items-center justify-center rounded-md hover:bg-slate-100 active:cursor-grabbing active:bg-blue-100 dark:hover:bg-slate-800 dark:active:bg-blue-900/30 touch-none select-none transition-colors"
            style={{ touchAction: "none" }}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5 text-slate-400 transition-colors group-hover:text-slate-500" />
          </div>

          {exercise.fullVideoImageUrl && (
            <div
              className="relative h-12 w-12 min-h-12 min-w-12 shrink-0 cursor-pointer overflow-hidden rounded border border-slate-200 bg-slate-200 dark:border-slate-700/50 dark:bg-slate-800"
              onClick={() => { setModalTab("video"); playVideo.setTrue(); }}
            >
              <Image
                alt={exerciseName ?? ""}
                className="w-full h-full object-cover scale-[1.5]"
                height={32}
                loading="lazy"
                src={exercise.fullVideoImageUrl}
                width={32}
              />
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                <Play className="h-3 w-3 text-white fill-current" />
              </div>
            </div>
          )}

          <span className="inline-flex min-h-12 items-center rounded-md border border-[var(--wc-dash-border)] bg-[var(--wc-dash-inner)] px-3 text-lg font-bold text-[var(--wc-dash-text)]">
            {muscleTitle}
          </span>

          <div className="min-w-[120px] flex-1" data-wc-exercise-name="">
            <span className="block break-words text-lg font-medium text-[var(--wc-dash-text)]">{exerciseName}</span>
          </div>

          <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
            <Button
              className="!min-h-12 !border-[var(--wc-dash-border)] !text-lg !text-[var(--wc-dash-text)] hover:!scale-100 touch-manipulation"
              disabled={isShuffling}
              onClick={handleShuffle}
              variant="outline"
            >
              {isShuffling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />}
              <span>{t("workout_builder.exercise.shuffle")}</span>
            </Button>

            {exercise.fullVideoUrl ? (
              <button
                className="inline-flex min-h-12 items-center gap-1 px-2 text-lg text-[var(--wc-dash-text)]"
                onClick={() => {
                  setModalTab("video");
                  playVideo.setTrue();
                }}
                type="button"
              >
                <Play className="h-4 w-4" />
                <span>{t("workout_builder.exercise.watch_video")}</span>
              </button>
            ) : null}

            <button
              aria-label={t("statistics.title")}
              className="inline-flex min-h-12 min-w-12 items-center justify-center p-1 text-[var(--wc-dash-text)]"
              onClick={() => { setModalTab("statistics"); playVideo.setTrue(); }}
              type="button"
            >
              <BarChart3 className="h-5 w-5" />
            </button>

            <button
              className="inline-flex min-h-12 items-center gap-1 px-2 text-lg text-[var(--wc-dash-error)]"
              onClick={handleDelete}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              <span>{t("workout_builder.exercise.remove")}</span>
            </button>
          </div>

          {exercise.fullVideoUrl && <ExerciseVideoModal defaultTab={modalTab} exercise={exercise} onOpenChange={playVideo.toggle} open={playVideo.value} />}
        </>
      )}
    </div>
  );
});
