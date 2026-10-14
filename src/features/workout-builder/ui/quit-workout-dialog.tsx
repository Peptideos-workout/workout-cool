"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import { useI18n } from "locales/client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface QuitWorkoutDialogProps {
  isOpen: boolean;
  onClose: VoidFunction;
  onQuitWithoutSave: VoidFunction;
  exercisesCompleted: number;
  totalExercises: number;
}

export function QuitWorkoutDialog({ isOpen, onClose, onQuitWithoutSave, exercisesCompleted, totalExercises }: QuitWorkoutDialogProps) {
  const t = useI18n();

  return (
    <Dialog onOpenChange={onClose} open={isOpen}>
      <DialogContent className="max-w-md border border-[var(--wc-dash-border)] bg-[var(--wc-dash-panel)]">
        <DialogHeader className="pb-6">
          <DialogTitle className="flex items-center gap-3 text-lg font-bold text-[var(--wc-dash-text)]">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--wc-dash-inner)]">
              <AlertTriangle className="h-5 w-5 text-[var(--wc-dash-error)]" />
            </div>
            {t("workout_builder.session.quit_workout_title")}
          </DialogTitle>
        </DialogHeader>

        {/* Progress Summary */}
        <div className="mb-6 rounded-xl border border-[var(--wc-dash-border)] bg-[var(--wc-dash-inner)] p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-lg text-[var(--wc-dash-secondary)]">{t("workout_builder.session.progress")}</span>
              <span className="text-lg font-bold text-[var(--wc-dash-text)]">
                {exercisesCompleted} / {totalExercises}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-[var(--wc-dash-card)]">
              <div
                className="h-full rounded-full bg-[var(--wc-dash-accent)] transition-all duration-300"
                style={{ width: `${(exercisesCompleted / totalExercises) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Warning Message */}
        <div className="mb-6 text-center">
          <p className="text-lg leading-relaxed text-[var(--wc-dash-secondary)]">{t("workout_builder.session.quit_warning")}</p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {/* Quit without saving */}
          <Button
            className="w-full border-0 bg-transparent !text-lg !text-[var(--wc-dash-error)] shadow-none hover:bg-transparent !min-h-12"
            onClick={onQuitWithoutSave}
            size="large"
            variant="ghost"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t("workout_builder.session.quit_without_save")}
          </Button>

          {/* Cancel */}
          <Button
            className={
              "w-full border border-[var(--wc-dash-border)] shadow-none " +
              "hover:bg-transparent !min-h-12 !text-lg !text-[var(--wc-dash-text)]"
            }
            onClick={onClose}
            size="large"
            variant="ghost"
          >
            {t("workout_builder.session.continue_workout")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
