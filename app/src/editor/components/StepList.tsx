// Purpose: scaffold component boundary for step list rendering and interactions.
// Inputs: steps and callbacks. Outputs: UI section for selecting/reordering/deleting steps.
import React from "react";

type StepSummary = { id: string; stepIndex?: number; title?: string };

type StepListProps = {
  steps: StepSummary[];
  selectedId: string | null;
  onSelect: (stepId: string) => void;
};

export function StepList({ steps, selectedId, onSelect }: StepListProps) {
  return (
    <div>
      {steps.map((step) => (
        <button key={step.id} type="button" onClick={() => onSelect(step.id)}>
          {step.id === selectedId ? "• " : ""}
          #{step.stepIndex ?? "?"} {step.title ?? "Untitled"}
        </button>
      ))}
    </div>
  );
}

