"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, PlayCircle } from "lucide-react";
import { useI18n } from "locales/client";

import { getProgramProgress } from "@/features/programs/actions/get-program-progress.action";

interface ProgramProgressProps {
  programId: string;
}

export function ProgramProgress({ programId }: ProgramProgressProps) {
  const [progress, setProgress] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const searchParams = useSearchParams();
  const t = useI18n();

  useEffect(() => {
    loadProgress();
  }, [programId]);

  // Reload progress when refresh param changes (indicating session completion)
  useEffect(() => {
    const refreshParam = searchParams.get("refresh");
    if (refreshParam) {
      loadProgress();
    }
  }, [searchParams]);

  const loadProgress = async () => {
    try {
      const data = await getProgramProgress(programId);
      setProgress(data);
    } catch (error) {
      console.error("Failed to load progress:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="h-20 animate-pulse rounded-xl bg-[var(--wc-dash-inner)]"></div>;
  }

  if (!progress) {
    return null;
  }

  const { stats } = progress;

  return (
    <div className="mb-6 rounded-xl border-2 border-[var(--wc-dash-border)] bg-[var(--wc-dash-card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-[var(--wc-dash-accent)]">{t("programs.my_progress")}</h3>
          <p className="text-lg text-[var(--wc-dash-secondary)]">
            {stats.completedSessions} / {stats.totalSessions} {t("programs.completed_sets")}
          </p>
        </div>
        <div className="text-3xl font-bold text-[var(--wc-dash-accent)]">{stats.completionPercentage}%</div>
      </div>

      <div className="flex items-center gap-4 text-lg">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-[var(--wc-dash-accent)]" size={16} />
          <span className="text-[var(--wc-dash-secondary)]">{t("programs.completed_feminine")}</span>
        </div>
        <div className="flex items-center gap-2">
          <PlayCircle className="h-5 w-5 text-[var(--wc-dash-accent)]" size={16} />
          <span className="text-[var(--wc-dash-secondary)]">
            {t("programs.week")} {stats.currentWeek}, {t("programs.session")} {stats.currentSession}
          </span>
        </div>
      </div>
    </div>
  );
}
