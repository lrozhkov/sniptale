export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasFrame extends CanvasPoint {
  height: number;
  width: number;
}

export type CanvasResizeHandle = 'ne' | 'nw' | 'se' | 'sw';

export interface CanvasClientPoint {
  clientX: number;
  clientY: number;
}
