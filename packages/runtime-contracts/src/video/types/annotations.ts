export const AnnotationType = {
  RECTANGLE: 'RECTANGLE',
  ARROW: 'ARROW',
  PATH: 'PATH',
} as const;

export type AnnotationType = (typeof AnnotationType)[keyof typeof AnnotationType];

export interface Annotation {
  id: string;
  type: AnnotationType;
  createdAt: number;
  svgElement: SVGElement;
}

export interface RectangleAnnotation extends Annotation {
  type: typeof AnnotationType.RECTANGLE;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArrowAnnotation extends Annotation {
  type: typeof AnnotationType.ARROW;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PathAnnotation extends Annotation {
  type: typeof AnnotationType.PATH;
  points: Array<{ x: number; y: number }>;
  d: string;
}

export interface VideoQualityConfig {
  mimeType: string;
  videoBitsPerSecond: number;
  frameRate: number;
}
