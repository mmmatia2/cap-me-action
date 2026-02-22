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
        className="flex items-center gap-1.5 px-4 py-2 bg-surface text-text border border-border rounded-lg hover:bg-surface-2 hover:border-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm shadow-sm"
      >
        <FileJson size={16} />
        Export JSON
      </button>
      <button 
        type="button" 
        onClick={onMarkdown} 
        disabled={disabled}
        className="flex items-center gap-1.5 px-4 py-2 bg-surface text-text border border-border rounded-lg hover:bg-surface-2 hover:border-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm shadow-sm"
      >
        <FileText size={16} />
        Export Markdown
      </button>
      <button 
        type="button" 
        onClick={onHtml} 
        disabled={disabled}
        className="flex items-center gap-1.5 px-4 py-2 bg-surface text-text border border-border rounded-lg hover:bg-surface-2 hover:border-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm shadow-sm"
      >
        <FileCode2 size={16} />
        Export HTML
      </button>
      <button 
        type="button" 
        onClick={onPdf} 
        disabled={disabled}
        className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white border border-transparent rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm shadow-sm"
      >
        <File size={16} />
        Export PDF
      </button>
    </div>
  );
}

