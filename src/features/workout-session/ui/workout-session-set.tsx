import { Minus, Trash2 } from "lucide-react";
import { useI18n } from "locales/client";

import { AVAILABLE_WORKOUT_SET_TYPES, MAX_WORKOUT_SET_COLUMNS } from "@/shared/constants/workout-set-types";
import { WorkoutSet, WorkoutSetType, WorkoutSetUnit } from "@/features/workout-session/types/workout-set";
import { getWorkoutSetTypeLabels } from "@/features/workout-session/lib/workout-set-labels";
import { Button } from "@/components/ui/button";

const sessionField =
  "min-h-14 rounded border border-[var(--wc-dash-border)] bg-[var(--wc-dash-inner)] " +
  "px-3 text-lg font-bold text-[var(--wc-dash-text)] placeholder:text-[var(--wc-dash-secondary)]";
const plainErrorButton = "border-0 bg-transparent !text-[var(--wc-dash-error)] shadow-none hover:bg-transparent";
const accentButton =
  "!min-h-12 !bg-[var(--wc-dash-accent)] !text-lg font-bold !text-[var(--wc-dash-ink)] hover:!bg-[var(--wc-dash-accent)]";
const secondaryButton =
  "!min-h-12 !border !border-[var(--wc-dash-border)] !bg-[var(--wc-dash-panel)] !text-lg font-bold " +
  "!text-[var(--wc-dash-text)] shadow-none hover:!bg-[var(--wc-dash-inner)]";

interface WorkoutSetRowProps {
  set: WorkoutSet;
  setIndex: number;
  onChange: (setIndex: number, data: Partial<WorkoutSet>) => void;
  onFinish: () => void;
  onRemove: () => void;
}

export function WorkoutSessionSet({ set, setIndex, onChange, onFinish, onRemove }: WorkoutSetRowProps) {
  const t = useI18n();
  const types = set.types || [];
  const typeLabels = getWorkoutSetTypeLabels(t);

  const handleTypeChange = (columnIndex: number) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTypes = [...types];
    newTypes[columnIndex] = e.target.value as WorkoutSetType;
    onChange(setIndex, { types: newTypes });
  };

  const handleValueIntChange = (columnIndex: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValuesInt = Array.isArray(set.valuesInt) ? [...set.valuesInt] : [];
    newValuesInt[columnIndex] = e.target.value ? parseInt(e.target.value, 10) : 0;
    onChange(setIndex, { valuesInt: newValuesInt });
  };

  const handleValueSecChange = (columnIndex: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValuesSec = Array.isArray(set.valuesSec) ? [...set.valuesSec] : [];
    newValuesSec[columnIndex] = e.target.value ? parseInt(e.target.value, 10) : 0;
    onChange(setIndex, { valuesSec: newValuesSec });
  };

  const handleUnitChange = (columnIndex: number) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newUnits = Array.isArray(set.units) ? [...set.units] : [];
    newUnits[columnIndex] = e.target.value as WorkoutSetUnit;
    onChange(setIndex, { units: newUnits });
  };

  const addColumn = () => {
    if (types.length < MAX_WORKOUT_SET_COLUMNS) {
      const firstAvailableType = AVAILABLE_WORKOUT_SET_TYPES.find((t) => !types.includes(t));
      if (firstAvailableType) {
        const newTypes = [...types, firstAvailableType];
        onChange(setIndex, { types: newTypes });
      }
    }
  };

  const removeColumn = (columnIndex: number) => {
    const newTypes = types.filter((_, idx) => idx !== columnIndex);
    const newValuesInt = Array.isArray(set.valuesInt) ? set.valuesInt.filter((_, idx) => idx !== columnIndex) : [];
    const newValuesSec = Array.isArray(set.valuesSec) ? set.valuesSec.filter((_, idx) => idx !== columnIndex) : [];
    const newUnits = Array.isArray(set.units) ? set.units.filter((_, idx) => idx !== columnIndex) : [];

    onChange(setIndex, {
      types: newTypes,
      valuesInt: newValuesInt,
      valuesSec: newValuesSec,
      units: newUnits,
    });
  };

  const handleEdit = () => {
    onChange(setIndex, { completed: false });
  };

  const renderInputForType = (type: WorkoutSetType, columnIndex: number) => {
    const valuesInt = set.valuesInt || [];
    const valuesSec = set.valuesSec || [];
    const units = set.units || [];

    switch (type) {
      case "TIME":
        return (
          <div className="flex gap-1 w-full">
            <input
              className={`${sessionField} w-1/2 text-center`}
              disabled={set.completed}
              min={0}
              onChange={handleValueIntChange(columnIndex)}
              pattern="[0-9]*"
              placeholder={t("programs.min_short")}
              type="number"
              value={valuesInt[columnIndex] ?? ""}
            />
            <input
              className={`${sessionField} w-1/2 text-center`}
              disabled={set.completed}
              max={59}
              min={0}
              onChange={handleValueSecChange(columnIndex)}
              pattern="[0-9]*"
              placeholder={t("workout_builder.session.seconds_short")}
              type="number"
              value={valuesSec[columnIndex] ?? ""}
            />
          </div>
        );
      case "WEIGHT":
        return (
          <div className="flex gap-1 w-full items-center">
            <input
              className={`${sessionField} w-1/2 text-center`}
              disabled={set.completed}
              min={0}
              onChange={handleValueIntChange(columnIndex)}
              pattern="[0-9]*"
              placeholder=""
              type="number"
              value={valuesInt[columnIndex] ?? ""}
            />
            <select
              className={`${sessionField} w-1/2`}
              disabled={set.completed}
              onChange={handleUnitChange(columnIndex)}
              value={units[columnIndex] ?? "kg"}
            >
              <option value="kg">kg</option>
              <option value="lbs">lbs</option>
            </select>
          </div>
        );
      case "REPS":
        return (
          <input
            className={`${sessionField} w-full text-center`}
            disabled={set.completed}
            min={0}
            onChange={handleValueIntChange(columnIndex)}
            pattern="[0-9]*"
            placeholder=""
            type="number"
            value={valuesInt[columnIndex] ?? ""}
          />
        );
      case "BODYWEIGHT":
        return <input className={`${sessionField} w-full text-center`} disabled={set.completed} placeholder="" readOnly value="✔" />;
      default:
        return null;
    }
  };

  return (
    <div
      className={`relative mb-3 flex w-full flex-col gap-2 rounded-xl px-2 py-4 transition-all duration-500 sm:px-4 ${
        set.completed
          ? "border-2 border-[var(--wc-dash-accent)] bg-[var(--wc-dash-inner)]"
          : "border border-[var(--wc-dash-border)] bg-[var(--wc-dash-card)]"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div
          className={`inline-flex min-h-12 items-center rounded-full px-3 text-lg font-bold transition-all duration-500 ${
            set.completed
              ? "bg-[var(--wc-dash-accent)] text-[var(--wc-dash-ink)]"
              : "border border-[var(--wc-dash-accent)] bg-[var(--wc-dash-card)] text-[var(--wc-dash-accent)]"
          }`}
        >
          {set.completed ? "✓ " : ""}
          {t("workout_builder.session.set_number", { number: setIndex + 1 })}
        </div>
        <Button
          aria-label={t("workout_builder.session.delete_set")}
          className={`${plainErrorButton} !min-h-12 !min-w-12 px-3`}
          disabled={set.completed}
          onClick={onRemove}
          type="button"
          variant="ghost"
        >
          <Trash2 className="h-5 w-5" />
        </Button>
      </div>

      {/* Columns of types, stack vertical on mobile, horizontal on md+ */}
      <div className="flex w-full flex-col gap-6 md:flex-row md:flex-wrap md:gap-2">
        {types.map((type, columnIndex) => {
          // An option is available if it's not used by another column, OR it's the current column's type.
          const availableTypes = AVAILABLE_WORKOUT_SET_TYPES.filter((option) => !types.includes(option) || option === type);

          return (
            <div className="flex w-full min-w-0 flex-col md:w-auto md:min-w-60 md:flex-1" key={columnIndex}>
              <div className="mb-1 flex w-full min-w-0 flex-col gap-1 sm:flex-row sm:items-center">
                <select
                  className={`${sessionField} w-full !px-2 sm:min-w-60 sm:!px-3`}
                  disabled={set.completed}
                  onChange={handleTypeChange(columnIndex)}
                  value={type}
                >
                  {availableTypes.map((availableType) => (
                    <option key={availableType} value={availableType}>
                      {typeLabels[availableType]}
                    </option>
                  ))}
                </select>
                {types.length > 1 && (
                  <Button
                    className={`${plainErrorButton} !min-h-12 !min-w-12 flex-shrink-0`}
                    onClick={() => removeColumn(columnIndex)}
                    size="small"
                    variant="ghost"
                  >
                    <Minus className="h-5 w-5" />
                  </Button>
                )}
              </div>
              {renderInputForType(type, columnIndex)}
            </div>
          );
        })}
      </div>

      {/* Add column button */}
      {types.length < MAX_WORKOUT_SET_COLUMNS && !set.completed && (
        <div className="flex w-full justify-start mt-1">
          <Button
            className={`${secondaryButton} mt-2 w-full px-4 md:w-auto`}
            disabled={set.completed}
            onClick={addColumn}
            variant="outline"
          >
            + {t("workout_builder.session.add_row")}
          </Button>
        </div>
      )}

      {/* Finish & Edit buttons, full width on mobile */}
      <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row">
        <Button
          className={`${accentButton} w-full !whitespace-normal px-4 sm:flex-1`}
          disabled={set.completed}
          onClick={onFinish}
          variant="default"
        >
          <span aria-hidden="true">✓</span>
          {t("workout_builder.session.finish_set")}
        </Button>
        {set.completed && (
          <Button className={`${secondaryButton} w-full !whitespace-normal px-4 sm:flex-1`} onClick={handleEdit} variant="outline">
            {t("commons.edit")}
          </Button>
        )}
      </div>
    </div>
  );
}
