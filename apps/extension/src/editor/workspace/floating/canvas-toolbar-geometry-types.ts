export type CanvasSelectionToolbarPlacement = 'above-selection' | 'below-selection';

export interface ToolbarGeometry {
  left: number;
  placement: CanvasSelectionToolbarPlacement;
  top: number;
}

export interface ToolbarGeometryState {
  geometry: ToolbarGeometry | null;
  visibilityRevision: number;
}
