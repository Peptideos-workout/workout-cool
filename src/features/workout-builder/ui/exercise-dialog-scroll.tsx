"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface ExerciseDialogScrollProps {
  children: ReactNode;
}

export function ExerciseDialogScroll({ children }: ExerciseDialogScrollProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    // Radix RemoveScroll listens on document and may preventDefault. Android Chrome then drops the rest of the swipe.
    const releaseLockedTouch = (event: TouchEvent) => {
      event.stopPropagation();
    };
    node.addEventListener("touchmove", releaseLockedTouch);
    return () => node.removeEventListener("touchmove", releaseLockedTouch);
  }, []);

  return (
    <div
      className="max-h-[calc(100dvh-16px)] min-h-0 flex-1 touch-pan-y overflow-x-clip overflow-y-auto overscroll-contain"
      data-exercise-dialog-scroll=""
      ref={scrollRef}
    >
      {children}
    </div>
  );
}
