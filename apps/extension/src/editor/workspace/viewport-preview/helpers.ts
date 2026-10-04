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

  return {
    width: Math.round(resolvedMaxWidth),
    height: Math.round(
      clamp((resolvedMaxWidth * canvasHeight) / canvasWidth, PREVIEW_MIN_HEIGHT, PREVIEW_MAX_HEIGHT)
    ),
  };
}

export interface PreviewContentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function getPreviewContentRect(
  previewSize: { width: number; height: number },
  documentSize: { width: number; height: number }
): PreviewContentRect {
  if (documentSize.width <= 0 || documentSize.height <= 0) {
    return { left: 0, top: 0, ...previewSize };
  }
  const scale = Math.min(
    previewSize.width / documentSize.width,
    previewSize.height / documentSize.height
  );
  const width = documentSize.width * scale;
  const height = documentSize.height * scale;
  return {
    left: (previewSize.width - width) / 2,
    top: (previewSize.height - height) / 2,
    width,
    height,
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
  const content = getPreviewContentRect(args.previewSize, {
    width: args.viewport.canvasWidth,
    height: args.viewport.canvasHeight,
  });

  const safeLeft = Math.min(visibleLeft, visibleRight);
  const safeTop = Math.min(visibleTop, visibleBottom);
  const widthRatio = Math.max(0, (visibleRight - safeLeft) / args.viewport.scaledCanvasWidth);
  const heightRatio = Math.max(0, (visibleBottom - safeTop) / args.viewport.scaledCanvasHeight);
  const frameWidth = Math.min(
    content.width,
    Math.max(VIEWPORT_FRAME_MIN_SIZE, widthRatio * content.width)
  );
  const frameHeight = Math.min(
    content.height,
    Math.max(VIEWPORT_FRAME_MIN_SIZE, heightRatio * content.height)
  );

  return {
    left:
      content.left +
      clampFrame(
        (safeLeft / args.viewport.scaledCanvasWidth) * content.width,
        frameWidth,
        content.width
      ),
    top:
      content.top +
      clampFrame(
        (safeTop / args.viewport.scaledCanvasHeight) * content.height,
        frameHeight,
        content.height
      ),
    width: frameWidth,
    height: frameHeight,
  };
}
