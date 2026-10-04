import { fitQuickEditZoomTransitions } from './zoom';
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
  canvas?: { width: number; height: number } | undefined;
  source: { width: number; height: number };
  background: QuickEditBackgroundSettings;
  camera: QuickEditCameraTransform;
}): {
  contentRect: QuickEditRect;
  videoRect: QuickEditRect;
  videoTransform: QuickEditRect;
} {
  const scale = input.output.width / Math.max(1, input.canvas?.width ?? input.source.width);
  const background = input.background.enabled
    ? {
        ...input.background,
        layout: {
          padding: input.background.layout.padding * scale,
          cornerRadius: input.background.layout.cornerRadius * scale,
        },
      }
    : input.background;
  const contentRect = computeQuickEditContentRect(input.output, background);
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
 * Centered source viewport, clamped to the video edges like the full editor camera.
 */
export function computeQuickEditVideoTransform(args: {
  videoRect: QuickEditRect;
  camera: QuickEditCameraTransform;
}): QuickEditRect {
  const { camera, videoRect } = args;
  const offset = cameraTranslation(camera);
  const width = videoRect.width * camera.scale;
  const height = videoRect.height * camera.scale;
  return {
    x: videoRect.x - offset.x * videoRect.width,
    y: videoRect.y - offset.y * videoRect.height,
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

const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;

/** Translation in units of the unscaled video; clamping prevents empty camera edges. */
function cameraTranslation(camera: QuickEditCameraTransform) {
  const offset = (center: number) =>
    Math.max(0, Math.min(camera.scale - 1, center * camera.scale - 0.5));
  return { x: offset(camera.centerX), y: offset(camera.centerY) };
}

function interpolateCamera(
  from: QuickEditCameraTransform,
  to: QuickEditCameraTransform,
  progress: number
): QuickEditCameraTransform {
  if (progress <= 0) return from;
  if (progress >= 1) return to;
  const scale = lerp(from.scale, to.scale, progress);
  const start = cameraTranslation(from);
  const end = cameraTranslation(to);
  // Interpolate rendered translation first, then recover a source-space center.
  return {
    scale,
    centerX: (lerp(start.x, end.x, progress) + 0.5) / scale,
    centerY: (lerp(start.y, end.y, progress) + 0.5) / scale,
  };
}

/**
 * Camera at a timeline time over validated (ascending, non-overlapping) zoom regions.
 * Regions are half-open [start, end): adjacent regions hand over exactly at the boundary.
 */
export function sampleQuickEditFocusAtTime(
  regions: readonly QuickEditZoomRegion[],
  timelineTime: number
): {
  from: QuickEditZoomRegion | null;
  to: QuickEditZoomRegion;
  progress: number;
  phase: 'enter' | 'exit' | 'link';
} | null {
  const active = regions.filter((region) => !region.dormant);
  for (let index = 0; index < active.length; index++) {
    const region = active[index]!;
    const next = active[index + 1];
    const previous = active[index - 1];
    const linkedNext =
      next &&
      region.linkTo === next.id &&
      next.start > region.end &&
      !!region.spotlight === !!next.spotlight;
    const linkedPrevious =
      previous?.linkTo === region.id &&
      region.start > previous.end &&
      !!region.spotlight === !!previous.spotlight;
    if (linkedNext && timelineTime >= region.end && timelineTime < next.start) {
      const progress = easing(
        (timelineTime - region.end) / (next.start - region.end),
        region.linkEasing ?? 'ease-in-out'
      );
      return { from: region, to: next, progress, phase: 'link' };
    }
    if (timelineTime < region.start || timelineTime >= region.end) continue;
    const scaled = fitQuickEditZoomTransitions(region, region.end - region.start);
    const entering = linkedPrevious ? 1 : cameraProgress(scaled, timelineTime, 'enter');
    const exiting = linkedNext ? 1 : cameraProgress(scaled, timelineTime, 'exit');
    return {
      from: null,
      to: region,
      progress: Math.min(entering, exiting),
      phase: exiting < entering ? 'exit' : 'enter',
    };
  }
  return null;
}

/** Camera zoom and spotlight share one phase clock; spotlight never moves the camera. */
export function evaluateQuickEditCameraAtTime(
  regions: readonly QuickEditZoomRegion[],
  timelineTime: number
): QuickEditCameraTransform {
  const sample = sampleQuickEditFocusAtTime(regions, timelineTime);
  if (!sample || sample.to.spotlight) return QUICK_EDIT_IDENTITY_CAMERA;
  return interpolateCamera(
    sample.from?.transform ?? QUICK_EDIT_IDENTITY_CAMERA,
    sample.to.transform,
    sample.progress
  );
}

/** Shared camera bounds: following backgrounds and rounded video edges move together. */
export function computeQuickEditSceneCamera(
  layout: { videoRect: QuickEditRect; videoTransform: QuickEditRect },
  background: QuickEditBackgroundSettings
) {
  const follows = background.enabled && background.zoomBehavior === 'follow-video';
  const scale = follows ? layout.videoTransform.width / layout.videoRect.width : 1;
  return {
    scale,
    x: follows ? layout.videoTransform.x - scale * layout.videoRect.x : 0,
    y: follows ? layout.videoTransform.y - scale * layout.videoRect.y : 0,
    videoClip: follows ? layout.videoTransform : layout.videoRect,
  };
}

/** Visible video crop in normalized source coordinates, shared by Area paint and hit-testing. */
export function computeQuickEditVisibleSourceRect(
  layout: { videoRect: QuickEditRect; videoTransform: QuickEditRect },
  background: QuickEditBackgroundSettings,
  output: { width: number; height: number }
): QuickEditRect {
  const clip = computeQuickEditSceneCamera(layout, background).videoClip;
  const left = Math.max(0, clip.x);
  const top = Math.max(0, clip.y);
  return {
    x: (left - layout.videoTransform.x) / layout.videoTransform.width,
    y: (top - layout.videoTransform.y) / layout.videoTransform.height,
    width: (Math.min(output.width, clip.x + clip.width) - left) / layout.videoTransform.width,
    height: (Math.min(output.height, clip.y + clip.height) - top) / layout.videoTransform.height,
  };
}
