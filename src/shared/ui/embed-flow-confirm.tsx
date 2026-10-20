"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";

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
  triggerRef?: RefObject<HTMLButtonElement | null>;
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
  triggerRef,
}: EmbedFlowConfirmProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const fallbackTriggerRef = useRef<HTMLElement | null>(null);
  const triggerRefProp = useRef(triggerRef);
  const onCancelRef = useRef(onCancel);
  const titleId = useId();
  const descriptionId = useId();
  triggerRefProp.current = triggerRef;
  onCancelRef.current = onCancel;

  const restoreTrigger = () => {
    const explicit = triggerRefProp.current;
    if (explicit) {
      if (explicit.current?.isConnected) explicit.current.focus();
      return;
    }
    const fallback = fallbackTriggerRef.current;
    if (fallback?.isConnected) fallback.focus();
  };

  useEffect(() => {
    if (!triggerRefProp.current) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) fallbackTriggerRef.current = active;
    }
    cardRef.current?.scrollIntoView({ block: "center" });
    titleRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        restoreTrigger();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const card = cardRef.current;
      if (!card) return;
      const buttons = [...card.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
      if (buttons.length === 0) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      const active = document.activeElement;
      const activeButton = active instanceof HTMLButtonElement && buttons.includes(active) ? active : null;
      if (event.shiftKey) {
        if (!activeButton || activeButton === first) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (!activeButton || activeButton === last) {
        event.preventDefault();
        first.focus();
      }
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
      <h3 className="text-lg font-bold text-[var(--wc-dash-text)]" id={titleId} ref={titleRef} tabIndex={-1}>
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
          type="button"
          variant="ghost"
        >
          {cancelLabel}
        </Button>
      </div>
    </div>
  );
}
