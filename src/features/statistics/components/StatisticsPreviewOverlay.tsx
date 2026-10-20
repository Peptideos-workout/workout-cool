"use client";

import React, { useState } from "react";
import { Lock, Eye, Zap, Crown, ArrowRight, RotateCcw } from "lucide-react";
import { useI18n } from "locales/client";
import { motion, AnimatePresence } from "framer-motion";

import { cn } from "@/shared/lib/utils";

interface StatisticsPreviewOverlayProps {
  className?: string;
  onUpgrade?: () => void;
  isVisible?: boolean;
}

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
