"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";
import { Button } from "@/components/ui/button";

export const embedQuitButtonClass =
  "w-full !min-h-12 !bg-[var(--wc-dash-error)] !text-lg !text-[var(--wc-dash-ink)] shadow-none hover:!bg-[var(--wc-dash-error)]";

export const embedKeepButtonClass =
  "w-full !min-h-12 border border-[var(--wc-dash-border)] !bg-[var(--wc-dash-panel)] " +
  "!text-lg !text-[var(--wc-dash-text)] shadow-none hover:!bg-[var(--wc-dash-inner)]";

interface EmbedFlowConfirmProps {
  title: string;
  body: string;
  confirmLabel: ReactNode;
  cancelLabel: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  marker?: "quit" | "delete";
  confirmDisabled?: boolean;
  className?: string;
}

export function EmbedFlowConfirm({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  marker,
  confirmDisabled = false,
  className,
}: EmbedFlowConfirmProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);
  const titleId = useId();
  const descriptionId = useId();
  onCancelRef.current = onCancel;

  const restoreTrigger = () => {
    const trigger = triggerRef.current;
    if (trigger?.isConnected) trigger.focus();
  };

  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) triggerRef.current = active;
    cardRef.current?.scrollIntoView({ block: "center" });
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      restoreTrigger();
      onCancelRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className={cn("mb-4 rounded-xl border border-[var(--wc-dash-border)] bg-[var(--wc-dash-panel)] p-4", className)}
      data-wc-delete-confirm={marker === "delete" ? "" : undefined}
      data-wc-embed-confirm=""
      data-wc-quit-confirm={marker === "quit" ? "" : undefined}
      ref={cardRef}
      role="dialog"
    >
      <h3 className="text-lg font-bold text-[var(--wc-dash-text)]" id={titleId}>
        {title}
      </h3>
      <p className="mt-3 text-lg leading-relaxed text-[var(--wc-dash-secondary)]" id={descriptionId}>
        {body}
      </p>
      <div className="mt-4 space-y-3">
        <Button className={embedQuitButtonClass} disabled={confirmDisabled} onClick={onConfirm} type="button">
          {confirmLabel}
        </Button>
        <Button
          className={embedKeepButtonClass}
          onClick={() => {
            restoreTrigger();
            onCancel();
          }}
          ref={cancelRef}
          type="button"
          variant="ghost"
        >
          {cancelLabel}
        </Button>
      </div>
    </div>
  );
}
