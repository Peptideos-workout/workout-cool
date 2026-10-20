"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useI18n } from "locales/client";

import { EmbedFlowConfirm, embedKeepButtonClass, embedQuitButtonClass } from "@/shared/ui/embed-flow-confirm";
import { useIsEmbedDocument } from "@/shared/lib/use-is-embed-document";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// A second tap is often 80-300ms after the first. Hold a failed quit long enough to ignore it.
const DOUBLE_ACTIVATION_GUARD_MS = 500;

interface QuitWorkoutDialogProps {
  isOpen: boolean;
  onClose: VoidFunction;
  onQuitWithoutSave: VoidFunction;
  exercisesCompleted: number;
  totalExercises: number;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
}

export function QuitWorkoutDialog({
  isOpen,
  onClose,
  onQuitWithoutSave,
  exercisesCompleted,
  totalExercises,
  returnFocusRef,
}: QuitWorkoutDialogProps) {
  const t = useI18n();
  const isEmbed = useIsEmbedDocument();
  const confirmLock = useRef(false);
  const pendingTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const [isConfirming, setIsConfirming] = useState(false);

  const clearPendingTimers = () => {
    for (const id of pendingTimers.current) clearTimeout(id);
    pendingTimers.current = [];
  };

  const releaseConfirm = () => {
    clearPendingTimers();
    confirmLock.current = false;
    setIsConfirming(false);
  };

  const handleConfirm = async () => {
    if (confirmLock.current) return;
    confirmLock.current = true;
    const lockedAt = Date.now();
    clearPendingTimers();
    pendingTimers.current.push(setTimeout(() => setIsConfirming(true), 0));
    let failed = false;
    try {
      await onQuitWithoutSave();
    } catch (error) {
      failed = true;
      // window.reportError fires the same error event as a thrown click handler. It is missing before Safari 15.4.
      (typeof globalThis.reportError === "function" ? globalThis.reportError : console.error)(error);
    } finally {
      if (failed) {
        const remaining = DOUBLE_ACTIVATION_GUARD_MS - (Date.now() - lockedAt);
        if (remaining > 0) {
          await new Promise<void>((resolve) => {
            pendingTimers.current.push(setTimeout(resolve, remaining));
          });
        }
        releaseConfirm();
      }
    }
  };

  useEffect(() => {
    if (isOpen || confirmLock.current) return;
    releaseConfirm();
  }, [isOpen]);

  useEffect(
    () => () => {
      clearPendingTimers();
    },
    [],
  );

  if (isEmbed) {
    if (!isOpen) return null;
    return (
      <EmbedFlowConfirm
        body={t("workout_builder.session.embed_quit_warning")}
        cancelLabel={t("workout_builder.session.embed_quit_cancel")}
        confirmDisabled={isConfirming}
        confirmLabel={
          <>
            <Trash2 className="mr-2 h-4 w-4" />
            {t("workout_builder.session.embed_quit_confirm")}
          </>
        }
        marker="quit"
        onCancel={onClose}
        onConfirm={handleConfirm}
        title={t("workout_builder.session.embed_quit_title")}
        triggerRef={returnFocusRef}
      />
    );
  }

  return (
    <Dialog onOpenChange={onClose} open={isOpen}>
      <DialogContent
        className="max-w-md border border-[var(--wc-dash-border)] bg-[var(--wc-dash-panel)] [&>button]:!h-12 [&>button]:!w-12"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef?.current?.focus();
        }}
      >
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
          <Button className={embedQuitButtonClass} disabled={isConfirming} onClick={handleConfirm} size="large" type="button">
            <Trash2 className="h-4 w-4 mr-2" />
            {t("workout_builder.session.quit_without_save")}
          </Button>

          <Button className={embedKeepButtonClass} onClick={onClose} size="large" type="button" variant="ghost">
            {t("workout_builder.session.continue_workout")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
