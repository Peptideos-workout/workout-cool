import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Repeat2, Trash2 } from "lucide-react";
import { useCurrentLocale, useI18n } from "locales/client";
import { ExerciseAttributeNameEnum } from "@prisma/client";

import { EmbedFlowConfirm } from "@/shared/ui/embed-flow-confirm";
import { useWorkoutSessionService } from "@/shared/lib/workout-session/use-workout-session.service";
import { useIsEmbedDocument } from "@/shared/lib/use-is-embed-document";
import { useWorkoutFeedback } from "@/shared/hooks/use-workout-feedback";
import { useWorkoutSessions } from "@/features/workout-session/model/use-workout-sessions";
import { useWorkoutBuilderStore } from "@/features/workout-builder/model/workout-builder.store";
import { getExerciseAttributesValueOf, getPrimaryMuscle, getAttributeValue } from "@/entities/exercise/shared/muscles";
import { Link } from "@/components/ui/link";
import { Button } from "@/components/ui/button";

const BADGE_COLORS = [
  "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900 dark:text-blue-100 dark:border-blue-800",
  "bg-green-100 text-green-700 border-green-300 dark:bg-green-900 dark:text-green-100 dark:border-green-800",
  "bg-red-100 text-red-700 border-red-300 dark:bg-red-900 dark:text-red-300 dark:border-red-700",
  "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900 dark:text-purple-100 dark:border-purple-800",
  "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900 dark:text-orange-100 dark:border-orange-800",
  "bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-900 dark:text-pink-100 dark:border-pink-800",
];

export function WorkoutSessionList() {
  const locale = useCurrentLocale();
  const t = useI18n();
  const router = useRouter();
  const loadFromSession = useWorkoutBuilderStore((s) => s.loadFromSession);
  const { remove } = useWorkoutSessionService();
  const feedback = useWorkoutFeedback();

  const { data: sessions = [], refetch } = useWorkoutSessions();
  const activeSession = sessions.find((s) => s.status === "active");
  const isEmbed = useIsEmbedDocument();
  const deleteLock = useRef(false);
  const deleteDisableTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (deleteDisableTimer.current) clearTimeout(deleteDisableTimer.current);
    },
    [],
  );
  const deleteButtonRefs = useRef(new Map<string, { current: HTMLButtonElement | null }>());
  const historyHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusAfterDeleteId = useRef<string | null>(null);
  const focusAfterDeleteIndex = useRef<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const deletedId = focusAfterDeleteId.current;
    if (!deletedId) return;
    if (sessions.some((session) => session.id === deletedId)) return;
    const index = focusAfterDeleteIndex.current ?? -1;
    focusAfterDeleteId.current = null;
    focusAfterDeleteIndex.current = null;
    const nextSession = sessions[index] ?? (index > 0 ? sessions[index - 1] : undefined);
    const nextButton = nextSession ? deleteButtonRefs.current.get(nextSession.id)?.current : null;
    if (nextButton?.isConnected) {
      nextButton.focus();
      return;
    }
    historyHeadingRef.current?.focus();
  }, [sessions]);

  const deleteTriggerRef = (id: string) => {
    const existing = deleteButtonRefs.current.get(id);
    if (existing) return existing;
    const created = { current: null };
    deleteButtonRefs.current.set(id, created);
    return created;
  };

  const removeSession = async (id: string) => {
    try {
      feedback.onDelete();
      await remove(id);
      refetch();
      return true;
    } catch (error) {
      console.error("Error deleting session:", error);
      alert("Error deleting session");
      focusAfterDeleteId.current = null;
      focusAfterDeleteIndex.current = null;
      return false;
    }
  };

  const handleDelete = (id: string) => {
    if (isEmbed) {
      setPendingDeleteId(id);
      return;
    }

    const confirmed = window.confirm(t("workout_builder.confirm_delete"));
    if (!confirmed) return;
    void removeSession(id);
  };

  const handleConfirmDelete = () => {
    if (deleteLock.current || !pendingDeleteId) return;
    deleteLock.current = true;
    const id = pendingDeleteId;
    focusAfterDeleteId.current = id;
    focusAfterDeleteIndex.current = sessions.findIndex((session) => session.id === id);
    if (deleteDisableTimer.current) clearTimeout(deleteDisableTimer.current);
    deleteDisableTimer.current = setTimeout(() => setIsDeleting(true), 0);
    void removeSession(id).then((deleted) => {
      if (deleteDisableTimer.current) clearTimeout(deleteDisableTimer.current);
      deleteLock.current = false;
      setIsDeleting(false);
      setPendingDeleteId(null);
      if (deleted) return;
      const trigger = deleteButtonRefs.current.get(id);
      queueMicrotask(() => {
        const button = trigger?.current;
        if (button?.isConnected) {
          button.focus();
          return;
        }
        historyHeadingRef.current?.focus();
      });
    });
  };

  const handleRepeat = (id: string) => {
    feedback.onNextExercise();
    const sessionToCopy = sessions.find((s) => s.id === id);
    if (!sessionToCopy) return;

    const allEquipment = Array.from(
      new Set(
        sessionToCopy.exercises.flatMap((ex) => getExerciseAttributesValueOf(ex, ExerciseAttributeNameEnum.EQUIPMENT)).filter(Boolean),
      ),
    );

    // Utilise les muscles stockés dans la session, sinon fallback sur les muscles primaires des exercices
    const allMuscles =
      sessionToCopy.muscles && sessionToCopy.muscles.length > 0
        ? sessionToCopy.muscles
        : Array.from(
            new Set(
              sessionToCopy.exercises
                .flatMap((ex) => getExerciseAttributesValueOf(ex, ExerciseAttributeNameEnum.PRIMARY_MUSCLE))
                .filter(Boolean),
            ),
          );

    const exercisesByMuscle = allMuscles.map((muscle) => ({
      muscle,
      exercises: sessionToCopy.exercises
        .filter((ex) => {
          const primaryMuscle = getPrimaryMuscle(ex.attributes || []);
          return primaryMuscle && getAttributeValue(primaryMuscle) === muscle;
        })
        .map((ex) => ({
          ...ex,
          id: ex.id,
          workoutSessionId: sessionToCopy.id,
          exerciseId: ex.id,
          order: ex.order,
        })),
    }));

    const exercisesOrder = sessionToCopy.exercises.map((ex) => ex.id);

    // 5. inject in the builder and go step 3
    loadFromSession({
      equipment: allEquipment,
      muscles: allMuscles,
      exercisesByMuscle,
      exercisesOrder,
    });
    router.push("/?fromSession=1");
  };

  return (
    <div className="space-y-4 mt-10">
      <h2 className="text-xl font-bold mt-5 mb-2 text-slate-900 dark:text-slate-200" ref={historyHeadingRef} tabIndex={-1}>
        {t("workout_builder.session.history", { count: sessions.length })}
      </h2>
      {sessions.length === 0 && <div className="text-slate-500 dark:text-slate-400">{t("workout_builder.session.no_workout_yet")}</div>}
      <ul className="divide-y divide-slate-200 dark:divide-slate-700/50">
        {sessions.map((session) => {
          const isActive = session.status === "active";
          return (
            <li
              className="px-2 flex flex-col sm:flex-row items-start sm:items-center justify-between py-4 gap-2 sm:gap-0 hover:bg-slate-50 dark:hover:bg-slate-800/70 rounded-lg space-x-4"
              key={session.id}
            >
              <div className="flex items-center flex-col">
                <span className="font-bold text-base tabular-nums text-slate-900 dark:text-slate-200">
                  {new Date(session.startedAt).toLocaleDateString(locale)}
                </span>
                <span className="text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                  {t("workout_builder.session.start") || "start"}
                  {" : "}
                  {new Date(session.startedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                </span>
                {session.endedAt && (
                  <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {t("workout_builder.session.end") || "end"}
                    {" : "}
                    {new Date(session.endedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
                {session.muscles && session.muscles.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1 justify-center">
                    {session.muscles.map((muscle, idx) => (
                      <span
                        className={`inline-block border rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE_COLORS[idx % BADGE_COLORS.length]}`}
                        key={muscle}
                      >
                        {t(("workout_builder.muscles." + muscle.toLowerCase()) as keyof typeof t)}
                      </span>
                    ))}
                  </div>
                )}
                {session.status === "active" && (
                  <div className="relative mt-1">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300 text-xs font-semibold">
                      {t("commons.in_progress")}
                    </span>
                    <span className="absolute top-0 right-0 w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 flex-1">
                {session.exercises?.map((ex, idx) => {
                  const exerciseName = locale === "fr" ? ex.name : ex.nameEn;
                  return (
                    <span
                      className={`inline-block border rounded-full px-1 text-xs font-semibold ${BADGE_COLORS[idx % BADGE_COLORS.length]}`}
                      key={ex.id}
                    >
                      {exerciseName?.toUpperCase() || t("workout_builder.session.exercise")}
                    </span>
                  );
                })}
              </div>
              <div className={isEmbed ? "flex w-full min-w-0 flex-col gap-2 sm:w-72" : "flex gap-2 items-center mt-2 sm:mt-0"}>
                {isEmbed && pendingDeleteId === session.id ? (
                  <EmbedFlowConfirm
                    body={t("workout_builder.confirm_delete")}
                    cancelLabel={t("commons.cancel")}
                    confirmDisabled={isDeleting}
                    confirmLabel={t("workout_builder.session.delete")}
                    marker="delete"
                    onCancel={() => setPendingDeleteId(null)}
                    onConfirm={handleConfirmDelete}
                    title={t("workout_builder.session.delete_workout_title")}
                    triggerRef={deleteTriggerRef(session.id)}
                  />
                ) : null}
                <div className="flex gap-2 items-center">
                  {isActive && (
                    <Link className="w-auto flex items-center gap-2 flex-col" href="/" variant="nav">
                      <Play className="w-7 h-7 text-blue-500 dark:text-blue-400" />
                      <span className="sr-only">{t("workout_builder.session.back_to_workout")}</span>
                      <span>{t("workout_builder.session.back_to_workout")}</span>
                    </Link>
                  )}
                  {!isActive && (
                    <div
                      className="tooltip tooltip-left"
                      data-tip={
                        activeSession ? t("workout_builder.session.already_have_a_active_session") : t("workout_builder.session.repeat")
                      }
                    >
                      <Button
                        aria-label={t("workout_builder.session.repeat")}
                        className="w-12 h-12"
                        disabled={!!activeSession}
                        onClick={() => handleRepeat(session.id)}
                        size="icon"
                        variant="ghost"
                      >
                        <Repeat2 className="w-7 h-7 text-blue-500 dark:text-blue-400" />
                      </Button>
                    </div>
                  )}

                  {!isActive && (
                    <div className="tooltip" data-tip={t("workout_builder.session.delete")}>
                      <Button
                        aria-label={t("workout_builder.session.delete")}
                        onClick={() => handleDelete(session.id)}
                        ref={deleteTriggerRef(session.id)}
                        size="icon"
                        variant="ghost"
                      >
                        <Trash2 className="w-7 h-7 text-red-500 dark:text-red-400" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {/* TODO: create a new workout */}
    </div>
  );
}
