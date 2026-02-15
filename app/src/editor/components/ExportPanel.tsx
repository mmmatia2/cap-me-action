// Purpose: scaffold component boundary for grouped export actions and privacy messaging.
// Inputs: export handlers + enable flags. Outputs: export controls block.
import React from "react";

type ExportPanelProps = {
  disabled: boolean;
  onJson: () => void;
  onMarkdown: () => void;
  onHtml: () => void;
};

export function ExportPanel({ disabled, onJson, onMarkdown, onHtml }: ExportPanelProps) {
  return (
    <div>
      <button type="button" onClick={onJson} disabled={disabled}>Export JSON</button>
      <button type="button" onClick={onMarkdown} disabled={disabled}>Export Markdown</button>
      <button type="button" onClick={onHtml} disabled={disabled}>Export HTML</button>
    </div>
  );
}

