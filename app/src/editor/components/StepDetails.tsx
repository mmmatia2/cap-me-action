// Purpose: scaffold component boundary for primary step fields (title/instruction/note).
// Inputs: selected step and update callback. Outputs: editable step detail form.
import React from "react";

type StepDetailsProps = {
  title: string;
  instruction: string;
  note: string;
  onChange: (patch: { title?: string; instruction?: string; note?: string }) => void;
};

export function StepDetails({ title, instruction, note, onChange }: StepDetailsProps) {
  return (
    <section>
      <label>
        Title
        <input value={title} onChange={(event) => onChange({ title: event.target.value })} />
      </label>
      <label>
        Instruction
        <textarea value={instruction} onChange={(event) => onChange({ instruction: event.target.value })} />
      </label>
      <label>
        Note
        <textarea value={note} onChange={(event) => onChange({ note: event.target.value })} />
      </label>
    </section>
  );
}

