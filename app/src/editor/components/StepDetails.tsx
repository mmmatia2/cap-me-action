// Purpose: scaffold component boundary for primary step fields (title/instruction/note).
// Inputs: selected step and update callback. Outputs: editable step detail form.
import React from "react";

export type StepDetailsProps = {
  title: string;
  instruction: string;
  note: string;
  onChange: (patch: { title?: string; instruction?: string; note?: string }) => void;
};

export function StepDetails({ title, instruction, note, onChange }: StepDetailsProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-sm font-semibold text-text">Title</label>
        <input
          id="title"
          className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
          value={title}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="instruction" className="text-sm font-semibold text-text">Instruction</label>
        <textarea
          id="instruction"
          rows={3}
          className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all resize-y"
          value={instruction}
          onChange={(event) => onChange({ instruction: event.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="note" className="text-sm font-semibold text-text">Note <span className="font-normal text-muted">(Optional)</span></label>
        <textarea
          id="note"
          rows={2}
          className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all resize-y"
          value={note}
          onChange={(event) => onChange({ note: event.target.value })}
        />
      </div>
    </div>
  );
}

