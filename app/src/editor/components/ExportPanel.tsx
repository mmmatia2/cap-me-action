// Purpose: scaffold component boundary for grouped export actions and privacy messaging.
// Inputs: export handlers + enable flags. Outputs: export controls block.
import React from "react";
import { Download, FileJson, FileCode2, FileText, File } from "lucide-react";

export type ExportPanelProps = {
  disabled: boolean;
  onJson: () => void;
  onMarkdown: () => void;
  onHtml: () => void;
  onPdf: () => void;
};

export function ExportPanel({ disabled, onJson, onMarkdown, onHtml, onPdf }: ExportPanelProps) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <button 
        type="button" 
        onClick={onJson} 
        disabled={disabled}
        className="app-button"
      >
        <FileJson size={16} />
        Export JSON
      </button>
      <button 
        type="button" 
        onClick={onMarkdown} 
        disabled={disabled}
        className="app-button"
      >
        <FileText size={16} />
        Export Markdown
      </button>
      <button 
        type="button" 
        onClick={onHtml} 
        disabled={disabled}
        className="app-button"
      >
        <FileCode2 size={16} />
        Export HTML
      </button>
      <button 
        type="button" 
        onClick={onPdf} 
        disabled={disabled}
        className="app-button app-button--primary"
      >
        <File size={16} />
        Export PDF
      </button>
    </div>
  );
}

