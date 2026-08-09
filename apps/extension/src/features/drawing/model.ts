export type DrawingTool = 'select' | 'pencil' | 'marker' | 'shape' | 'arrow' | 'blur' | 'text';

export interface DrawingPoint {
  readonly x: number;
  readonly y: number;
}

export interface DrawingSample extends DrawingPoint {
  readonly t: number;
}

export interface DrawingBounds extends DrawingPoint {
  readonly width: number;
  readonly height: number;
}

interface DrawingObjectBase {
  readonly id: string;
}

export interface DrawingPencilObject extends DrawingObjectBase {
  readonly kind: 'pencil';
  readonly samples: readonly DrawingSample[];
  readonly color: string;
  readonly width: number;
}

export interface DrawingMarkerObject extends DrawingObjectBase {
  readonly kind: 'marker';
  readonly samples: readonly DrawingSample[];
  readonly color: string;
  readonly opacity: number;
  readonly width: number;
}

export interface DrawingRectangleObject extends DrawingObjectBase {
  readonly kind: 'rectangle';
  readonly bounds: DrawingBounds;
  readonly color: string;
  readonly width: number;
}

export interface DrawingEllipseObject extends DrawingObjectBase {
  readonly kind: 'ellipse';
  readonly bounds: DrawingBounds;
  readonly color: string;
  readonly width: number;
}

export interface DrawingTriangleObject extends DrawingObjectBase {
  readonly kind: 'triangle';
  readonly bounds: DrawingBounds;
  readonly color: string;
  readonly width: number;
}

export interface DrawingParallelogramObject extends DrawingObjectBase {
  readonly kind: 'parallelogram';
  readonly bounds: DrawingBounds;
  readonly color: string;
  readonly width: number;
}

export type DrawingShapeObject =
  | DrawingRectangleObject
  | DrawingEllipseObject
  | DrawingTriangleObject
  | DrawingParallelogramObject;

export interface DrawingArrowObject extends DrawingObjectBase {
  readonly kind: 'arrow';
  readonly start: DrawingPoint;
  readonly end: DrawingPoint;
  readonly color: string;
  readonly dynamicWidth: boolean;
  readonly width: number;
}

export interface DrawingBlurObject extends DrawingObjectBase {
  readonly kind: 'blur';
  readonly bounds: DrawingBounds;
}

export interface DrawingTextObject extends DrawingObjectBase {
  readonly kind: 'text';
  readonly bounds: DrawingBounds;
  readonly text: string;
  readonly color: string;
  readonly backgroundColor: string | null;
  readonly fontSize: number;
}

export type DrawingObject =
  | DrawingPencilObject
  | DrawingMarkerObject
  | DrawingShapeObject
  | DrawingArrowObject
  | DrawingBlurObject
  | DrawingTextObject;

export interface DrawingDocumentV1 {
  readonly version: 1;
  readonly objects: readonly DrawingObject[];
}

export interface DrawingToolDefaults {
  readonly pencil: { readonly color: string; readonly width: number };
  readonly marker: {
    readonly color: string;
    readonly opacity: number;
    readonly width: number;
  };
  readonly shape: {
    readonly color: string;
    readonly kind: DrawingShapeKind;
    readonly width: number;
  };
  readonly arrow: {
    readonly color: string;
    readonly dynamicWidth: boolean;
    readonly width: number;
  };
  readonly text: {
    readonly color: string;
    readonly backgroundColor: string | null;
    readonly fontSize: number;
  };
}

export type DrawingShapeKind = 'rectangle' | 'ellipse' | 'triangle' | 'parallelogram';

export const DRAWING_PENCIL_WIDTHS = [2, 4, 8, 16] as const;
export const DRAWING_MARKER_WIDTHS = [16, 28, 44] as const;
export const DRAWING_OUTLINE_WIDTHS = [2, 4, 8] as const;
export const DRAWING_ARROW_WIDTHS = [8, 12, 18, 24] as const;
export const DRAWING_MARKER_OPACITIES = [0.3, 0.6, 1] as const;
export const DRAWING_TEXT_SIZES = [16, 24, 36] as const;

export const DEFAULT_DRAWING_COLORS = [
  '#f97316',
  '#60a5fa',
  '#22c55e',
  '#facc15',
  '#ef4444',
  '#111827',
  '#ffffff',
  '#14b8a6',
  '#8b5cf6',
  '#ec4899',
] as const;

export function createDefaultDrawingToolDefaults(
  palette: readonly string[] = DEFAULT_DRAWING_COLORS
): DrawingToolDefaults {
  const dark = palette[5] ?? palette[0] ?? DEFAULT_DRAWING_COLORS[5];
  const red = palette[4] ?? palette[0] ?? DEFAULT_DRAWING_COLORS[4];
  const yellow = palette[3] ?? red;
  return {
    pencil: { color: red, width: 4 },
    marker: { color: yellow, opacity: 0.3, width: 28 },
    shape: { color: red, kind: 'rectangle', width: 4 },
    arrow: { color: red, dynamicWidth: true, width: 18 },
    text: { color: dark, backgroundColor: null, fontSize: 24 },
  };
}
