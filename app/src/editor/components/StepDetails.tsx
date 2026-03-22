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
    <div className="editor-fields">
      <div className="editor-field">
        <label htmlFor="title" className="editor-field__label">Title</label>
        <input
          id="title"
          className="editor-field__input"
          value={title}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </div>

      <div className="editor-field">
        <label htmlFor="instruction" className="editor-field__label">Instruction</label>
        <textarea
          id="instruction"
          rows={3}
          className="editor-field__input resize-y"
          value={instruction}
          onChange={(event) => onChange({ instruction: event.target.value })}
        />
      </div>

      <div className="editor-field">
        <label htmlFor="note" className="editor-field__label">Note <span className="editor-field__hint">(Optional)</span></label>
        <textarea
          id="note"
          rows={2}
          className="editor-field__input resize-y"
          value={note}
          onChange={(event) => onChange({ note: event.target.value })}
        />
      </div>
    </div>
  );
}

