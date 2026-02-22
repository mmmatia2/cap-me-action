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
    <div className="flex flex-col gap-2">
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
            className={`
              group flex flex-col gap-2 p-3 rounded-xl border transition-all duration-200
              ${isSelected ? "bg-surface-2 border-accent shadow-sm" : "bg-surface border-border hover:border-muted"}
              ${dragStyles}
            `}
          >
            <div className="flex items-start gap-2">
              <div 
                className="mt-1 cursor-grab text-muted hover:text-text transition-colors"
                title="Drag to reorder"
              >
                <GripVertical size={16} />
              </div>
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                className="flex-1 text-left bg-transparent border-none p-0 cursor-pointer font-medium text-text leading-snug"
              >
                <span className="text-muted mr-1.5 font-mono text-sm">#{step.stepIndex ?? "?"}</span>
                {step.title ?? "Untitled"}
              </button>
            </div>
            
            <div className="flex items-center gap-1.5 ml-6 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => onMove(step.id, -1)}
                disabled={idx === 0}
                className="p-1.5 rounded-md text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                title="Move up"
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => onMove(step.id, 1)}
                disabled={idx === steps.length - 1}
                className="p-1.5 rounded-md text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                title="Move down"
              >
                <ArrowDown size={14} />
              </button>
              {onMergeWithNext && (
                <button
                  type="button"
                  onClick={() => onMergeWithNext(step.id)}
                  disabled={idx === steps.length - 1}
                  className="p-1.5 rounded-md text-muted hover:text-accent hover:bg-accent/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                  title="Merge with next step"
                >
                  <Merge size={14} className="transform rotate-90" />
                </button>
              )}
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => onDelete(step.id)}
                className="p-1.5 rounded-md text-muted hover:text-danger hover:bg-danger/10 transition-colors"
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

