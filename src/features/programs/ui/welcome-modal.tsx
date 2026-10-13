"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Trophy, Target, Calendar, Zap, X } from "lucide-react";
import { useI18n } from "locales/client";
import confetti from "canvas-confetti";

import { Button } from "@/components/ui/button";

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoin: () => void;
  programTitle: string;
  programLevel: string;
  programDuration: string;
  programFrequency: string;
}

export function WelcomeModal({
  isOpen,
  onClose,
  onJoin,
  programTitle,
  programLevel,
  programDuration,
  programFrequency,
}: WelcomeModalProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const t = useI18n();

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      // Trigger confetti animation
      setTimeout(() => {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#4F8EF7", "#25CB78", "#FFD700"],
        });
      }, 300);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleJoin = () => {
    confetti({
      particleCount: 200,
      spread: 120,
      origin: { y: 0.5 },
      colors: ["#4F8EF7", "#25CB78", "#FFD700"],
    });
    setTimeout(() => {
      onJoin();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--wc-dash-page)_80%,transparent)] p-4">
      <div
        className={`
          relative w-full max-w-md rounded-2xl border
          border-[var(--wc-dash-border)] bg-[var(--wc-dash-panel)]
          text-[var(--wc-dash-text)] transition-all duration-500 ${isAnimating ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
      >
        {/* Close button */}
        <button
          className="absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-full text-[var(--wc-dash-text)]"
          onClick={onClose}
        >
          <X className="h-5 w-5" size={20} />
        </button>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Header with mascot */}
          <div className="text-center">
            <div className="relative inline-block mb-4">
              <div className="w-24 h-24 mx-auto relative animate-bounce">
                <Image
                  alt="WorkoutCool Mascot"
                  className="object-contain"
                  height={96}
                  src="/images/emojis/WorkoutCoolSwag.png"
                  width={96}
                />
              </div>
              <div className="absolute -right-2 -top-2 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--wc-dash-accent)]">
                <Trophy className="h-5 w-5 text-[var(--wc-dash-ink)]" size={16} />
              </div>
            </div>

            <h2 className="mb-2 text-2xl font-bold text-[var(--wc-dash-text)]">
              {t("programs.welcome_modal.welcome_title", { programTitle })}
            </h2>
            <p className="text-lg text-[var(--wc-dash-secondary)]">{t("programs.welcome_modal.subtitle")}</p>
          </div>

          {/* Program quick info */}
          <div className="space-y-3 rounded-xl bg-[var(--wc-dash-card)] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--wc-dash-accent)]">
                <Zap className="h-5 w-5 text-[var(--wc-dash-ink)]" size={16} />
              </div>
              <div>
                <p className="text-lg text-[var(--wc-dash-secondary)]">{t("programs.welcome_modal.level_label")}</p>
                <p className="text-lg font-semibold text-[var(--wc-dash-text)]">{programLevel}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--wc-dash-accent)]">
                <Calendar className="h-5 w-5 text-[var(--wc-dash-ink)]" size={16} />
              </div>
              <div>
                <p className="text-lg text-[var(--wc-dash-secondary)]">{t("programs.welcome_modal.duration_label")}</p>
                <p className="text-lg font-semibold text-[var(--wc-dash-text)]">{programDuration}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--wc-dash-accent)]">
                <Target className="h-5 w-5 text-[var(--wc-dash-ink)]" size={16} />
              </div>
              <div>
                <p className="text-lg text-[var(--wc-dash-secondary)]">{t("programs.welcome_modal.frequency_label")}</p>
                <p className="text-lg font-semibold text-[var(--wc-dash-text)]">{programFrequency}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              className={
                `!min-h-12 flex-1 !border !border-[var(--wc-dash-border)] ` +
                `!bg-[var(--wc-dash-panel)] !text-lg !text-[var(--wc-dash-text)]`
              }
              onClick={onClose}
              size="large"
              variant="outline"
            >
              {t("programs.welcome_modal.later_button")}
            </Button>
            <Button
              className="!min-h-12 flex-1 !border-0 !bg-[var(--wc-dash-accent)] !text-lg !text-[var(--wc-dash-ink)]"
              onClick={handleJoin}
              size="large"
            >
              {t("programs.welcome_modal.start_button")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
