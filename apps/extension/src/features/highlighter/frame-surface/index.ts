import type { BorderPadding } from '../contracts';
import type { FrameAnnotationVisualState } from '../frame-annotation/model';
import { hasVisibleColor } from '@sniptale/foundation/color';

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

export interface FocusCutoutGeometry extends FrameSurfaceRect {
  radius: number;
}

export interface FrameSurfaceComposition {
  geometry: FrameSurfaceGeometry;
  decorationVisible: boolean;
  strokeVisible: boolean;
  fillVisible: boolean;
}

export interface FrameSurfaceProjectionSettings {
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
  const strokeWidth = requestedStrokeWidth;
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
      decorationVisible && strokeWidth > 0 && hasVisibleColor(frame.borderSettings?.color),
    fillVisible: decorationVisible && hasVisibleColor(frame.borderSettings?.fillColor),
  };
}

export function resolveFocusCutoutGeometry(frame: FrameAnnotationVisualState): FocusCutoutGeometry {
  const surface = resolveFrameSurface(frame);

  return {
    x: surface.geometry.x,
    y: surface.geometry.y,
    width: surface.geometry.width,
    height: surface.geometry.height,
    radius: surface.geometry.radius,
  };
}

export function projectElementFrameSurface(
  elementRect: FrameSurfaceRect,
  settings: FrameSurfaceProjectionSettings
): FrameSurfaceRect {
  return {
    x: elementRect.x - settings.padding.left,
    y: elementRect.y - settings.padding.top,
    width: elementRect.width + settings.padding.left + settings.padding.right,
    height: elementRect.height + settings.padding.top + settings.padding.bottom,
  };
}

export function reprojectFrameSurfacePadding(
  surfaceRect: FrameSurfaceRect,
  previousPadding: BorderPadding,
  nextPadding: BorderPadding
): FrameSurfaceRect {
  const elementRect = {
    x: surfaceRect.x + previousPadding.left,
    y: surfaceRect.y + previousPadding.top,
    width: Math.max(0, surfaceRect.width - previousPadding.left - previousPadding.right),
    height: Math.max(0, surfaceRect.height - previousPadding.top - previousPadding.bottom),
  };
  const projected = projectElementFrameSurface(elementRect, { padding: nextPadding });
  return {
    ...projected,
    width: Math.max(1, projected.width),
    height: Math.max(1, projected.height),
  };
}
