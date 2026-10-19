"use client";

import React from "react";
import { useI18n } from "locales/client";

import { cn } from "@/shared/lib/utils";
import { StatisticsTimeframe } from "@/shared/constants/statistics";

interface TimeframeSelectorProps {
  selected: StatisticsTimeframe;
  onSelect: (timeframe: StatisticsTimeframe) => void;
  className?: string;
}

const TIMEFRAME_OPTIONS = [
  { value: "4weeks" as StatisticsTimeframe, labelKey: "statistics.timeframes.4weeks" },
  { value: "8weeks" as StatisticsTimeframe, labelKey: "statistics.timeframes.8weeks" },
  { value: "12weeks" as StatisticsTimeframe, labelKey: "statistics.timeframes.12weeks" },
  { value: "1year" as StatisticsTimeframe, labelKey: "statistics.timeframes.1year" },
];

const tile =
  "inline-flex min-h-12 items-center justify-center rounded-xl border px-3 text-lg font-semibold " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wc-dash-link)]";

export function TimeframeSelector({ selected, onSelect, className }: TimeframeSelectorProps) {
  const t = useI18n();

  return (
    <div aria-label={t("statistics.timeframe")} className={cn("flex flex-wrap gap-2", className)} role="group">
      {TIMEFRAME_OPTIONS.map((option) => {
        const isSelected = selected === option.value;
        return (
          <button
            aria-pressed={isSelected}
            className={cn(
              tile,
              isSelected
                ? "border-[var(--wc-dash-accent)] bg-[var(--wc-dash-accent)] text-[var(--wc-dash-ink)]"
                : "border-[var(--wc-dash-border)] bg-[var(--wc-dash-panel)] text-[var(--wc-dash-text)]",
            )}
            key={option.value}
            onClick={() => onSelect(option.value)}
            type="button"
          >
            {t(option.labelKey as keyof typeof t)}
          </button>
        );
      })}
    </div>
  );
}
