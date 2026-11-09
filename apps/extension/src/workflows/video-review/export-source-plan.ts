import { getCanvasPointsBounds } from '@sniptale/runtime-contracts/canvas-interactions';
import type {
  QuickEditAdvancedState,
  QuickEditCameraTransform,
} from '../../features/video/review/advanced/types';
import { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import {
  computeQuickEditSceneLayout,
  computeQuickEditSpatialRasterLayout,
  computeQuickEditSpatialWindow,
  computeQuickEditSceneCamera,
  computeQuickEditSourceWindowTransform,
  evaluateQuickEditCameraAtTime,
  quickEditVisibleVideoTransform,
} from '../../features/video/review/advanced/scene';
import { quickEditMotionBlurCameras } from '../../features/video/review/advanced/motion-blur';
import { evaluateQuickEditSpotlightsAtTime } from '../../features/video/review/advanced/focus';
import { evaluateReviewClicks } from '../../features/video/review/click-animation';
import {
  scaleQuickEditRectAboutCenter,
  invertQuickEditProjection,
  multiplyQuickEditProjections,
  projectQuickEditPoint,
  quickEditPlaneProjection,
  type QuickEditHomography,
} from '../../features/video/composition/motion/spatial-geometry';
import type {
  SourceSamplingDemand,
  SourceSamplingIdentity,
  SourceSamplingRect,
} from '../../features/video/composition/draw/media-source';
import { hasMagnificationDemand } from '../../features/video/composition/export-enhancement/prepared-source';
import {
  samplingRasterSize,
  projectedDensityBound,
} from '../../features/video/composition/export-enhancement/projection-density';
import type { ReviewClickCue } from '../../features/video/review/click-animation';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
export interface ReviewExportSourceScene {
  sourceSize: { width: number; height: number };
  baseCanvas?: { width: number; height: number };
  windowHeader?: QuickEditAdvancedState['windowHeader'];
  background: QuickEditAdvancedState['background'];
  zoomRegions: readonly QuickEditZoomRegion[];
  clickCues?: readonly ReviewClickCue[] | undefined;
  sceneScale?: number | undefined;
}

const IDENTITY: QuickEditHomography = [1, 0, 0, 0, 1, 0, 0, 0, 1];
type Size = { width: number; height: number };
type ReviewExportMagnification = 'none' | 'growth' | 'unknown';
interface ReviewExportSourceExposure {
  camera: QuickEditCameraTransform;
  alpha: number;
  layout: ReturnType<typeof computeQuickEditSceneLayout>;
  planeLayout: ReturnType<typeof computeQuickEditSceneLayout>;
  projection: QuickEditHomography;
  sourceProjection: QuickEditHomography;
  body: SourceSamplingDemand;
  planeDensity: number;
}
interface ReviewExportLensDemand {
  id: string;
  kind: 'scene' | 'click';
  index: number;
  bounds: SourceSamplingRect;
  transform: QuickEditHomography;
  demand: SourceSamplingDemand;
  demands: readonly SourceSamplingDemand[];
}
export interface ReviewExportSourcePlan {
  identity: SourceSamplingIdentity;
  camera: QuickEditCameraTransform;
  layout: ReturnType<typeof computeQuickEditSceneLayout>;
  exposures: readonly ReviewExportSourceExposure[];
  lenses: readonly ReviewExportLensDemand[];
  demands: readonly SourceSamplingDemand[];
  overlayDensity: number;
  spotlightFrames: ReturnType<typeof evaluateQuickEditSpotlightsAtTime>;
  clickFrames: ReturnType<typeof evaluateReviewClicks>;
}
function intersection(a: SourceSamplingRect, b: SourceSamplingRect): SourceSamplingRect | null {
  const x = Math.max(a.x, b.x),
    y = Math.max(a.y, b.y),
    right = Math.min(a.x + a.width, b.x + b.width),
    bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}
function bounds(rect: SourceSamplingRect, h: QuickEditHomography): SourceSamplingRect {
  const points = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x, y: rect.y + rect.height },
    { x: rect.x + rect.width, y: rect.y + rect.height },
  ].map((p) => {
    const value = projectQuickEditPoint(h, p);
    if (!value) throw new Error('Export source projection crosses the camera horizon.');
    return value;
  });
  return getCanvasPointsBounds(points);
}
function affine(rect: SourceSamplingRect, size: Size): QuickEditHomography {
  return [rect.width / size.width, 0, rect.x, 0, rect.height / size.height, rect.y, 0, 0, 1];
}

function demand(
  identity: SourceSamplingIdentity,
  id: string,
  roi: SourceSamplingRect,
  h: QuickEditHomography
): SourceSamplingDemand {
  const raster = samplingRasterSize({ roi, projection: h });
  return {
    ...identity,
    id,
    originalPixelROI: roi,
    sourceToOutputHomography: h,
    targetRasterSize: { width: raster.width, height: raster.height },
  };
}
/** Evaluate only canonical Gallery geometry; original source pixels remain the sampling domain. */
export function planReviewExportSource(args: {
  scene: Readonly<ReviewExportSourceScene>;
  output: Size;
  identity: SourceSamplingIdentity;
  resultTime: number;
  camera?: QuickEditCameraTransform;
}): ReviewExportSourcePlan {
  const { scene, output, identity, resultTime } = args;
  const geometry = {
    source: scene.sourceSize,
    canvas: scene.baseCanvas ?? output,
    background: scene.background,
    windowHeader: scene.windowHeader,
    output,
  };
  const camera =
    args.camera ?? evaluateQuickEditCameraAtTime(scene.zoomRegions, resultTime, geometry);
  const layoutFor = (value: QuickEditCameraTransform) =>
    computeQuickEditSceneLayout({ ...geometry, camera: value });
  const layout = layoutFor(camera);
  const passes = args.camera
    ? []
    : quickEditMotionBlurCameras(scene.zoomRegions, resultTime, geometry);
  const exposures = (passes.length ? passes : [{ camera, alpha: 1 }]).map((pass, index) => {
    const layout = layoutFor(pass.camera),
      planeLayout = layout.spatial
        ? computeQuickEditSpatialRasterLayout(layout, scene.background)
        : layout;
    const projection = layout.spatial
      ? quickEditPlaneProjection(
          layout.windowRect,
          computeQuickEditSpatialWindow(layout, scene.background),
          layout.spatial
        )
      : IDENTITY;
    const sourceProjection = affine(planeLayout.videoTransform, scene.sourceSize);
    const h = multiplyQuickEditProjections(projection, sourceProjection);
    const motion = computeQuickEditSceneCamera(
      planeLayout,
      layout.spatial ? { ...scene.background, zoomBehavior: 'fixed' } : scene.background
    );
    const visible =
      intersection(motion.windowClip, quickEditVisibleVideoTransform(planeLayout)) ??
      motion.windowClip;
    const inv = invertQuickEditProjection(sourceProjection);
    if (!inv) throw new Error('Export source projection is unavailable.');
    const roi = intersection(bounds(visible, inv), { x: 0, y: 0, ...scene.sourceSize }) ?? {
      x: 0,
      y: 0,
      ...scene.sourceSize,
    };
    return {
      camera: pass.camera,
      alpha: pass.alpha,
      layout,
      planeLayout,
      projection,
      sourceProjection,
      body: demand(identity, `body:${index}`, roi, h),
      planeDensity: Math.max(1, projectedDensityBound(projection, layout.windowRect)),
    };
  });
  const nominalPlane = layout.spatial
    ? computeQuickEditSpatialRasterLayout(layout, scene.background)
    : layout;
  const nominalProjection = layout.spatial
    ? quickEditPlaneProjection(
        layout.windowRect,
        computeQuickEditSpatialWindow(layout, scene.background),
        layout.spatial
      )
    : IDENTITY;
  const nominalSource = affine(nominalPlane.videoTransform, scene.sourceSize);
  const nominal = {
    sourceProjection: nominalSource,
    projection: nominalProjection,
    body: {
      sourceToOutputHomography: multiplyQuickEditProjections(nominalProjection, nominalSource),
    },
  };
  const lenses: ReviewExportLensDemand[] = [];
  const add = (
    kind: 'scene' | 'click',
    index: number,
    opening: SourceSamplingRect,
    transform: QuickEditHomography
  ) => {
    const id = `${kind}:${index}`;
    const demands = (kind === 'click' ? [nominal] : exposures).flatMap((e, exposureIndex) => {
      const plane = multiplyQuickEditProjections(transform, e.sourceProjection);
      const h =
        kind === 'scene'
          ? multiplyQuickEditProjections(transform, e.body.sourceToOutputHomography)
          : multiplyQuickEditProjections(e.projection, plane);
      const inv = invertQuickEditProjection(kind === 'click' ? plane : h);
      if (!inv) throw new Error('Export lens projection is unavailable.');
      const roi = intersection(bounds(opening, inv), { x: 0, y: 0, ...scene.sourceSize });
      return roi ? [demand(identity, exposureIndex ? `${id}:${exposureIndex}` : id, roi, h)] : [];
    });
    if (demands.length)
      lenses.push({ id, kind, index, bounds: opening, transform, demand: demands[0]!, demands });
  };
  const spatialWindow = computeQuickEditSpatialWindow(layout, scene.background);
  const spotlights = evaluateQuickEditSpotlightsAtTime({
    regions: scene.zoomRegions,
    time: resultTime,
    output,
    video: computeQuickEditSourceWindowTransform(layout),
    scale: (scene.sceneScale ?? 1) * camera.scale,
  });
  spotlights.forEach((frame, index) => {
    if (!frame.lens || frame.lens.scale <= 1) return;
    const opening = layout.spatial
      ? bounds(
          frame.opening,
          quickEditPlaneProjection(spatialWindow, spatialWindow, layout.spatial)
        )
      : frame.opening;
    const transform = scaleQuickEditRectAboutCenter(opening, frame.lens.scale);
    add('scene', index, opening, transform);
  });
  const video = nominalPlane.videoTransform;
  const clickFrames = evaluateReviewClicks(scene.clickCues ?? [], resultTime);
  clickFrames.forEach((frame, index) => {
    if (!frame.lens || frame.lens.scale <= 1) return;
    const radius = (frame.radius * video.width) / scene.sourceSize.width;
    const opening = {
      x: video.x + frame.point.x * video.width - radius,
      y: video.y + frame.point.y * video.height - radius,
      width: radius * 2,
      height: radius * 2,
    };
    const transform = scaleQuickEditRectAboutCenter(opening, frame.lens.scale);
    add('click', index, opening, transform);
  });
  return {
    identity,
    camera,
    layout,
    exposures,
    lenses,
    demands: [...exposures.map((e) => e.body), ...lenses.flatMap((e) => e.demands)],
    spotlightFrames: spotlights,
    clickFrames,
    overlayDensity: Math.max(1, projectedDensityBound(nominalProjection, layout.windowRect)),
  };
}
/** Copy is permitted only after a complete static-window proof. Dynamic or historical geometry is unknown. */
export function classifyReviewExportMagnification(args: {
  advanced: QuickEditAdvancedState;
  sourceSize: Size;
  output: Size;
  recordingHistory?: boolean;
}): ReviewExportMagnification {
  if (args.recordingHistory) return 'unknown';
  const effective = resolveQuickEditEffectiveState(args.advanced);
  if (
    effective.zoomRegions.length ||
    args.advanced.clickAnimations?.some((c) => c.effect !== 'off') ||
    effective.annotationEffects
  )
    return 'unknown';
  try {
    const identity = {
      sourceKey: args.advanced,
      sourceTime: 0,
      passTime: 0,
      sourceSize: args.sourceSize,
    };
    const plan = planReviewExportSource({
      identity,
      resultTime: 0,
      output: args.output,
      scene: {
        sourceSize: args.sourceSize,
        ...(effective.canvas ? { baseCanvas: effective.canvas } : {}),
        background: effective.background,
        windowHeader: effective.windowHeader,
        zoomRegions: [],
      },
    });
    return hasMagnificationDemand(plan.demands) ? 'growth' : 'none';
  } catch {
    return 'unknown';
  }
}
