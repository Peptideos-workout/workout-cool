"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import React from "react";
import { Info } from "lucide-react";
import { useI18n, useCurrentLocale } from "locales/client";

import { useChartTheme } from "../hooks/use-chart-theme";

import { OneRepMaxPoint } from "@/shared/types/statistics.types";
import { cn } from "@/shared/lib/utils";
import { formatDate } from "@/shared/lib/date";

interface OneRepMaxChartProps {
  data: OneRepMaxPoint[];
  formula: string;
  formulaDescription: string;
  width?: number;
  height?: number;
  unit?: "kg" | "lbs";
  className?: string;
}

export function OneRepMaxChart({
  data,
  formula,
  formulaDescription,
  height = 300,
  unit = "kg",
  className,
}: OneRepMaxChartProps) {
  const t = useI18n();
  const locale = useCurrentLocale();
  const { colors } = useChartTheme();

  // Format date for display
  const formatChartDate = (dateString: string) => {
    return formatDate(dateString, locale, "MMM D");
  };

  // Generate skeleton data for empty state
  const generateSkeletonData = () => {
    const now = new Date();
    const skeletonData = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i * 7);
      skeletonData.push({
        date: date.toISOString(),
        estimatedOneRepMax: 30 + Math.random() * 40, // Random 1RM between 30-70
        formattedDate: formatChartDate(date.toISOString()),
      });
    }
    return skeletonData;
  };

  // Use real data or skeleton data
  const hasData = data.length > 0;
  const chartData = hasData
    ? data.map((point) => ({
        ...point,
        formattedDate: formatChartDate(point.date),
      }))
    : generateSkeletonData();

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length && hasData) {
      return (
        <div
          className="p-3 rounded-lg shadow-lg border"
          style={{
            backgroundColor: colors.tooltipBackground,
            borderColor: colors.tooltipBorder,
            color: colors.text,
          }}
        >
          <p className="text-lg font-medium">{label}</p>
          <p className="text-lg text-[var(--wc-dash-accent)]">
            1RM: {payload[0].value.toFixed(1)} {unit}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div
      aria-label={t("statistics.one_rep_max_chart")}
      className={cn("relative rounded-xl border border-[var(--wc-dash-border)] bg-[var(--wc-dash-card)] p-4", className)}
      role="img"
      style={{ backgroundColor: colors.cardBackground }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold" style={{ color: colors.text }}>
          {t("statistics.estimated_1rm")}
        </h3>
        <div className="tooltip tooltip-left z-50" data-tip={`${formula} Formula: 1RM = Weight × (1 + (Reps ÷ 30))`}>
          <button
            aria-label={t("statistics.1rm_formula_info")}
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full transition-colors"
          >
            <Info className="h-5 w-5" style={{ color: colors.textSecondary }} />
          </button>
        </div>
      </div>
      <p className="mb-4 break-words text-lg text-[var(--wc-dash-secondary)]">{formulaDescription}</p>

      <div style={{ opacity: hasData ? 1 : 0.2 }}>
        <ResponsiveContainer height={height} width="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 28, bottom: 8 }}>
            <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
            <XAxis
              axisLine={{ stroke: colors.border }}
              dataKey="formattedDate"
              minTickGap={48}
              tick={{ fontSize: 18, fill: colors.textMuted }}
              tickLine={{ stroke: colors.border }}
            />
            <YAxis
              axisLine={{ stroke: colors.border }}
              label={{
                value: `${t("statistics.one_rm_est")} (${unit})`,
                angle: -90,
                position: "insideLeft",
                offset: 16,
                style: { textAnchor: "middle", fill: colors.text, fontSize: 18 },
              }}
              tick={{ fontSize: 18, fill: colors.textMuted }}
              tickLine={{ stroke: colors.border }}
              width={104}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              activeDot={{ r: 6, fill: "var(--wc-dash-accent)" }}
              dataKey="estimatedOneRepMax"
              dot={{ fill: "var(--wc-dash-accent)", strokeWidth: 2, r: 4 }}
              stroke="var(--wc-dash-accent)"
              strokeWidth={2}
              type="monotone"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-semibold" style={{ color: colors.text }}>
              {t("statistics.no_1rm_data")}
            </p>
            <p className="mt-2 text-lg" style={{ color: colors.textSecondary }}>
              {t("statistics.complete_sets_with_weight")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
