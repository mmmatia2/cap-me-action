// Purpose: scaffold component boundary for screenshot annotation interactions.
// Inputs: screenshot URL and annotation records. Outputs: visual annotation canvas.
import React from "react";

export type Annotation = { id: string; x: number; y: number; width: number; height: number; label?: string; type?: "highlight" | "redact" };

export type AnnotationCanvasProps = {
  imageUrl: string;
  annotations: Annotation[];
  activeAnnotationId: string;
  onAnnotationClick: (id: string, e: React.MouseEvent) => void;
  draftAnnotation: { x: number; y: number; width: number; height: number } | null;
  onMouseDown: (e: React.MouseEvent) => void;
  annotationMode: "highlight" | "redact" | null;
  screenshotRef: React.RefObject<HTMLDivElement | null>;
};

export function AnnotationCanvas({ 
  imageUrl, 
  annotations, 
  activeAnnotationId, 
  onAnnotationClick, 
  draftAnnotation, 
  onMouseDown, 
  annotationMode, 
  screenshotRef 
}: AnnotationCanvasProps) {
  return (
    <div
      ref={screenshotRef}
      onMouseDown={onMouseDown}
      className={`
        relative border border-border rounded-xl overflow-hidden mb-3 select-none
        ${annotationMode ? "cursor-crosshair" : "cursor-default"}
      `}
    >
      <img src={imageUrl} alt="Step screenshot" className="w-full block" />
      
      {annotations.map((annotation) => {
        const isRedact = annotation.type === "redact";
        const isActive = annotation.id === activeAnnotationId;
        
        return (
          <button
            key={annotation.id}
            type="button"
            onClick={(e) => onAnnotationClick(annotation.id, e)}
            className="absolute rounded-md transition-all shadow-sm group"
            style={{
              left: `${annotation.x * 100}%`,
              top: `${annotation.y * 100}%`,
              width: `${annotation.width * 100}%`,
              height: `${annotation.height * 100}%`,
              border: isActive 
                ? "2px solid #fbbf24" 
                : isRedact ? "none" : "2px solid var(--accent)",
              backgroundColor: isRedact ? "rgba(0, 0, 0, 0.8)" : "rgba(59, 130, 246, 0.15)",
              backdropFilter: isRedact ? "blur(8px)" : "none",
            }}
            title={annotation.label || (isRedact ? "Redaction" : "Highlight")}
          >
            {annotation.label && !isActive && !isRedact && (
              <div className="absolute -top-6 left-0 bg-accent text-white text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                {annotation.label}
              </div>
            )}
          </button>
        );
      })}

      {draftAnnotation && (
        <div
          className="absolute rounded-md pointer-events-none"
          style={{
            left: `${draftAnnotation.x * 100}%`,
            top: `${draftAnnotation.y * 100}%`,
            width: `${draftAnnotation.width * 100}%`,
            height: `${draftAnnotation.height * 100}%`,
            border: annotationMode === "redact" ? "none" : "2px dashed var(--accent)",
            backgroundColor: annotationMode === "redact" ? "rgba(0, 0, 0, 0.5)" : "rgba(59, 130, 246, 0.12)",
            backdropFilter: annotationMode === "redact" ? "blur(4px)" : "none",
          }}
        />
      )}
    </div>
  );
}

