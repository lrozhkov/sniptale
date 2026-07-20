import type { FabricObject, Point } from 'fabric';

export interface DrawSession {
  tool:
    | 'rectangle'
    | 'ellipse'
    | 'diamond'
    | 'blur'
    | 'arrow'
    | 'line'
    | 'text'
    | 'crop'
    | 'rich-shape';
  start: Point;
  lastPoint?: Point;
  objectId: string;
  object?: FabricObject;
}

export interface CropSelection {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ApplyDocumentOptions {
  resetHistory?: boolean;
  updateOriginal?: boolean;
}

export interface OpenImageOptions {
  browserFrameUrl?: string;
  pageTitle?: string;
  sourceFaviconUrl?: string | null;
}

export interface ViewportAnchor {
  relativeX: number;
  relativeY: number;
}

export interface PanSession {
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
}

export interface ViewportMetrics {
  viewportWidth: number;
  viewportHeight: number;
  scrollLeft: number;
  scrollTop: number;
  scaledCanvasWidth: number;
  scaledCanvasHeight: number;
  canvasOffsetLeft: number;
  canvasOffsetTop: number;
  domScaleCompensation: number;
}
