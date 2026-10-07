import { interpolateQuickEditSpatial, quickEditSpatialSpan } from './spatial';
import { quickEditFocusType, resolveQuickEditFocusLink } from './focus-layout';
import { fitQuickEditZoomTransitions } from './zoom';
import { windowHeaderGeometry } from '../../../browser-frame/header';
import { fitVideoRect } from '../geometry';
import type {
  QuickEditBackgroundSettings,
  QuickEditCameraTransform,
  QuickEditZoomRegion,
  QuickEditWindowHeader,
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

type SceneInput = {
  output: { width: number; height: number };
  canvas?: { width: number; height: number } | undefined;
  source: { width: number; height: number };
  background: QuickEditBackgroundSettings;
  windowHeader?: QuickEditWindowHeader | undefined;
  camera: QuickEditCameraTransform;
};

/** Adds space above the source without changing the base canvas or fitting the video again. */
export function computeQuickEditSceneSize(input: Omit<SceneInput, 'output' | 'camera'>) {
  const base = input.canvas ?? input.source;
  const content = computeQuickEditContentRect(base, input.background);
  const fitted = fitVideoRect(content, input.source);
  const headerHeight = input.windowHeader
    ? Math.ceil(
        (windowHeaderGeometry(input.windowHeader, input.source).height * fitted.width) /
          input.source.width /
          2
      ) * 2
    : 0;
  return { width: base.width, height: base.height + headerHeight, headerHeight };
}

/** Source coordinates belong to videoRect; decoration and corner clipping belong to windowRect. */
export function computeQuickEditSceneLayout(input: SceneInput) {
  const base = input.canvas ?? input.source;
  const scale = input.output.width / Math.max(1, base.width);
  const scene = computeQuickEditSceneSize(input);
  const headerHeight = scene.headerHeight * scale;
  const background = input.background.enabled
    ? {
        ...input.background,
        layout: {
          ...input.background.layout,
          padding: input.background.layout.padding * scale,
          cornerRadius: input.background.layout.cornerRadius * scale,
        },
      }
    : input.background;
  const content = computeQuickEditContentRect(
    { width: input.output.width, height: input.output.height - headerHeight },
    background
  );
  const fitted = fitVideoRect(content, input.source);
  const videoRect = {
    x: content.x + fitted.x,
    y: content.y + fitted.y + headerHeight,
    width: fitted.width,
    height: fitted.height,
  };
  const windowRect = {
    ...videoRect,
    y: videoRect.y - headerHeight,
    height: videoRect.height + headerHeight,
  };
  return {
    ...(input.camera.spatial ? { spatial: input.camera.spatial } : {}),
    contentRect: {
      x: content.x,
      y: content.y,
      width: content.width,
      height: content.height + headerHeight,
    },
    windowRect,
    videoRect,
    videoTransform: computeQuickEditVideoTransform({ videoRect, windowRect, camera: input.camera }),
  };
}

/** Recomputes decoration from the actual video transform, including live inspector gestures. */
export function computeQuickEditWindowTransform(layout: {
  videoRect: QuickEditRect;
  videoTransform: QuickEditRect;
  windowRect?: QuickEditRect;
}): QuickEditRect {
  const window = layout.windowRect ?? layout.videoRect;
  const scale = layout.videoTransform.width / layout.videoRect.width;
  return {
    x: layout.videoTransform.x + (window.x - layout.videoRect.x) * scale,
    y: layout.videoTransform.y + (window.y - layout.videoRect.y) * scale,
    width: window.width * scale,
    height: window.height * scale,
  };
}

/**
 * Camera focus is normalized over the decorated window; source pixels retain their own rect.
 */
export function computeQuickEditVideoTransform(args: {
  videoRect: QuickEditRect;
  windowRect?: QuickEditRect;
  camera: QuickEditCameraTransform;
}): QuickEditRect {
  const { camera, videoRect } = args;
  const window = args.windowRect ?? videoRect;
  const offset = cameraTranslation(camera);
  const width = videoRect.width * camera.scale;
  const height = videoRect.height * camera.scale;
  return {
    x: window.x - offset.x * window.width + (videoRect.x - window.x) * camera.scale,
    y: window.y - offset.y * window.height + (videoRect.y - window.y) * camera.scale,
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

/** Translation in units of the unscaled camera window; clamping prevents empty camera edges. */
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
  // Interpolate rendered translation first, then recover a window-space center.
  return {
    scale,
    centerX: (lerp(start.x, end.x, progress) + 0.5) / scale,
    centerY: (lerp(start.y, end.y, progress) + 0.5) / scale,
  };
}

/**
 * Camera at a timeline time over validated (ascending, non-overlapping) zoom regions.
 * Regions are half-open [start, end): adjacent regions hand over exactly at the boundary.
 * Type-filtered callers retain the complete topology for intervening-focus validation.
 */
export function sampleQuickEditFocusAtTime(
  regions: readonly QuickEditZoomRegion[],
  timelineTime: number,
  topology: readonly QuickEditZoomRegion[] = regions
): {
  from: QuickEditZoomRegion | null;
  to: QuickEditZoomRegion;
  progress: number;
  phase: 'enter' | 'exit' | 'link';
} | null {
  const active = regions
    .filter((region) => !region.dormant)
    .toSorted((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  for (let index = 0; index < active.length; index++) {
    const region = active[index]!;
    const next = resolveQuickEditFocusLink(topology, region.id)?.target;
    const linkedNext = !!next;
    const linkedPrevious = active.some(
      (item) => resolveQuickEditFocusLink(topology, item.id)?.target.id === region.id
    );
    if (linkedNext && next && timelineTime >= region.end && timelineTime < next.start) {
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
  const sample = sampleQuickEditFocusAtTime(
    regions.filter((region) => quickEditFocusType(region) === 'zoom'),
    timelineTime,
    regions
  );
  if (!sample || sample.to.spotlight) return QUICK_EDIT_IDENTITY_CAMERA;
  const camera = interpolateCamera(
    sample.from?.transform ?? QUICK_EDIT_IDENTITY_CAMERA,
    sample.to.transform,
    sample.progress
  );
  if (
    quickEditSpatialSpan(regions, timelineTime) ||
    sample.from?.depthOfField?.enabled ||
    sample.to.depthOfField?.enabled
  )
    return {
      ...camera,
      spatial: {
        ...interpolateQuickEditSpatial(sample.from, sample.to, sample.progress),
        lockBackground: quickEditSpatialSpan(regions, timelineTime),
      },
    };
  return camera;
}

/** Shared camera bounds: following backgrounds and rounded video edges move together. */
export function computeQuickEditSceneCamera(
  layout: {
    videoRect: QuickEditRect;
    videoTransform: QuickEditRect;
    windowRect?: QuickEditRect;
    spatial?: QuickEditCameraTransform['spatial'];
  },
  background: QuickEditBackgroundSettings
) {
  const follows =
    !layout.spatial?.lockBackground &&
    background.enabled &&
    background.zoomBehavior === 'follow-video';
  const scale = follows ? layout.videoTransform.width / layout.videoRect.width : 1;
  const base = layout.windowRect ?? layout.videoRect;
  const windowClip = layout.spatial
    ? computeQuickEditSpatialWindow(layout, background)
    : follows
      ? computeQuickEditWindowTransform(layout)
      : base;
  return {
    scale,
    x: follows ? layout.videoTransform.x - scale * layout.videoRect.x : 0,
    y: follows ? layout.videoTransform.y - scale * layout.videoRect.y : 0,
    videoClip: follows ? layout.videoTransform : layout.videoRect,
    windowClip,
  };
}

/** Visible video crop in normalized source coordinates, shared by Area paint and hit-testing. */
export function computeQuickEditVisibleSourceRect(
  layout: {
    videoRect: QuickEditRect;
    videoTransform: QuickEditRect;
    windowRect?: QuickEditRect;
    spatial?: QuickEditCameraTransform['spatial'];
  },
  background: QuickEditBackgroundSettings,
  output: { width: number; height: number }
): QuickEditRect {
  const clip = computeQuickEditSceneCamera(layout, background).windowClip;
  const left = Math.max(0, clip.x);
  const top = Math.max(0, clip.y);
  return {
    x: (left - layout.videoTransform.x) / layout.videoTransform.width,
    y: (top - layout.videoTransform.y) / layout.videoTransform.height,
    width: (Math.min(output.width, clip.x + clip.width) - left) / layout.videoTransform.width,
    height: (Math.min(output.height, clip.y + clip.height) - top) / layout.videoTransform.height,
  };
}

/** Window geometry blends to the ordinary crop at link endpoints, independently of the background. */
export function computeQuickEditSpatialWindow(
  layout: {
    videoRect: QuickEditRect;
    videoTransform: QuickEditRect;
    windowRect?: QuickEditRect;
    spatial?: QuickEditCameraTransform['spatial'];
  },
  background: QuickEditBackgroundSettings
): QuickEditRect {
  const base = layout.windowRect ?? layout.videoRect;
  const target = computeQuickEditWindowTransform(layout);
  const follows =
    !layout.spatial?.lockBackground &&
    background.enabled &&
    background.zoomBehavior === 'follow-video';
  const weight = follows ? 1 : (layout.spatial?.windowMotion ?? 0);
  return {
    x: lerp(base.x, target.x, weight),
    y: lerp(base.y, target.y, weight),
    width: lerp(base.width, target.width, weight),
    height: lerp(base.height, target.height, weight),
  };
}

/** Raster-local framing removes only the outer projected window transform, preserving inner zoom. */
export function computeQuickEditSpatialRasterLayout(
  layout: ReturnType<typeof computeQuickEditSceneLayout>,
  background: QuickEditBackgroundSettings
) {
  const target = computeQuickEditSpatialWindow(layout, background);
  const base = layout.windowRect;
  const scale = target.width / base.width;
  const video = layout.videoTransform;
  const { spatial: _spatial, ...flat } = layout;
  return {
    ...flat,
    videoTransform: {
      x: base.x + (video.x - target.x) / scale,
      y: base.y + (video.y - target.y) / scale,
      width: video.width / scale,
      height: video.height / scale,
    },
  };
}
