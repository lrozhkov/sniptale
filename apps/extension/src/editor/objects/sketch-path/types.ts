export interface SketchPoint {
  x: number;
  y: number;
}

export interface SketchPolylineOptions {
  bowing?: number | undefined;
  roughness: number;
  seed: number;
  strokeWidth: number;
}
