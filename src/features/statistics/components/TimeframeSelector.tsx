"use client";

import React from "react";
import { useI18n } from "locales/client";

import { cn } from "@/shared/lib/utils";
import { StatisticsTimeframe } from "@/shared/constants/statistics";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

export function TimeframeSelector({ selected, onSelect, className }: TimeframeSelectorProps) {
  const t = useI18n();

  return (
    <Select onValueChange={(value) => onSelect(value as StatisticsTimeframe)} value={selected}>
      <SelectTrigger
        className={cn(
          "!min-h-12 w-auto min-w-12 !text-lg border border-[var(--wc-dash-border)] bg-[var(--wc-dash-panel)] text-[var(--wc-dash-text)]",
          className,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border border-[var(--wc-dash-border)] bg-[var(--wc-dash-panel)] text-[var(--wc-dash-text)]">
        {TIMEFRAME_OPTIONS.map((option) => (
          <SelectItem className="!min-h-12 !text-lg text-[var(--wc-dash-text)]" key={option.value} value={option.value}>
            {t(option.labelKey as keyof typeof t)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
