import type { BorderPadding } from '../contracts';
import type { FrameAnnotationVisualState } from '../frame-annotation/model';

const DEFAULT_STROKE_WIDTH = 3;
const DEFAULT_RADIUS = 0;

export interface FrameSurfaceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameSurfaceGeometry extends FrameSurfaceRect {
  radius: number;
  strokeWidth: number;
}

export interface FrameSurfaceComposition {
  geometry: FrameSurfaceGeometry;
  decorationVisible: boolean;
  strokeVisible: boolean;
  fillVisible: boolean;
}

export interface FrameSurfaceProjectionSettings {
  strokeWidth: number;
  padding: BorderPadding;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveNonNegative(value: number, fallback = 0): number {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function resolveDecorationVisible(frame: FrameAnnotationVisualState): boolean {
  switch (frame.effectMode ?? 'border') {
    case 'blur':
      return frame.blurSettings?.showBorder ?? false;
    case 'focus':
      return frame.focusSettings?.showBorder ?? false;
    case 'border':
      return true;
  }
}

export function resolveFrameSurface(frame: FrameAnnotationVisualState): FrameSurfaceComposition {
  const width = resolveNonNegative(frame.width);
  const height = resolveNonNegative(frame.height);
  const halfShortSide = Math.min(width, height) / 2;
  const requestedStrokeWidth = resolveNonNegative(
    frame.borderSettings?.width ?? DEFAULT_STROKE_WIDTH,
    DEFAULT_STROKE_WIDTH
  );
  const requestedRadius = resolveNonNegative(
    frame.borderSettings?.radius ?? DEFAULT_RADIUS,
    DEFAULT_RADIUS
  );
  const strokeWidth = clamp(requestedStrokeWidth, 0, halfShortSide);
  const decorationVisible = resolveDecorationVisible(frame);

  return {
    geometry: {
      x: frame.x,
      y: frame.y,
      width,
      height,
      radius: clamp(requestedRadius, 0, halfShortSide),
      strokeWidth,
    },
    decorationVisible,
    strokeVisible:
      decorationVisible && strokeWidth > 0 && (frame.borderSettings?.strokeOpacity ?? 100) > 0,
    fillVisible: decorationVisible && (frame.borderSettings?.fillOpacity ?? 0) > 0,
  };
}

export function projectElementFrameSurface(
  elementRect: FrameSurfaceRect,
  settings: FrameSurfaceProjectionSettings
): FrameSurfaceRect {
  const strokeWidth = resolveNonNegative(settings.strokeWidth);

  return {
    x: elementRect.x - settings.padding.left - strokeWidth,
    y: elementRect.y - settings.padding.top - strokeWidth,
    width: elementRect.width + settings.padding.left + settings.padding.right + strokeWidth * 2,
    height: elementRect.height + settings.padding.top + settings.padding.bottom + strokeWidth * 2,
  };
}
