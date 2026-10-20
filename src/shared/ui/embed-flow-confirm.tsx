"use client";

import { useEffect, useRef, type ReactNode } from "react";

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
  className,
}: EmbedFlowConfirmProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    cardRef.current?.scrollIntoView({ block: "center" });
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancelRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div
      aria-labelledby="wc-embed-confirm-title"
      aria-modal="true"
      className={cn("mb-4 rounded-xl border border-[var(--wc-dash-border)] bg-[var(--wc-dash-panel)] p-4", className)}
      data-wc-delete-confirm={marker === "delete" ? "" : undefined}
      data-wc-embed-confirm=""
      data-wc-quit-confirm={marker === "quit" ? "" : undefined}
      ref={cardRef}
      role="dialog"
    >
      <h3 className="text-lg font-bold text-[var(--wc-dash-text)]" id="wc-embed-confirm-title">
        {title}
      </h3>
      <p className="mt-3 text-lg leading-relaxed text-[var(--wc-dash-secondary)]">{body}</p>
      <div className="mt-4 space-y-3">
        <Button className={embedQuitButtonClass} onClick={onConfirm} type="button">
          {confirmLabel}
        </Button>
        <Button className={embedKeepButtonClass} onClick={onCancel} ref={cancelRef} type="button" variant="ghost">
          {cancelLabel}
        </Button>
      </div>
    </div>
  );
}
