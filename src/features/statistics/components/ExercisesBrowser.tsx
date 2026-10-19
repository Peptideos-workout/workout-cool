"use client";

import React, { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, X } from "lucide-react";
import debounce from "lodash.debounce";
import { useI18n } from "locales/client";
import { useQuery } from "@tanstack/react-query";
import { ExerciseAttributeNameEnum, ExerciseAttributeValueEnum } from "@prisma/client";

import { getAttributeValueLabel } from "@/shared/lib/attribute-value-translation";
import { StatisticsTimeframe } from "@/shared/constants/statistics";
import { SiteConfig } from "@/shared/config/site-config";
import { ExerciseVideoModal } from "@/features/workout-builder/ui/exercise-video-modal";
import { WorkoutBuilderExerciseWithAttributes } from "@/features/workout-builder/types";
import { EQUIPMENT_CONFIG } from "@/features/workout-builder/model/equipment-config";
import { WeightProgressionChart } from "@/features/statistics/components/WeightProgressionChart";
import { VolumeChart } from "@/features/statistics/components/VolumeChart";
import { TimeframeSelector } from "@/features/statistics/components/TimeframeSelector";
import { StatisticsPreviewOverlay } from "@/features/statistics/components/StatisticsPreviewOverlay";
import { OneRepMaxChart } from "@/features/statistics/components/OneRepMaxChart";
import { ExerciseCharts } from "@/features/statistics/components/ExerciseStatisticsTab";
import { useUserSubscription } from "@/features/ads/hooks/useUserSubscription";
import { ExerciseWithAttributes } from "@/entities/exercise/types/exercise.types";
import { getExerciseAttributesValueOf } from "@/entities/exercise/shared/muscles";
import { SimpleSelect, SelectOption } from "@/components/ui/simple-select";

// API service for fetching exercises
const fetchExercises = async (params: { page?: number; limit?: number; search?: string; muscle?: string; equipment?: string }) => {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.append("page", params.page.toString());
  if (params.limit) searchParams.append("limit", params.limit.toString());
  if (params.search) searchParams.append("search", params.search);
  if (params.muscle && params.muscle !== "ALL") searchParams.append("muscle", params.muscle);
  if (params.equipment && params.equipment !== "ALL") searchParams.append("equipment", params.equipment);

  const response = await fetch(`/api/exercises/all?${searchParams}`);
  if (!response.ok) {
    throw new Error("Failed to fetch exercises");
  }
  return response.json();
};

// Available muscle groups - will be translated dynamically
const MUSCLE_GROUPS = [
  { value: "CHEST", labelKey: "workout_builder.muscles.chest" },
  { value: "BACK", labelKey: "workout_builder.muscles.back" },
  { value: "SHOULDERS", labelKey: "workout_builder.muscles.shoulders" },
  { value: "BICEPS", labelKey: "workout_builder.muscles.biceps" },
  { value: "TRICEPS", labelKey: "workout_builder.muscles.triceps" },
  { value: "QUADRICEPS", labelKey: "workout_builder.muscles.quadriceps" },
  { value: "HAMSTRINGS", labelKey: "workout_builder.muscles.hamstrings" },
  { value: "ABDOMINALS", labelKey: "workout_builder.muscles.abdominals" },
  { value: "OBLIQUES", labelKey: "workout_builder.muscles.obliques" },
  { value: "GLUTES", labelKey: "workout_builder.muscles.glutes" },
  { value: "CALVES", labelKey: "workout_builder.muscles.calves" },
  { value: "FOREARMS", labelKey: "workout_builder.muscles.forearms" },
  { value: "TRAPS", labelKey: "workout_builder.muscles.traps" },
  { value: "ADDUCTORS", labelKey: "workout_builder.muscles.adductors" },
  { value: "ABDUCTORS", labelKey: "workout_builder.muscles.abductors" },
];

// Exercise Selection Modal Component
const ExerciseSelectionModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSelectExercise: (exercise: ExerciseWithAttributes) => void;
}> = ({ isOpen, onClose, onSelectExercise }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEquipment, setSelectedEquipment] = useState<string>("ALL");
  const [selectedMuscle, setSelectedMuscle] = useState<string>("ALL");
  const t = useI18n();

  // Prepare equipment options
  const equipmentOptions: SelectOption[] = [
    { value: "ALL", label: t("statistics.all_equipment") },
    ...EQUIPMENT_CONFIG.map((equipment) => ({
      value: equipment.value,
      label: getAttributeValueLabel(equipment.value as ExerciseAttributeValueEnum, t),
    })),
  ];

  // Prepare muscle options
  const muscleOptions: SelectOption[] = [
    { value: "ALL", label: t("statistics.all_muscles") },
    ...MUSCLE_GROUPS.map((muscle) => ({
      value: muscle.value,
      label: getAttributeValueLabel(muscle.value as ExerciseAttributeValueEnum, t),
    })),
  ];

  // Debounced search
  const debouncedSearch = useMemo(
    () =>
      debounce((query: string) => {
        setSearchQuery(query);
      }, 300),
    [],
  );

  const {
    data: exercisesData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["exercises", searchQuery, selectedEquipment, selectedMuscle],
    queryFn: () =>
      fetchExercises({
        page: 1,
        limit: 50,
        search: searchQuery || undefined,
        muscle: selectedMuscle,
        equipment: selectedEquipment,
      }),
    enabled: isOpen,
  });

  const exercises = exercisesData?.data || [];

  const handleSearch = useCallback(
    (query: string) => {
      debouncedSearch(query);
    },
    [debouncedSearch],
  );

  const handleExerciseSelect = (exercise: ExerciseWithAttributes) => {
    onSelectExercise(exercise);
    onClose();
  };

  return (
    <div className={`modal !z-[245] ${isOpen ? "modal-open" : ""}`}>
      <div className="modal-box mt-32 flex h-full max-h-screen w-full max-w-2xl flex-col border border-[var(--wc-dash-border)] bg-[var(--wc-dash-panel)] p-4 text-[var(--wc-dash-text)] sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-[var(--wc-dash-text)]">{t("statistics.select_exercise")}</h2>
          <button
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl text-[var(--wc-dash-text)]"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* Filters */}
        <div className="space-y-4 mb-4">
          {/* Equipment Filter */}
          <SimpleSelect
            aria-label="Filter by equipment"
            className="w-full !z-[250]"
            onValueChange={setSelectedEquipment}
            options={equipmentOptions}
            value={selectedEquipment}
          />

          {/* Muscle Filter */}
          <SimpleSelect
            aria-label="Filter by muscle group"
            className="w-full !z-[250]"
            onValueChange={setSelectedMuscle}
            options={muscleOptions}
            value={selectedMuscle}
          />

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-5 w-5 text-[var(--wc-dash-secondary)]" />
            <input
              className="min-h-12 w-full rounded-xl border border-[var(--wc-dash-border)] bg-[var(--wc-dash-panel)] pl-10 pr-3 text-lg text-[var(--wc-dash-text)] placeholder:text-[var(--wc-dash-secondary)]"
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={t("statistics.search_exercises")}
            />
          </div>
        </div>

        {/* Exercise List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex justify-center py-8">
              <span className="loading loading-spinner loading-lg"></span>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-lg text-[var(--wc-dash-error)]">{t("statistics.error_loading_exercises")}</p>
            </div>
          )}

          {!isLoading && exercises.length === 0 && (
            <div className="text-center py-8">
              <p className="text-lg text-[var(--wc-dash-secondary)]">{t("statistics.no_exercises_found")}</p>
            </div>
          )}

          <div className="space-y-2">
            {exercises.map((exercise: ExerciseWithAttributes) => {
              const primaryMuscles = getExerciseAttributesValueOf(exercise, ExerciseAttributeNameEnum.PRIMARY_MUSCLE);
              const primaryMuscleLabel = primaryMuscles.map((muscle) => getAttributeValueLabel(muscle, t)).join(", ");

              return (
                <div
                  className="flex min-h-12 cursor-pointer items-center gap-4 rounded-xl border border-[var(--wc-dash-border)] bg-[var(--wc-dash-card)] p-3 text-[var(--wc-dash-text)]"
                  key={exercise.id}
                  onClick={() => handleExerciseSelect(exercise)}
                >
                  <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-[var(--wc-dash-border)] bg-[var(--wc-dash-inner)]">
                    {exercise.fullVideoImageUrl && (
                      <Image
                        alt={exercise.name || ""}
                        className="object-cover h-full w-full scale-150"
                        height={64}
                        src={exercise.fullVideoImageUrl}
                        width={64}
                      />
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-lg font-semibold">{exercise.name}</h4>
                    <p className="text-lg text-[var(--wc-dash-secondary)]">{primaryMuscleLabel}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose}></div>
    </div>
  );
};

export const ExercisesBrowser = () => {
  const [selectedExercise, setSelectedExercise] = useState<ExerciseWithAttributes | null>(null);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState<StatisticsTimeframe>("8weeks");
  const { isPremium } = useUserSubscription();
  const unlockStatsUi = SiteConfig.allPremiumFeaturesFree || isPremium;
  const t = useI18n();

  const handleExerciseSelect = (exercise: ExerciseWithAttributes) => {
    setSelectedExercise(exercise);
  };

  const openExerciseSelection = () => {
    setShowExerciseModal(true);
  };

  const openVideoModal = () => {
    setShowVideoModal(true);
  };

  const getExerciseEquipment = (exercise: ExerciseWithAttributes) => {
    const equipments = getExerciseAttributesValueOf(exercise, ExerciseAttributeNameEnum.EQUIPMENT);
    return equipments.map((equipment) => getAttributeValueLabel(equipment, t));
  };

  const getExercisePrimaryMuscles = (exercise: ExerciseWithAttributes) => {
    const primaryMuscles = getExerciseAttributesValueOf(exercise, ExerciseAttributeNameEnum.PRIMARY_MUSCLE);
    return primaryMuscles.map((muscle) => getAttributeValueLabel(muscle, t));
  };

  // Convert exercise to workout builder format
  const convertToWorkoutBuilderFormat = (exercise: ExerciseWithAttributes): WorkoutBuilderExerciseWithAttributes => {
    // Convert attributes to the expected format
    const convertedAttributes = exercise.attributes.map((attr) => ({
      id: attr.id || "",
      exerciseId: exercise.id,
      attributeNameId: "",
      attributeValueId: "",
      createdAt: new Date(),
      updatedAt: new Date(),
      attributeName: {
        id: "",
        name: typeof attr.attributeName === "string" ? attr.attributeName : attr.attributeName.name,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      attributeValue: {
        id: "",
        value: typeof attr.attributeValue === "string" ? attr.attributeValue : attr.attributeValue.value,
        createdAt: new Date(),
        updatedAt: new Date(),
        attributeNameId: "",
      },
    }));

    return {
      id: exercise.id,
      name: exercise.name,
      nameEn: exercise.nameEn || null,
      description: exercise.description,
      descriptionEn: exercise.descriptionEn || null,
      fullVideoUrl: exercise.fullVideoUrl || null,
      fullVideoImageUrl: exercise.fullVideoImageUrl || null,
      introduction: null,
      introductionEn: null,
      order: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      attributes: convertedAttributes,
    };
  };

  const router = useRouter();

  const handleUpgrade = () => {
    router.push("/premium");
    console.log("Upgrade clicked");
  };

  return (
    <>
      {/* Conversion Banner */}

      <div className="min-h-screen">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header */}
          {unlockStatsUi && (
            <div>
              <button
                className="mb-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--wc-dash-accent)] px-4 text-lg text-[var(--wc-dash-ink)]"
                onClick={openExerciseSelection}
              >
                {t("statistics.select_exercise")}
              </button>
            </div>
          )}

          {/* Selected Exercise Info */}
          {selectedExercise && (
            <div className="rounded-xl border border-[var(--wc-dash-border)] bg-[var(--wc-dash-card)] p-6 text-[var(--wc-dash-text)]">
              <h2 className="mb-4 text-2xl font-bold">{selectedExercise.name}</h2>

              <div className="mb-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg text-[var(--wc-dash-secondary)]">{t("statistics.equipment_label")}</span>
                  <span className="text-lg">{getExerciseEquipment(selectedExercise).join(", ")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg text-[var(--wc-dash-secondary)]">{t("statistics.primary_muscle_label")}</span>
                  <span className="text-lg">{getExercisePrimaryMuscles(selectedExercise).join(", ")}</span>
                </div>
              </div>

              {/* Exercise Image */}
              <div className="mb-4 rounded-xl bg-[var(--wc-dash-inner)] p-4">
                <div className="flex aspect-video max-h-48 items-center justify-center overflow-hidden rounded-xl border border-[var(--wc-dash-border)] bg-[var(--wc-dash-inner)]">
                  {selectedExercise.fullVideoImageUrl ? (
                    <Image
                      alt={selectedExercise.name}
                      className="object-cover cursor-pointer aspect-video scale-115 justify-center place-self-center"
                      height={200}
                      onClick={openVideoModal}
                      src={selectedExercise.fullVideoImageUrl}
                      width={300}
                    />
                  ) : (
                    <div className="text-center">
                      <p className="text-lg text-[var(--wc-dash-secondary)]">{t("statistics.no_image_available")}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Statistics Section */}
          <div className="space-y-4">
            {/* Time period selector */}
            <div className="flex flex-col gap-3 rounded-xl border border-[var(--wc-dash-border)] bg-[var(--wc-dash-panel)] p-4">
              <span className="text-lg font-semibold text-[var(--wc-dash-text)]">{t("statistics.timeframe")}</span>
              <TimeframeSelector onSelect={setSelectedTimeframe} selected={selectedTimeframe} />
            </div>

            {/* Stats Charts */}
            <div className="space-y-4">
              {selectedExercise ? (
                <ExerciseCharts exerciseId={selectedExercise.id} timeframe={selectedTimeframe} />
              ) : (
                <div className="relative gap-y-4 flex flex-col">
                  <WeightProgressionChart data={[]} height={250} unit="kg" />
                  <OneRepMaxChart data={[]} formula="Lombardi" formulaDescription="Classic 1RM estimation formula" height={250} unit="kg" />
                  <VolumeChart data={[]} height={250} />
                  <StatisticsPreviewOverlay isVisible={!unlockStatsUi} onUpgrade={handleUpgrade} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals - Outside the main container */}
      <ExerciseSelectionModal
        isOpen={showExerciseModal}
        onClose={() => setShowExerciseModal(false)}
        onSelectExercise={handleExerciseSelect}
      />

      {selectedExercise && (
        <ExerciseVideoModal
          exercise={convertToWorkoutBuilderFormat(selectedExercise)}
          onOpenChange={setShowVideoModal}
          open={showVideoModal}
        />
      )}
    </>
  );
};
