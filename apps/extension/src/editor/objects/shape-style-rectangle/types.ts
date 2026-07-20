import type { FabricObject, Point } from 'fabric';

export type RectangleLike = FabricObject & {
  getCenterPoint?: () => { x: number; y: number };
  height?: number;
  left?: number;
  sniptaleRole?: string;
  sniptaleShapeRadius?: number;
  sniptaleType?: string;
  rx?: number;
  ry?: number;
  scaleX?: number;
  scaleY?: number;
  set: (values: Record<string, unknown>) => unknown;
  setPositionByOrigin?: (point: Point, originX: 'center', originY: 'center') => unknown;
  strokeWidth?: number;
  top?: number;
  width?: number;
};

export interface RectangleVisualState {
  center: { x: number; y: number };
  outerHeight: number;
  outerWidth: number;
}
