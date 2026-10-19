"use client";
import Image from "next/image";
import { useI18n } from "locales/client";
import { ExerciseAttributeValueEnum } from "@prisma/client";

import { EQUIPMENT_CONFIG } from "../model/equipment-config";

import { getEquipmentTranslation } from "@/shared/lib/workout-session/equipments";
import { cn } from "@/shared/lib/utils";
import { useWorkoutFeedback } from "@/shared/hooks/use-workout-feedback";

interface EquipmentSelectionProps {
  onClearEquipment: VoidFunction;
  onToggleEquipment: (equipment: ExerciseAttributeValueEnum) => void;
  selectedEquipment: ExerciseAttributeValueEnum[];
}

interface EquipmentCardProps {
  equipment: (typeof EQUIPMENT_CONFIG)[0];
  isSelected: boolean;
  onToggle: () => void;
}

function EquipmentCard({ equipment, isSelected, onToggle }: EquipmentCardProps) {
  const t = useI18n();
  const { onTap } = useWorkoutFeedback();

  const translation = getEquipmentTranslation(equipment.value, t);

  return (
    <button
      aria-pressed={isSelected}
      className={cn(
        "group flex min-h-12 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 px-3 py-4 text-center",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--wc-dash-text)]",
        isSelected
          ? "border-[var(--wc-dash-accent)] bg-[var(--wc-dash-inner)]"
          : "border-[var(--wc-dash-border)] bg-[var(--wc-dash-card)]",
      )}
      onClick={() => {
        onTap();
        onToggle();
      }}
      type="button"
    >
      <Image
        alt={`${translation.label} illustration`}
        className="object-contain"
        height={80}
        src={equipment.icon}
        style={{ width: "6.25rem", height: "5rem" }}
        width={100}
      />
      <h3
        className={cn(
          "font-semibold text-lg leading-tight tracking-wide",
          isSelected
            ? "text-[var(--wc-dash-accent)]"
            : "text-[var(--wc-dash-text)] group-hover:text-[var(--wc-dash-accent)]",
        )}
      >
        {translation.label}
      </h3>
      {isSelected ? (
        <p className="break-words text-lg text-[var(--wc-dash-text)]">✓ {translation.description}</p>
      ) : null}
    </button>
  );
}

export function EquipmentSelection({ onClearEquipment, onToggleEquipment, selectedEquipment }: EquipmentSelectionProps) {
  const t = useI18n();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3" data-wc-equipment-bar="">
        <p className="text-lg text-[var(--wc-dash-text)]">
          {t("workout_builder.stats.equipment_selected", { count: selectedEquipment.length })}
        </p>
        <button
          aria-disabled={selectedEquipment.length === 0}
          className="inline-flex min-h-12 items-center rounded-lg px-3 text-lg text-[var(--wc-dash-accent)] aria-disabled:pointer-events-none aria-disabled:border aria-disabled:border-[var(--wc-dash-border)] aria-disabled:bg-[var(--wc-dash-inner)] aria-disabled:text-[var(--wc-dash-secondary)] aria-disabled:opacity-100"
          onClick={onClearEquipment}
          type="button"
        >
          {t("workout_builder.selection.clear_all")}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {EQUIPMENT_CONFIG.map((equipment, index) => (
          <div
            className="animate-fade-in-up"
            key={equipment.value}
            style={{
              animationDelay: `${index * 50}ms`,
              animationFillMode: "both",
            }}
          >
            <EquipmentCard
              equipment={equipment}
              isSelected={selectedEquipment.includes(equipment.value)}
              onToggle={() => onToggleEquipment(equipment.value)}
            />
          </div>
        ))}
      </div>

      {/* {locale === "fr" ? (
        <NutripureAffiliateBanner />
      ) : (
        (env.NEXT_PUBLIC_EQUIPMENT_SELECTION_BANNER_AD_SLOT || env.NEXT_PUBLIC_EZOIC_EQUIPMENT_SELECTION_PLACEMENT_ID) && (
          <HorizontalBottomBanner
            adSlot={env.NEXT_PUBLIC_EQUIPMENT_SELECTION_BANNER_AD_SLOT}
            ezoicPlacementId={env.NEXT_PUBLIC_EZOIC_EQUIPMENT_SELECTION_PLACEMENT_ID}
          />
        )
      )} */}
    </div>
  );
}
