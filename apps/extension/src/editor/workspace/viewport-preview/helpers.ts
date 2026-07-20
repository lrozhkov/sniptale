import { clamp } from '../../document/model';
import type { EditorViewportMetrics } from './types';

const PREVIEW_MAX_WIDTH = 196;
const PREVIEW_MAX_HEIGHT = 138;
const PREVIEW_MIN_WIDTH = 112;
const PREVIEW_MIN_HEIGHT = 80;
export const PREVIEW_FPS = 20;
const VIEWPORT_FRAME_MIN_SIZE = 18;

function clampFrame(value: number, size: number, limit: number): number {
  return clamp(value, 0, Math.max(0, limit - size));
}

export function getPreviewSize(
  canvasWidth: number,
  canvasHeight: number,
  maxWidth = PREVIEW_MAX_WIDTH
) {
  const resolvedMaxWidth = Math.max(PREVIEW_MIN_WIDTH, maxWidth);

  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return { width: resolvedMaxWidth, height: PREVIEW_MIN_HEIGHT };
  }

  const aspectRatio = canvasWidth / canvasHeight;
  let width = resolvedMaxWidth;
  let height = width / aspectRatio;

  if (height > PREVIEW_MAX_HEIGHT) {
    height = PREVIEW_MAX_HEIGHT;
    width = height * aspectRatio;
  }

  return {
    width: Math.round(clamp(width, PREVIEW_MIN_WIDTH, resolvedMaxWidth)),
    height: Math.round(clamp(height, PREVIEW_MIN_HEIGHT, PREVIEW_MAX_HEIGHT)),
  };
}

function getVisibleViewportBounds(viewport: EditorViewportMetrics) {
  return {
    visibleBottom: Math.min(
      viewport.scaledCanvasHeight,
      viewport.scrollTop + viewport.viewportHeight - viewport.canvasOffsetTop
    ),
    visibleLeft: Math.max(0, viewport.scrollLeft - viewport.canvasOffsetLeft),
    visibleRight: Math.min(
      viewport.scaledCanvasWidth,
      viewport.scrollLeft + viewport.viewportWidth - viewport.canvasOffsetLeft
    ),
    visibleTop: Math.max(0, viewport.scrollTop - viewport.canvasOffsetTop),
  };
}

export function getViewportCenter(viewport: EditorViewportMetrics) {
  if (viewport.scaledCanvasWidth <= 0 || viewport.scaledCanvasHeight <= 0) {
    return { x: 0.5, y: 0.5 };
  }

  return {
    x: clamp(
      (viewport.scrollLeft + viewport.viewportWidth / 2 - viewport.canvasOffsetLeft) /
        viewport.scaledCanvasWidth,
      0,
      1
    ),
    y: clamp(
      (viewport.scrollTop + viewport.viewportHeight / 2 - viewport.canvasOffsetTop) /
        viewport.scaledCanvasHeight,
      0,
      1
    ),
  };
}

export function getViewportFrame(args: {
  previewSize: { width: number; height: number };
  viewport: EditorViewportMetrics;
}): React.CSSProperties | null {
  if (args.viewport.scaledCanvasWidth <= 0 || args.viewport.scaledCanvasHeight <= 0) {
    return null;
  }

  const { visibleBottom, visibleLeft, visibleRight, visibleTop } = getVisibleViewportBounds(
    args.viewport
  );

  const safeLeft = Math.min(visibleLeft, visibleRight);
  const safeTop = Math.min(visibleTop, visibleBottom);
  const widthRatio = Math.max(0, (visibleRight - safeLeft) / args.viewport.scaledCanvasWidth);
  const heightRatio = Math.max(0, (visibleBottom - safeTop) / args.viewport.scaledCanvasHeight);
  const frameWidth = Math.min(
    args.previewSize.width,
    Math.max(VIEWPORT_FRAME_MIN_SIZE, Math.round(widthRatio * args.previewSize.width))
  );
  const frameHeight = Math.min(
    args.previewSize.height,
    Math.max(VIEWPORT_FRAME_MIN_SIZE, Math.round(heightRatio * args.previewSize.height))
  );

  return {
    left: clampFrame(
      (safeLeft / args.viewport.scaledCanvasWidth) * args.previewSize.width,
      frameWidth,
      args.previewSize.width
    ),
    top: clampFrame(
      (safeTop / args.viewport.scaledCanvasHeight) * args.previewSize.height,
      frameHeight,
      args.previewSize.height
    ),
    width: frameWidth,
    height: frameHeight,
  };
}
