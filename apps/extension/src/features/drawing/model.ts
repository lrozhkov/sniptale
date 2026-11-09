import { createDefaultSimplifySettings, type SimplifySettings } from '../simplify/settings';

export type DrawingTool =
  | 'select'
  | 'pencil'
  | 'marker'
  | 'shape'
  | 'arrow'
  | 'blur'
  | 'text'
  | 'simplify';

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

interface DrawingRotatableObjectBase extends DrawingObjectBase {
  readonly rotation?: number;
}

export interface DrawingPencilObject extends DrawingRotatableObjectBase {
  readonly kind: 'pencil';
  readonly samples: readonly DrawingSample[];
  readonly color: string;
  readonly width: number;
}

export interface DrawingMarkerObject extends DrawingRotatableObjectBase {
  readonly kind: 'marker';
  readonly samples: readonly DrawingSample[];
  readonly color: string;
  readonly opacity: number;
  readonly width: number;
}

export interface DrawingRectangleObject extends DrawingRotatableObjectBase {
  readonly kind: 'rectangle';
  readonly bounds: DrawingBounds;
  readonly color: string;
  readonly fillColor?: string | null;
  readonly skewX?: number;
  readonly width: number;
}

export interface DrawingEllipseObject extends DrawingRotatableObjectBase {
  readonly kind: 'ellipse';
  readonly bounds: DrawingBounds;
  readonly color: string;
  readonly fillColor?: string | null;
  readonly skewX?: number;
  readonly width: number;
}

export interface DrawingTriangleObject extends DrawingRotatableObjectBase {
  readonly kind: 'triangle';
  readonly bounds: DrawingBounds;
  readonly color: string;
  readonly fillColor?: string | null;
  readonly skewX?: number;
  readonly width: number;
}

export interface DrawingParallelogramObject extends DrawingRotatableObjectBase {
  readonly kind: 'parallelogram';
  readonly bounds: DrawingBounds;
  readonly color: string;
  readonly fillColor?: string | null;
  readonly skewX?: number;
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
  readonly bendPoints?: readonly DrawingPoint[];
  readonly color: string;
  readonly design?: DrawingArrowDesign;
  readonly dynamicWidth: boolean;
  readonly width: number;
}

export interface DrawingBlurObject extends DrawingRotatableObjectBase {
  readonly kind: 'blur';
  readonly bounds: DrawingBounds;
  readonly amount?: number;
}

export interface DrawingTextObject extends DrawingRotatableObjectBase {
  readonly kind: 'text';
  readonly bounds: DrawingBounds;
  readonly text: string;
  readonly color: string;
  readonly backgroundColor: string | null;
  readonly fontFamily?: DrawingFontFamily;
  readonly fontSize: number;
}

/** A local PNG raster. Result coordinates are local to the selected region. */
export interface DrawingSimplifySnapshot {
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
}

/** The retained source raster mapped into document coordinates. */
export interface DrawingSimplifySource extends DrawingSimplifySnapshot {
  readonly bounds: DrawingBounds;
}

export interface DrawingSimplifyObject extends DrawingRotatableObjectBase {
  readonly kind: 'simplify';
  readonly bounds: DrawingBounds;
  readonly settings: SimplifySettings;
  readonly result?: DrawingSimplifySnapshot;
  readonly source?: DrawingSimplifySource;
  /** The retained result needs recomputation after its lower-layer source changed. */
  readonly sourceDirty?: boolean;
  /** Identifies the engine that produced the retained PNG result. */
  readonly engineVersion?: string;
}

export type DrawingObject =
  | DrawingPencilObject
  | DrawingMarkerObject
  | DrawingShapeObject
  | DrawingArrowObject
  | DrawingBlurObject
  | DrawingTextObject
  | DrawingSimplifyObject;

export interface DrawingDocumentV1 {
  readonly version: 1;
  readonly objects: readonly Exclude<DrawingObject, DrawingSimplifyObject>[];
}

export interface DrawingDocumentV2 {
  readonly version: 2;
  readonly objects: readonly DrawingObject[];
}

export type DrawingDocument = DrawingDocumentV1 | DrawingDocumentV2;

export interface DrawingToolDefaults {
  readonly simplify: SimplifySettings;
  readonly pencil: { readonly color: string; readonly width: number };
  readonly marker: {
    readonly color: string;
    readonly opacity: number;
    readonly width: number;
  };
  readonly shape: {
    readonly color: string;
    readonly fillColor: string | null;
    readonly kind: DrawingCreatableShapeKind;
    readonly width: number;
  };
  readonly arrow: {
    readonly color: string;
    readonly design: DrawingArrowDesign;
    readonly drawFromTip: boolean;
    readonly dynamicWidth: boolean;
    readonly width: number;
  };
  readonly blur: { readonly amount: number };
  readonly text: {
    readonly color: string;
    readonly backgroundColor: string | null;
    readonly fontFamily: DrawingFontFamily;
    readonly fontSize: number;
  };
}

export type DrawingShapeKind = 'rectangle' | 'ellipse' | 'triangle' | 'parallelogram';
export type DrawingCreatableShapeKind = Exclude<DrawingShapeKind, 'parallelogram'>;
export type DrawingArrowDesign = 'standard' | 'freehand';
export const MAX_DRAWING_ARROW_BENDS = 128;
export type DrawingFontFamily = 'sans' | 'serif' | 'mono' | 'handwritten';

export const DRAWING_PENCIL_WIDTHS = [2, 4, 8, 16] as const;
export const DRAWING_MARKER_WIDTHS = [16, 28, 44] as const;
export const DRAWING_OUTLINE_WIDTHS = [2, 4, 8] as const;
export const DRAWING_ARROW_WIDTHS = [8, 12, 18, 24] as const;
export const DRAWING_MARKER_OPACITIES = [0.3, 0.6, 1] as const;
export const DRAWING_TEXT_SIZES = [16, 24, 36] as const;
export const DRAWING_BLUR_STRENGTHS = [2, 6, 20] as const;
export const DRAWING_TEXT_FONT_FAMILIES: readonly DrawingFontFamily[] = [
  'sans',
  'serif',
  'mono',
  'handwritten',
];

export function resolveDrawingTextFontFamily(fontFamily: DrawingFontFamily = 'sans'): string {
  switch (fontFamily) {
    case 'sans':
      return '"Sniptale Text", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    case 'serif':
      return 'Georgia, Cambria, "Times New Roman", Times, serif';
    case 'mono':
      return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    case 'handwritten':
      return '"Sniptale Handwritten", "Segoe Print", "Bradley Hand", cursive';
  }
}

export const DEFAULT_DRAWING_COLORS = [
  '#ff7f50',
  '#6495ed',
  '#32cd32',
  '#ffd700',
  '#ff4500',
  '#000000',
  '#ffffff',
  '#7b68ee',
  '#20b2aa',
  '#ff1493',
] as const;

export function createDefaultDrawingToolDefaults(
  palette: readonly string[] = DEFAULT_DRAWING_COLORS
): DrawingToolDefaults {
  const dark = palette[5] ?? palette[0] ?? DEFAULT_DRAWING_COLORS[5];
  const red = palette[4] ?? palette[0] ?? DEFAULT_DRAWING_COLORS[4];
  const yellow = palette[3] ?? red;
  return {
    simplify: createDefaultSimplifySettings(),
    pencil: { color: red, width: 4 },
    marker: { color: yellow, opacity: 0.3, width: 28 },
    shape: { color: red, fillColor: null, kind: 'rectangle', width: 4 },
    arrow: { color: red, design: 'standard', drawFromTip: false, dynamicWidth: true, width: 18 },
    blur: { amount: 20 },
    text: { color: dark, backgroundColor: null, fontFamily: 'handwritten', fontSize: 24 },
  };
}
