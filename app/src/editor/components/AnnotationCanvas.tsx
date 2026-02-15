// Purpose: scaffold component boundary for screenshot annotation interactions.
// Inputs: screenshot URL and annotation records. Outputs: visual annotation canvas.
import React from "react";

type Annotation = { id: string; x: number; y: number; width: number; height: number; label?: string };

type AnnotationCanvasProps = {
  imageUrl: string;
  annotations: Annotation[];
};

export function AnnotationCanvas({ imageUrl, annotations }: AnnotationCanvasProps) {
  return (
    <figure style={{ margin: 0 }}>
      <img src={imageUrl} alt="Step screenshot" style={{ width: "100%", display: "block" }} />
      <figcaption>{annotations.length} highlight(s)</figcaption>
    </figure>
  );
}

