"use client";

import { Share2, Check, Loader2 } from "lucide-react";

import { useProgramShare } from "../hooks/use-program-share";

interface ShareButtonProps {
  programTitle: string;
  programDescription?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "ghost";
}

/**
 * Reusable share button component
 * Shows appropriate feedback based on share status
 */
export function ShareButton({ programTitle, programDescription, className = "", size = "md", variant = "default" }: ShareButtonProps) {
  const { handleShare, isSharing, shareMessage } = useProgramShare({
    programTitle,
    programDescription,
  });

  // Size classes
  const sizeClasses = {
    sm: "min-h-12 min-w-12 p-2",
    md: "min-h-12 min-w-12 p-3",
    lg: "min-h-12 min-w-12 p-4",
  };

  // Variant classes
  const variantClasses = {
    default: "bg-[var(--wc-dash-accent)] text-[var(--wc-dash-ink)]",
    ghost: "bg-transparent text-[var(--wc-dash-text)]",
  };

  // Icon size based on button size
  const iconSize = {
    sm: 16,
    md: 18,
    lg: 20,
  }[size];

  return (
    <div className="relative">
      <button
        className={`
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          rounded-xl 
          transition-all 
          duration-200 
          ease-in-out 
          disabled:opacity-50
          disabled:cursor-not-allowed
          ${className}
        `}
        disabled={isSharing}
        onClick={handleShare}
        type="button"
      >
        {isSharing ? (
          <Loader2 className="animate-spin" size={iconSize} />
        ) : shareMessage ? (
          <Check size={iconSize} />
        ) : (
          <Share2 size={iconSize} />
        )}
      </button>

      {/* Feedback tooltip */}
      {shareMessage && (
        <div
          className={
            "absolute -top-12 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded border " +
            "border-[var(--wc-dash-border)] bg-[var(--wc-dash-card)] px-2 py-1 text-lg " +
            "text-[var(--wc-dash-text)]"
          }
        >
          {shareMessage}
        </div>
      )}
    </div>
  );
}
