"use client";

import { useState } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { useWorkoutSession } from "@/features/workout-builder";
import { Timer } from "@/components/ui/timer";
import { Button } from "@/components/ui/button";

export function WorkoutSessionTimer() {
  const { isWorkoutActive, isTimerRunning, toggleTimer, resetTimer } = useWorkoutSession();

  const [resetCount, setResetCount] = useState(0);

  const handleReset = () => {
    resetTimer();
    setResetCount((c) => c + 1);
  };

  if (!isWorkoutActive) {
    return null;
  }

  return (
    <div className="fixed bottom-[var(--wc-nav-h)] left-1/2 z-50 mb-3 max-w-[calc(100vw-16px)] -translate-x-1/2 sm:bottom-20">
      <div className="rounded-full border border-[var(--wc-dash-border)] bg-[var(--wc-dash-card)] px-4 py-2 shadow-lg">
        <div className="flex items-center justify-between gap-4">
          {/* Timer display */}
          <div className="flex items-center gap-3">
            <div className="text-lg font-mono font-bold tracking-wider text-[var(--wc-dash-text)]">
              <Timer initialSeconds={0} isRunning={isTimerRunning} key={resetCount} />
            </div>
          </div>

          {/* Control buttons */}
          <div className="flex items-center gap-3">
            <Button
              className={cn(
                "!h-12 !w-12 !min-h-12 !min-w-12 rounded-full p-0 shadow-none",
                isTimerRunning
                  ? "!bg-[var(--wc-dash-inner)] !text-[var(--wc-dash-text)]"
                  : "!bg-[var(--wc-dash-accent)] !text-[var(--wc-dash-ink)]",
              )}
              onClick={toggleTimer}
            >
              {isTimerRunning ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>

            <Button
              className={cn(
                "!h-12 !w-12 !min-h-12 !min-w-12 rounded-full p-0 shadow-none",
                "border border-[var(--wc-dash-border)] !text-[var(--wc-dash-text)] hover:bg-transparent",
              )}
              onClick={handleReset}
              variant="outline"
            >
              <RotateCcw className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
