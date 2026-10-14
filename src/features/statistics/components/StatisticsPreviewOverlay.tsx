"use client";

import React, { useState, useEffect } from "react";
import { Lock, Eye, TrendingUp, Zap, Star, Crown, ArrowRight, RotateCcw } from "lucide-react";
import { useI18n, useCurrentLocale } from "locales/client";
import { motion, AnimatePresence } from "framer-motion";

import { cn } from "@/shared/lib/utils";

interface StatisticsPreviewOverlayProps {
  className?: string;
  onUpgrade?: () => void;
  isVisible?: boolean;
}

// Composant pour simuler les données qui bougent
const AnimatedChart: React.FC = () => {
  const [data, setData] = useState([
    { x: 0, y: 30 },
    { x: 1, y: 45 },
    { x: 2, y: 35 },
    { x: 3, y: 60 },
    { x: 4, y: 50 },
    { x: 5, y: 75 },
    { x: 6, y: 85 },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setData((prev) =>
        prev.map((point) => ({
          ...point,
          y: Math.max(20, Math.min(90, point.y + (Math.random() - 0.5) * 10)),
        })),
      );
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const pathData = data.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x * 40} ${100 - point.y}`).join(" ");

  return (
    <div className="relative h-32 w-full overflow-hidden rounded-xl bg-[var(--wc-dash-inner)]">
      <svg className="w-full h-full" viewBox="0 0 240 100">
        {/* Grid */}
        <defs>
          <pattern height="20" id="grid" patternUnits="userSpaceOnUse" width="40">
            <path d="M 40 0 L 0 0 0 20" fill="none" stroke="var(--wc-dash-border)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect fill="url(#grid)" height="100%" width="100%" />

        {/* Animated line */}
        <motion.path
          animate={{ pathLength: 1 }}
          d={pathData}
          fill="none"
          initial={{ pathLength: 0 }}
          stroke="url(#gradient)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
          transition={{ duration: 1.5, ease: "easeInOut" }}
        />

        {/* Gradient definition */}
        <defs>
          <linearGradient id="gradient" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="var(--wc-dash-accent)" />
            <stop offset="100%" stopColor="var(--wc-dash-link)" />
          </linearGradient>
        </defs>

        {/* Animated dots */}
        {data.map((point, index) => (
          <motion.circle
            animate={{ scale: 1 }}
            cx={point.x * 40}
            cy={100 - point.y}
            fill="var(--wc-dash-accent)"
            initial={{ scale: 0 }}
            key={index}
            r="4"
            transition={{ delay: index * 0.1 }}
          />
        ))}
      </svg>

      {/* Overlay stats */}
      <div className="absolute right-2 top-2 rounded-xl bg-[var(--wc-dash-panel)] px-2 py-1 text-lg">
        <div className="flex items-center gap-1 text-[var(--wc-dash-link)]">
          <TrendingUp className="w-3 h-3" />
          <span className="font-semibold">+12.5%</span>
        </div>
      </div>
    </div>
  );
};

// Composant pour les métriques qui s'animent
const AnimatedMetrics: React.FC = () => {
  const t = useI18n();
  const locale = useCurrentLocale();

  const [metrics, setMetrics] = useState({
    totalVolume: 2450,
    prIncrease: 15,
    weightProgression: 78,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics((prev) => ({
        totalVolume: prev.totalVolume + Math.floor(Math.random() * 50) - 25,
        prIncrease: Math.max(0, prev.prIncrease + Math.floor(Math.random() * 6) - 3),
        weightProgression: Math.max(0, Math.min(100, prev.weightProgression + Math.floor(Math.random() * 10) - 5)),
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="grid grid-cols-3 gap-4">
      <motion.div className="rounded-xl bg-[var(--wc-dash-panel)] p-3 text-center" whileHover={{ scale: 1.05 }}>
        <p className="text-2xl font-bold text-[var(--wc-dash-accent)]">{metrics.totalVolume.toLocaleString(locale)}</p>
        <p className="text-lg text-[var(--wc-dash-text)]">{t("statistics.total_volume")}</p>
      </motion.div>

      <motion.div className="rounded-xl bg-[var(--wc-dash-panel)] p-3 text-center" whileHover={{ scale: 1.05 }}>
        <p className="text-2xl font-bold text-[var(--wc-dash-link)]">+{metrics.prIncrease}%</p>
        <p className="text-lg text-[var(--wc-dash-text)]">{t("statistics.pr_increase")}</p>
      </motion.div>

      <motion.div className="rounded-xl bg-[var(--wc-dash-panel)] p-3 text-center" whileHover={{ scale: 1.05 }}>
        <p className="text-2xl font-bold text-[var(--wc-dash-accent)]">{metrics.weightProgression}%</p>
        <p className="text-lg text-[var(--wc-dash-text)]">{t("statistics.weight_progress")}</p>
      </motion.div>
    </div>
  );
};

export const StatisticsPreviewOverlay: React.FC<StatisticsPreviewOverlayProps> = ({ className, onUpgrade, isVisible = true }) => {
  const t = useI18n();
  const [isPlaying] = useState(true);
  const [showTeaserModal, setShowTeaserModal] = useState(false);

  if (!isVisible) return null;

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className={cn("absolute inset-0 z-50 flex flex-col items-center justify-center rounded-xl bg-[var(--wc-dash-accent)] p-8", className)}
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
    >
      {/* Icône principale avec animation */}
      <motion.div
        animate={{
          rotate: isPlaying ? 360 : 0,
          scale: isPlaying ? 1.1 : 1,
        }}
        className="mb-6"
        transition={{
          rotate: { duration: 2, repeat: isPlaying ? Infinity : 0, ease: "linear" },
          scale: { duration: 0.3 },
        }}
      >
        <div className="relative">
          <div className="rounded-full bg-[var(--wc-dash-ink)] p-6">
            <Lock className="h-12 w-12 text-[var(--wc-dash-accent)]" />
          </div>
          <motion.div
            animate={{ opacity: [0, 1, 0] }}
            className="absolute -right-1 -top-1 rounded-full bg-[var(--wc-dash-ink)] p-2"
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Crown className="h-5 w-5 text-[var(--wc-dash-accent)]" />
          </motion.div>
        </div>
      </motion.div>

      {/* Titre principal */}
      <motion.h3
        animate={{ y: 0, opacity: 1 }}
        className="mb-2 text-center text-3xl font-bold text-[var(--wc-dash-ink)]"
        initial={{ y: 20, opacity: 0 }}
        transition={{ delay: 0.2 }}
      >
        {t("statistics.premium_statistics")}
      </motion.h3>

      <motion.p
        animate={{ y: 0, opacity: 1 }}
        className="mb-6 max-w-md text-center text-lg text-[var(--wc-dash-ink)]"
        initial={{ y: 20, opacity: 0 }}
        transition={{ delay: 0.3 }}
      >
        {t("statistics.premium_statistics_description")}
      </motion.p>

      {/* Aperçu des données animées */}
      <motion.div
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md mb-6"
        initial={{ scale: 0.9, opacity: 0 }}
        transition={{ delay: 0.4 }}
      >
        <AnimatedChart />
      </motion.div>

      {/* Métriques animées */}
      <motion.div
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-md mb-8"
        initial={{ y: 20, opacity: 0 }}
        transition={{ delay: 0.5 }}
      >
        <AnimatedMetrics />
      </motion.div>

      {/* Boutons d'action */}
      <div className="flex items-center gap-4">
        <motion.button
          className="group relative inline-flex min-h-12 items-center rounded-xl bg-[var(--wc-dash-ink)] px-6 py-3 text-lg font-bold text-[var(--wc-dash-accent)]"
          data-wc-entry="premium"
          onClick={onUpgrade}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[color-mix(in_srgb,var(--wc-dash-accent)_20%,transparent)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <div className="relative flex items-center gap-2">
            <Zap className="w-5 h-5" />
            <span>{t("statistics.upgrade_now")}</span>
            <ArrowRight className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </motion.button>
      </div>

      {/* Éléments de confiance */}
      <motion.div
        animate={{ y: 0, opacity: 1 }}
        className="mt-6 flex flex-wrap items-center gap-4 text-lg text-[var(--wc-dash-ink)]"
        initial={{ y: 20, opacity: 0 }}
        transition={{ delay: 0.6 }}
      >
        <div className="flex items-center gap-1">
          <Star className="h-5 w-5 text-[var(--wc-dash-ink)]" />
          <span>{t("statistics.rating")}</span>
        </div>
        <div className="flex items-center gap-1">
          <Eye className="h-5 w-5" />
          <span>{t("statistics.no_ads")}</span>
        </div>
        <div className="flex items-center gap-1">
          <RotateCcw className="h-5 w-5" />
          <span>{t("statistics.cancel_anytime")}</span>
        </div>
      </motion.div>

      {/* Modal de teaser */}
      <AnimatePresence>
        {showTeaserModal && (
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--wc-dash-text)_50%,transparent)]"
            exit={{ opacity: 0, scale: 0.8 }}
            initial={{ opacity: 0, scale: 0.8 }}
          >
            <div className="mx-4 max-w-sm rounded-xl border border-[var(--wc-dash-border)] bg-[var(--wc-dash-panel)] p-6">
              <h4 className="mb-4 text-center text-xl font-bold text-[var(--wc-dash-text)]">{t("statistics.preview_notice")}</h4>
              <p className="mb-6 text-center text-lg text-[var(--wc-dash-secondary)]">{t("statistics.preview_description")}</p>
              <button
                className="min-h-12 w-full rounded-xl bg-[var(--wc-dash-accent)] py-3 text-lg font-bold text-[var(--wc-dash-ink)]"
                onClick={() => {
                  setShowTeaserModal(false);
                  onUpgrade?.();
                }}
              >
                {t("statistics.get_premium_access")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
