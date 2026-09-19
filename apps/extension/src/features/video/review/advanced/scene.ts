import { fitVideoRect } from '../geometry';
import type {
  QuickEditBackgroundSettings,
  QuickEditCameraTransform,
  QuickEditZoomRegion,
} from './types';

export interface QuickEditRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type QuickEditPoint = { x: number; y: number };

/** Camera default showing the full video with no magnification. */
const QUICK_EDIT_IDENTITY_CAMERA: QuickEditCameraTransform = {
  scale: 1,
  centerX: 0.5,
  centerY: 0.5,
};

const easing = (progress: number, type: QuickEditZoomRegion['enter']['type']) => {
  if (type === 'none') return 1;
  if (type === 'linear') return progress;
  return progress * progress * (3 - 2 * progress);
};

/** Content area inside the output frame; padding never collapses the canvas below one pixel. */
export function computeQuickEditContentRect(
  output: { width: number; height: number },
  background: QuickEditBackgroundSettings
): QuickEditRect {
  const padding = background.enabled ? background.layout.padding : 0;
  const x = Math.min(padding, output.width / 2);
  const y = Math.min(padding, output.height / 2);
  return {
    x,
    y,
    width: Math.max(1, output.width - 2 * x),
    height: Math.max(1, output.height - 2 * y),
  };
}

/**
 * One scene layout for preview and export: background padding, fitted video, and camera.
 * The stored camera target stays normalized to the video; only the canvas conversion
 * changes when the background layout changes.
 */
export function computeQuickEditSceneLayout(input: {
  output: { width: number; height: number };
  source: { width: number; height: number };
  background: QuickEditBackgroundSettings;
  camera: QuickEditCameraTransform;
}): {
  contentRect: QuickEditRect;
  videoRect: QuickEditRect;
  videoTransform: QuickEditRect;
} {
  const contentRect = computeQuickEditContentRect(input.output, input.background);
  const fitted = fitVideoRect(contentRect, input.source);
  const videoRect = {
    x: contentRect.x + fitted.x,
    y: contentRect.y + fitted.y,
    width: fitted.width,
    height: fitted.height,
  };
  return {
    contentRect,
    videoRect,
    videoTransform: computeQuickEditVideoTransform({ videoRect, camera: input.camera }),
  };
}

/**
 * Camera zoom expressed relative to the fitted video rect: the stored focus point stays
 * fixed on the canvas while the video scales around it; the background crops to
 * contentRect.
 */
export function computeQuickEditVideoTransform(args: {
  videoRect: QuickEditRect;
  camera: QuickEditCameraTransform;
}): QuickEditRect {
  const { camera, videoRect } = args;
  const focusX = videoRect.x + camera.centerX * videoRect.width;
  const focusY = videoRect.y + camera.centerY * videoRect.height;
  const width = videoRect.width * camera.scale;
  const height = videoRect.height * camera.scale;
  return {
    x: focusX - camera.centerX * width,
    y: focusY - camera.centerY * height,
    width,
    height,
  };
}

/** Content-attached points ride the video transform; callers crop against contentRect. */
export function quickEditContentPointToCanvas(
  point: QuickEditPoint,
  videoTransform: QuickEditRect
): QuickEditPoint {
  return {
    x: videoTransform.x + point.x * videoTransform.width,
    y: videoTransform.y + point.y * videoTransform.height,
  };
}

/** Inverse mapping for canvas drags; points outside the video have no content coordinate. */
export function quickEditCanvasPointToContent(
  point: QuickEditPoint,
  videoTransform: QuickEditRect
): QuickEditPoint | null {
  if (!(videoTransform.width > 0) || !(videoTransform.height > 0)) return null;
  const x = (point.x - videoTransform.x) / videoTransform.width;
  const y = (point.y - videoTransform.y) / videoTransform.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

function cameraProgress(
  region: QuickEditZoomRegion,
  timelineTime: number,
  phase: 'enter' | 'exit'
): number {
  const transition = region[phase];
  // A none transition never consumes region time: the camera holds its target
  // from the start (enter) or until the region actually ends (exit).
  if (transition.type === 'none') return 1;
  const boundary = phase === 'enter' ? region.start : region.end - transition.duration;
  if (transition.duration <= 0) return 1;
  if (phase === 'exit') {
    if (timelineTime <= boundary) return 1;
    return 1 - easing((timelineTime - boundary) / transition.duration, transition.type);
  }
  if (timelineTime >= region.start + transition.duration) return 1;
  return easing((timelineTime - region.start) / transition.duration, transition.type);
}

/**
 * Over-long enter/exit pairs normalize proportionally into the region so the
 * camera always reaches its target; only evaluation changes, never the stored
 * region. Returns the effective transition durations for this region length.
 */
function normalizeQuickEditZoomTransitions(region: QuickEditZoomRegion): {
  enter: number;
  exit: number;
} {
  const sum = region.enter.duration + region.exit.duration;
  const available = Math.max(0, region.end - region.start);
  if (sum <= available || sum <= 0)
    return { enter: region.enter.duration, exit: region.exit.duration };
  const factor = available / sum;
  return { enter: region.enter.duration * factor, exit: region.exit.duration * factor };
}

const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;

/**
 * Camera at a timeline time over validated (ascending, non-overlapping) zoom regions.
 * Regions are half-open [start, end): adjacent regions hand over exactly at the boundary.
 */
export function evaluateQuickEditCameraAtTime(
  regions: readonly QuickEditZoomRegion[],
  timelineTime: number
): QuickEditCameraTransform {
  for (const region of regions) {
    if (timelineTime < region.start || timelineTime >= region.end) continue;
    const normalized = normalizeQuickEditZoomTransitions(region);
    const scaled: QuickEditZoomRegion = {
      ...region,
      enter: { ...region.enter, duration: normalized.enter },
      exit: { ...region.exit, duration: normalized.exit },
    };
    const progress = Math.min(
      cameraProgress(scaled, timelineTime, 'enter'),
      cameraProgress(scaled, timelineTime, 'exit')
    );
    return {
      scale: lerp(1, region.transform.scale, progress),
      centerX: lerp(0.5, region.transform.centerX, progress),
      centerY: lerp(0.5, region.transform.centerY, progress),
    };
  }
  return QUICK_EDIT_IDENTITY_CAMERA;
}
