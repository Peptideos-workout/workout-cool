"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";

import { cn } from "@/shared/lib/utils";
import { Button } from "@/components/ui/button";

let embedTitleOpenedFromKeyboard = false;

const rememberEmbedTitleKey = (event: KeyboardEvent) => {
  if (event.key === "Enter" || event.key === " ") embedTitleOpenedFromKeyboard = true;
};

const forgetEmbedTitleKey = () => {
  embedTitleOpenedFromKeyboard = false;
};

if (typeof document !== "undefined") {
  document.addEventListener("keydown", rememberEmbedTitleKey, true);
  document.addEventListener("pointerdown", forgetEmbedTitleKey, true);
  document.addEventListener("mousedown", forgetEmbedTitleKey, true);
  document.addEventListener("touchstart", forgetEmbedTitleKey, true);
}

// The shared Button fades box-shadow over 300ms, which would draw this ring transparent.
const embedFocusRingClass =
  "transition-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
  "focus-visible:ring-[var(--wc-dash-text)] focus-visible:ring-offset-[var(--wc-dash-panel)]";

// titleRef.focus() runs on every open. :focus would paint this ring after a tap.
// :focus-visible keeps it for a keyboard open, and outline-none stays on for both.
const embedTitleFocusClass =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
  "focus-visible:ring-[var(--wc-dash-text)] focus-visible:ring-offset-[var(--wc-dash-panel)]";

export const embedQuitButtonClass =
  "w-full !min-h-12 !bg-[var(--wc-dash-error)] !text-lg !text-[var(--wc-dash-ink)] shadow-none hover:!bg-[var(--wc-dash-error)] " +
  embedFocusRingClass;

export const embedKeepButtonClass =
  "w-full border border-[var(--wc-dash-border)] shadow-none " +
  "hover:bg-transparent !min-h-12 !text-lg !text-[var(--wc-dash-text)] " +
  embedFocusRingClass;

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
    // WebKit ignores :focus-visible on that script focus, and ignores a second focus() while it is already focused.
    if (embedTitleOpenedFromKeyboard && titleRef.current) {
      const title = titleRef.current;
      title.blur();
      // This repo's DOM types omit FocusOptions.focusVisible. The browser still honors it.
      title.focus({ focusVisible: true } as unknown as FocusOptions);
    }
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
          // Tab is keyboard input. WebKit does not match :focus-visible for a plain focus() here.
          last.focus({ focusVisible: true } as unknown as FocusOptions);
        }
        return;
      }
      if (!activeButton || activeButton === last) {
        event.preventDefault();
        first.focus({ focusVisible: true } as unknown as FocusOptions);
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
      <h3 className={cn("text-lg font-bold text-[var(--wc-dash-text)]", embedTitleFocusClass)} id={titleId} ref={titleRef} tabIndex={-1}>
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
