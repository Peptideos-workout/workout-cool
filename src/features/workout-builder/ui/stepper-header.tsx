"use client";

import React from "react";

import { StepperStepProps } from "../types";

import { cn } from "@/shared/lib/utils";

interface StepperHeaderProps {
  steps: StepperStepProps[];
  currentStep: number;
  onStepClick?: (stepNumber: number) => void;
}

function StepperStep({
  description,
  isActive,
  isCompleted,
  stepNumber,
  title,
  currentStep,
  onStepClick,
}: StepperStepProps & { currentStep: number; onStepClick?: (stepNumber: number) => void }) {
  const canClick = stepNumber < currentStep || isCompleted;

  const handleClick = () => {
    if (canClick && onStepClick) {
      onStepClick(stepNumber);
    }
  };

  return (
    <>
      {/* Layout mobile - vertical avec texte à droite */}
      <div className="flex items-center text-left md:hidden">
        {/* Cercle */}
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all duration-200 flex-shrink-0",
            {
              "border-[var(--wc-dash-accent)] bg-[var(--wc-dash-accent)] text-[var(--wc-dash-ink)]": isCompleted,
              "border-[var(--wc-dash-accent)] bg-[var(--wc-dash-accent)] text-[var(--wc-dash-ink)]": isActive,
              "border-[var(--wc-dash-border)] bg-[var(--wc-dash-inner)] text-[var(--wc-dash-secondary)]": !isActive && !isCompleted,
            },
            canClick ? "cursor-pointer" : "cursor-default",
          )}
          data-wc-step-mark=""
          data-wc-step-state={isCompleted ? "done" : isActive ? "active" : "todo"}
          onClick={handleClick}
        >
          {isCompleted ? <span className="text-lg font-semibold">✓</span> : <span className="text-lg font-semibold">{stepNumber}</span>}
        </div>

        {/* Contenu textuel à droite */}
        <div className="ml-4">
          <h3
            className={cn("font-semibold text-lg transition-colors", {
              "text-[var(--wc-dash-accent)]": isCompleted,
              "text-[var(--wc-dash-accent)]": isActive,
              "text-[var(--wc-dash-secondary)]": !isActive && !isCompleted,
            })}
            data-wc-step-title=""
          >
            {title}
          </h3>
          <p
            className={cn(
              "text-lg mt-1 transition-colors",
              isActive || isCompleted ? "text-[var(--wc-dash-text)]" : "text-[var(--wc-dash-secondary)]",
            )}
            data-wc-step-caption=""
          >
            {description}
          </p>
        </div>
      </div>

      {/* Layout desktop - horizontal avec texte en bas */}
      <div className="hidden md:flex flex-col items-center text-center">
        {/* Cercle */}
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all duration-200",
            {
              "border-[var(--wc-dash-accent)] bg-[var(--wc-dash-accent)] text-[var(--wc-dash-ink)]": isCompleted,
              "border-[var(--wc-dash-accent)] bg-[var(--wc-dash-accent)] text-[var(--wc-dash-ink)]": isActive,
              "border-[var(--wc-dash-border)] bg-[var(--wc-dash-inner)] text-[var(--wc-dash-secondary)]": !isActive && !isCompleted,
            },
            canClick ? "cursor-pointer" : "cursor-default",
          )}
          data-wc-step-mark=""
          data-wc-step-state={isCompleted ? "done" : isActive ? "active" : "todo"}
          onClick={handleClick}
        >
          {isCompleted ? <span className="text-lg font-semibold">✓</span> : <span className="text-lg font-semibold">{stepNumber}</span>}
        </div>

        {/* Contenu textuel en bas */}
        <div className="mt-3">
          <h3
            className={cn("font-semibold text-lg transition-colors", {
              "text-[var(--wc-dash-accent)]": isCompleted,
              "text-[var(--wc-dash-accent)]": isActive,
              "text-[var(--wc-dash-secondary)]": !isActive && !isCompleted,
            })}
            data-wc-step-title=""
          >
            {title}
          </h3>
          <p
            className={cn(
              "text-lg mt-1 transition-colors",
              isActive || isCompleted ? "text-[var(--wc-dash-text)]" : "text-[var(--wc-dash-secondary)]",
            )}
            data-wc-step-caption=""
          >
            {description}
          </p>
        </div>
      </div>
    </>
  );
}

export function StepperHeader({ steps, currentStep, onStepClick }: StepperHeaderProps) {
  return (
    <div className={cn("w-full my-8 px-2 sm:px-6")} data-wc-steps="">
      {/* Layout mobile - vertical */}
      <div className="flex flex-col space-y-6 md:hidden" data-wc-steps-list="stack">
        {steps.map((step, index) => (
          <div className="relative" key={step.stepNumber}>
            <StepperStep {...step} currentStep={currentStep} onStepClick={onStepClick} />

            {/* Ligne de connexion verticale */}
            {index < steps.length - 1 && (
              <div
                className="absolute left-6 top-12 w-0.5 h-6 -translate-x-0.5"
                data-wc-step-line={step.isCompleted ? "done" : "todo"}
              >
                <div
                  className={cn(
                    "w-full h-full transition-colors duration-300",
                    step.isCompleted ? "bg-[var(--wc-dash-accent)]" : "bg-[var(--wc-dash-border)]",
                  )}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Layout desktop - horizontal */}
      <div className="hidden md:flex items-start" data-wc-steps-list="row">
        {steps.map((step, index) => (
          <React.Fragment key={step.stepNumber}>
            {/* Étape */}
            <div className="flex flex-col items-center">
              <StepperStep {...step} currentStep={currentStep} onStepClick={onStepClick} />
            </div>

            {/* Ligne de connexion horizontale */}
            {index < steps.length - 1 && (
              <div className="flex-1 flex items-center pt-6">
                <div
                  className={cn(
                    "w-full h-1 transition-colors duration-300",
                    step.isCompleted ? "bg-[var(--wc-dash-accent)]" : "bg-[var(--wc-dash-border)]",
                  )}
                />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
