import { resolveCameraWindowWeight } from '../../project/motion/spatial';
import {
  invertQuickEditProjection,
  multiplyQuickEditProjections,
  projectQuickEditPoint,
} from './spatial-geometry';
import type { VideoCompositionCameraState } from '../types';
import type { QuickEditHomography } from './spatial-geometry';
import { motionFocusAreaPoint, isMotionFocusArea } from '../../project/motion/focus-area';
import type {
  VideoProject,
  VideoProjectMotionRegion,
  VideoProjectMotionArea,
} from '../../project/types';
import {
  getFittedMediaContentFrame,
  getFittedMediaOriginalWindowFrame,
  getFittedMediaWindowFrame,
  mapWindowNormalizedPointToVisualLayer,
  mapVisualLayerPointToWindowNormalized,
} from '../draw/fitted-media';
import { resolveCursorSourcePointMapping } from '../timeline/frame/cursor';
import { evaluateMotionSpatial } from './spatial';

/** The original decorated plane retains authoring coordinates when the visible crop changes. */
export function resolveMotionSourceWindow(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  time: number
) {
  if (region.sourceBinding?.coordinateSpace !== 'source-window') return null;
  const clip = project.clips.find((item) => item.id === region.sourceBinding?.clipId);
  if (!clip || time < clip.startTime || time >= clip.startTime + clip.duration) return null;
  const mapping = resolveCursorSourcePointMapping(project, region.sourceBinding.clipId, time);
  if (!mapping) return null;
  const window = getFittedMediaWindowFrame(mapping);
  const content = getFittedMediaContentFrame(mapping);
  const original = getFittedMediaOriginalWindowFrame(mapping);
  const state = mapping.renderState;
  let planeTransform: QuickEditHomography | undefined;
  if (
    mapping.frame.rotation !== 0 ||
    state.translateX !== 0 ||
    state.translateY !== 0 ||
    state.scaleX !== 1 ||
    state.scaleY !== 1
  ) {
    const point = (x: number, y: number) =>
      mapWindowNormalizedPointToVisualLayer({
        ...mapping,
        coordinateSpace: 'source-window',
        point: { x, y },
      });
    const origin = point(0, 0),
      right = point(1, 0),
      bottom = point(0, 1);
    if (origin && right && bottom) {
      const a = (right.x - origin.x) / original.width,
        b = (bottom.x - origin.x) / original.height;
      const d = (right.y - origin.y) / original.width,
        e = (bottom.y - origin.y) / original.height;
      planeTransform = [
        a,
        b,
        origin.x - a * original.x - b * original.y,
        d,
        e,
        origin.y - d * original.x - e * original.y,
        0,
        0,
        1,
      ];
    }
  }
  return {
    window,
    original,
    video: content,
    clipId: region.sourceBinding.clipId,
    mapping,
    planeTransform,
  };
}

/** Maps authoring controls onto the uncropped plane before the Native clip transform. */
export function motionWindowFocusToWindow(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  point: { x: number; y: number },
  time: number,
  inverse = false
) {
  const geometry = resolveMotionSourceWindow(project, region, time);
  if (!geometry) return point;
  const { original } = geometry;
  return inverse
    ? {
        x: ((point.x - original.x) / original.width) * project.width,
        y: ((point.y - original.y) / original.height) * project.height,
      }
    : {
        x: original.x + (point.x / project.width) * original.width,
        y: original.y + (point.y / project.height) * original.height,
      };
}

/** Maps authoring controls through the same clip affine transform as source actions and pixels. */
export function motionWindowFocusToComposition(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  point: { x: number; y: number },
  time: number,
  inverse = false
) {
  const geometry = resolveMotionSourceWindow(project, region, time);
  if (!geometry) return point;
  const mapping = { ...geometry.mapping, coordinateSpace: 'source-window' as const };
  if (inverse) {
    const normalized = mapVisualLayerPointToWindowNormalized({ ...mapping, point });
    return normalized
      ? { x: normalized.x * project.width, y: normalized.y * project.height }
      : point;
  }
  return (
    mapWindowNormalizedPointToVisualLayer({
      ...mapping,
      point: { x: point.x / project.width, y: point.y / project.height },
    }) ?? point
  );
}

/** Projects the target window while the existing layer partition keeps other windows stationary. */
export function resolveSourceWindowCamera(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  time: number,
  focus: { x: number; y: number },
  targetScale: number,
  progress: number,
  pan?: { x: number; y: number }
) {
  const geometry = resolveMotionSourceWindow(project, region, time);
  if (!geometry) return null;
  const { window } = geometry;
  const point = pan
    ? {
        x: window.x + ((pan.x + 0.5) / targetScale) * window.width,
        y: window.y + ((pan.y + 0.5) / targetScale) * window.height,
      }
    : motionWindowFocusToWindow(project, region, focus, time);
  const center = {
    x: (point.x - window.x) / window.width,
    y: (point.y - window.y) / window.height,
  };
  const scale = 1 + (targetScale - 1) * progress;
  const translation = (origin: number, size: number, value: number, admitted?: number) =>
    (((targetScale - 1) * origin +
      (admitted ?? Math.max(0, Math.min(targetScale - 1, targetScale * value - 0.5))) * size) *
      progress) /
    scale;
  const projectPoint = (point: { x: number; y: number }) =>
    mapWindowNormalizedPointToVisualLayer({
      ...geometry.mapping,
      coordinateSpace: 'source-window',
      point: {
        x: (point.x - geometry.original.x) / geometry.original.width,
        y: (point.y - geometry.original.y) / geometry.original.height,
      },
    }) ?? point;
  const origin = projectPoint({ x: 0, y: 0 });
  const viewport = projectPoint({
    x: translation(window.x, window.width, center.x, pan?.x),
    y: translation(window.y, window.height, center.y, pan?.y),
  });
  const spatial = evaluateMotionSpatial(
    project,
    null,
    {
      ...region,
      spatialReference: {
        x: window.x / project.width,
        y: window.y / project.height,
        width: window.width / project.width,
        height: window.height / project.height,
      },
    },
    progress
  );
  return {
    sourceClipId: geometry.clipId,
    scale,
    focusPoint: projectPoint(point),
    // Conjugate the local zoom by the clip affine transform: A*v + (1 - 1/s)*t.
    viewportX: viewport.x - origin.x / scale,
    viewportY: viewport.y - origin.y / scale,
    viewportWidth: project.width / scale,
    viewportHeight: project.height / scale,
    ...(spatial
      ? {
          spatial: {
            ...spatial,
            ...(geometry.planeTransform ? { planeTransform: geometry.planeTransform } : {}),
          },
        }
      : {}),
  };
}

/** Rebase all edges through the existing clip affine mapping without losing their orientation. */
export function motionWindowAreaToComposition(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  area: VideoProjectMotionArea,
  time: number,
  inverse = false
): VideoProjectMotionArea | null {
  const map = (x: number, y: number) =>
    motionWindowFocusToComposition(
      project,
      region,
      motionFocusAreaPoint(area, x, y),
      time,
      inverse
    );
  const start = map(0, 0),
    right = map(1, 0),
    bottom = map(0, 1);
  const width = Math.hypot(right.x - start.x, right.y - start.y);
  const height = Math.hypot(bottom.x - start.x, bottom.y - start.y);
  if (!(width > 0) || !(height > 0)) return null;
  const axes = {
    x: { x: (right.x - start.x) / width, y: (right.y - start.y) / width },
    y: { x: (bottom.x - start.x) / height, y: (bottom.y - start.y) / height },
  };
  const result = { ...start, width, height, axes };
  return isMotionFocusArea(result) ? result : null;
}

/** Project each authored rectangle corner without replacing its orientation by a bounding box. */
export function motionWindowAreaPoints(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  area: VideoProjectMotionArea,
  time: number
) {
  const point = (x: number, y: number) =>
    motionWindowFocusToComposition(project, region, motionFocusAreaPoint(area, x, y), time);
  return { nw: point(0, 0), ne: point(1, 0), se: point(1, 1), sw: point(0, 1) };
}

/** Split one source exposure into the authored window and its inner source raster. */
export function applySourceWindowCameraMode(
  project: VideoProject,
  camera: VideoCompositionCameraState,
  time: number
): VideoCompositionCameraState {
  if (!camera.sourceClipId) return camera;
  const background = project.sceneBackground;
  const mode = background?.zoomBehavior ?? 'window';
  if (mode === 'window') return camera;
  const follows =
    mode === 'follow-video' && background?.enabled !== false && !camera.spatial?.lockBackground;
  const policy = resolveCameraWindowWeight(mode, follows, camera.spatial?.lockBackground ?? false);
  const weight =
    policy === 'window' ? 1 : policy === 'content' ? 0 : (camera.spatial?.windowMotion ?? 0);
  const following = follows
    ? {
        backgroundCamera: {
          scale: camera.scale,
          viewportX: camera.viewportX,
          viewportY: camera.viewportY,
        },
      }
    : {};
  if (weight === 1) return { ...camera, ...following };
  const region = project.motionRegions?.find((region) => region.id === camera.regionId);
  if (!region?.sourceBinding) return camera;
  const geometry = resolveMotionSourceWindow(
    project,
    {
      ...region,
      sourceBinding: { ...region.sourceBinding, clipId: camera.sourceClipId },
    },
    time
  );
  if (!geometry) return camera;
  const outerScale = 1 + (camera.scale - 1) * weight;
  const ratio = camera.scale / outerScale;
  const inner: QuickEditHomography = [
    ratio,
    0,
    (-camera.viewportX * camera.scale * (1 - weight)) / outerScale,
    0,
    ratio,
    (-camera.viewportY * camera.scale * (1 - weight)) / outerScale,
    0,
    0,
    1,
  ];
  const plane = geometry.planeTransform;
  const inverse = plane ? invertQuickEditProjection(plane) : null;
  if (plane && !inverse) return camera;
  const sourceContentTransform =
    plane && inverse
      ? multiplyQuickEditProjections(inverse, multiplyQuickEditProjections(inner, plane))
      : inner;
  return {
    ...camera,
    ...following,
    scale: outerScale,
    viewportX: (camera.viewportX * camera.scale * weight) / outerScale,
    viewportY: (camera.viewportY * camera.scale * weight) / outerScale,
    viewportWidth: project.width / outerScale,
    viewportHeight: project.height / outerScale,
    sourceContentTransform,
  };
}

/** Source overlays share the same inner plane as the pixels they identify. */
export function mapCompositionPointThroughSourceContent(
  project: VideoProject,
  camera: VideoCompositionCameraState,
  time: number,
  point: { x: number; y: number },
  inverse = false
) {
  let transform = camera.sourceContentTransform;
  if (!transform || !camera.sourceClipId) return point;
  const region = project.motionRegions?.find((region) => region.id === camera.regionId);
  if (!region?.sourceBinding) return point;
  const geometry = resolveMotionSourceWindow(
    project,
    {
      ...region,
      sourceBinding: { ...region.sourceBinding, clipId: camera.sourceClipId },
    },
    time
  );
  const plane = geometry?.planeTransform;
  const planeInverse = plane ? invertQuickEditProjection(plane) : null;
  if (plane && planeInverse)
    transform = multiplyQuickEditProjections(
      plane,
      multiplyQuickEditProjections(transform, planeInverse)
    );
  const mapping = inverse ? invertQuickEditProjection(transform) : transform;
  return mapping ? (projectQuickEditPoint(mapping, point) ?? point) : point;
}

/** Inner source motion is uniform scale/translation; clip affine projection follows it. */
export function projectSourceContentRect(
  rect: { x: number; y: number; width: number; height: number },
  transform: QuickEditHomography,
  rasterScale = 1
) {
  if (!Number.isFinite(rasterScale) || rasterScale <= 0) return null;
  const start = projectQuickEditPoint(transform, {
    x: rect.x / rasterScale,
    y: rect.y / rasterScale,
  });
  const end = projectQuickEditPoint(transform, {
    x: (rect.x + rect.width) / rasterScale,
    y: (rect.y + rect.height) / rasterScale,
  });
  const scale = Math.hypot(transform[0], transform[3]);
  if (!start || !end || !Number.isFinite(scale) || scale <= 0) return null;
  return {
    scale,
    rect: {
      x: start.x * rasterScale,
      y: start.y * rasterScale,
      width: (end.x - start.x) * rasterScale,
      height: (end.y - start.y) * rasterScale,
    },
  };
}
