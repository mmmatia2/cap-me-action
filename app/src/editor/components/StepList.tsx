// Purpose: scaffold component boundary for step list rendering and interactions.
// Inputs: steps and callbacks. Outputs: UI section for selecting/reordering/deleting steps.
import React from "react";
import { GripVertical, ArrowUp, ArrowDown, Trash2, Merge } from "lucide-react";

export type StepSummary = { id: string; stepIndex?: number; title?: string };

export type StepListProps = {
  steps: StepSummary[];
  selectedId: string | null;
  onSelect: (stepId: string) => void;
  onMove: (stepId: string, direction: -1 | 1) => void;
  onDelete: (stepId: string) => void;
  onMergeWithNext?: (stepId: string) => void;
  onDragStart: (stepId: string, e: React.DragEvent) => void;
  onDragOver: (stepId: string, e: React.DragEvent) => void;
  onDrop: (stepId: string, e: React.DragEvent) => void;
  onDragEnd: () => void;
  dragState: { dragId: string; overId: string; placement: "before" | "after" };
};

export function StepList({
  steps,
  selectedId,
  onSelect,
  onMove,
  onDelete,
  onMergeWithNext,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dragState,
}: StepListProps) {
  return (
    <div className="step-list">
      {steps.map((step, idx) => {
        const isSelected = step.id === selectedId;
        const isOver = dragState.overId === step.id;
        const dragStyles = isOver
          ? dragState.placement === "before"
            ? "border-t-2 border-t-accent"
            : "border-b-2 border-b-accent"
          : "";

        return (
          <div
            key={step.id}
            draggable
            onDragStart={(e) => onDragStart(step.id, e)}
            onDragOver={(e) => onDragOver(step.id, e)}
            onDrop={(e) => onDrop(step.id, e)}
            onDragEnd={onDragEnd}
            className={`step-item ${isSelected ? "step-item--active" : ""} ${dragStyles}`}
          >
            <div className="step-item__top">
              <div 
                className="step-item__drag"
                title="Drag to reorder"
              >
                <GripVertical size={16} />
              </div>
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                className="step-item__title"
              >
                <span className="step-item__index">#{step.stepIndex ?? "?"}</span>
                {step.title ?? "Untitled"}
              </button>
            </div>
            
            <div className="step-item__actions">
              <button
                type="button"
                onClick={() => onMove(step.id, -1)}
                disabled={idx === 0}
                className="step-item__action"
                title="Move up"
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => onMove(step.id, 1)}
                disabled={idx === steps.length - 1}
                className="step-item__action"
                title="Move down"
              >
                <ArrowDown size={14} />
              </button>
              {onMergeWithNext && (
                <button
                  type="button"
                  onClick={() => onMergeWithNext(step.id)}
                  disabled={idx === steps.length - 1}
                  className="step-item__action"
                  title="Merge with next step"
                >
                  <Merge size={14} className="transform rotate-90" />
                </button>
              )}
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => onDelete(step.id)}
                className="step-item__action step-item__action--danger"
                title="Delete step"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

