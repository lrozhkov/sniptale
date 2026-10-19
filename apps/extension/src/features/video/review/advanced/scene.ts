import { cameraTransitionProgress } from '../../project/motion/transitions';
import { insetMediaCanvas } from '../../project/window-geometry';
import { uncropMediaSourceRect } from '../../project/media-crop';
import {
  evaluateReviewFollowCursor,
  resolveReviewCursorCameraPlan,
  reviewCameraPlanObservations,
  hasContinuousReviewCameraSource,
} from './cursor-focus-path';
import {
  createReviewWorkingZoneCameraGeometry,
  proveReviewCameraGap,
  reviewCameraNominalDescriptor,
  reviewCameraGapSignature,
} from './camera-geometry';
import { evaluateWorkingZoneCameraBoundary } from '../../composition/motion/follow-cursor';
import type {
  CameraBoundaryState,
  WorkingZoneCameraBoundaries,
} from '../../composition/motion/follow-cursor';
import type { WorkingZoneCameraGeometry } from '../../composition/motion/follow-cursor';
import type { WorkingZoneCameraPlan } from '../../composition/motion/follow-cursor';
import { resolveCameraFollowPolicy } from '../../project/camera/cursor-policy';
import {
  interpolateQuickEditSpatial,
  quickEditSpatialSpan,
  hasQuickEditPerspective,
} from './spatial';
import { quickEditFocusType, resolveQuickEditFocusLink } from './focus-layout';
import { fitQuickEditZoomTransitions } from './zoom';
import { windowHeaderGeometry } from '@sniptale/runtime-contracts/window-header';
import { fitVideoRect } from '../geometry';
import { fitQuickEditSourceCrop } from './canvas';
import type {
  QuickEditBackgroundSettings,
  QuickEditCameraTransform,
  QuickEditZoomRegion,
  QuickEditRect,
  QuickEditCameraSceneInput,
} from './types';

export type { QuickEditRect, QuickEditCameraSceneInput } from './types';

type QuickEditPoint = { x: number; y: number };

/** Camera default showing the full video with no magnification. */
const QUICK_EDIT_IDENTITY_CAMERA: QuickEditCameraTransform = {
  scale: 1,
  centerX: 0.5,
  centerY: 0.5,
};

/** Content area inside the output frame; padding never collapses the canvas below one pixel. */
export function computeQuickEditContentRect(
  output: { width: number; height: number },
  background: QuickEditBackgroundSettings
): QuickEditRect {
  const padding = background.enabled ? background.layout.padding : 0;
  return insetMediaCanvas(output, padding);
}

type SceneInput = Omit<QuickEditCameraSceneInput, 'output'> & {
  output: { width: number; height: number };
  camera: QuickEditCameraTransform;
};

export interface QuickEditCameraConflict {
  regionId: string;
  interval: { start: number; end: number };
  time: number;
  reason: Extract<WorkingZoneCameraPlan, { status: 'conflict' }>['reason'];
}

export type QuickEditCameraLinkPlan = {
  from: QuickEditCameraTransform;
  to: QuickEditCameraTransform;
  discontinuities: readonly { time: number; reason: 'nominal' }[];
} & ({ status: 'ready' } | ({ status: 'conflict' } & QuickEditCameraConflict));

function cameraPerspectiveValues(region: QuickEditZoomRegion) {
  return hasQuickEditPerspective(region.perspective)
    ? [
        region.perspective!.rotateX,
        region.perspective!.rotateY,
        ((region.perspective!.rotateZ + 540) % 360) - 180,
        region.perspective!.strength,
      ]
    : [0, 0, 0, 0];
}

function compatibleReviewCameraPhases(left: QuickEditZoomRegion, right: QuickEditZoomRegion) {
  const exit = fitQuickEditZoomTransitions(left, left.end - left.start).exit;
  const enter = fitQuickEditZoomTransitions(right, right.end - right.start).enter;
  const held =
    (exit.type === 'none' || exit.duration === 0) &&
    (enter.type === 'none' || enter.duration === 0);
  const matchedEase =
    exit.type === 'ease-in-out' &&
    enter.type === 'ease-in-out' &&
    exit.duration > 0 &&
    exit.duration === enter.duration;
  if ((!held && !matchedEase) || left.transform.scale !== right.transform.scale) return false;
  if (
    JSON.stringify(cameraPerspectiveValues(left)) !== JSON.stringify(cameraPerspectiveValues(right))
  )
    return false;
  return true;
}

/** Map an authored window target into the cropped window without changing persisted coordinates. */
export function quickEditCropCamera(
  camera: QuickEditCameraTransform,
  scene: QuickEditCameraSceneInput | undefined,
  inverse = false
): QuickEditCameraTransform {
  if (!scene?.canvas?.crop) return camera;
  const layout = computeQuickEditSceneLayout({
    ...scene,
    output: scene.output ?? computeQuickEditSceneSize(scene),
    camera: QUICK_EDIT_IDENTITY_CAMERA,
  });
  const header = scene.windowHeader
    ? windowHeaderGeometry(scene.windowHeader, scene.source).height
    : 0;
  const sourceHeader = (header * layout.videoRect.width) / scene.source.width;
  const original = {
    ...layout.videoRect,
    y: layout.videoRect.y - sourceHeader,
    height: layout.videoRect.height + sourceHeader,
  };
  const from = inverse ? layout.windowRect : original;
  const to = inverse ? original : layout.windowRect;
  return {
    ...camera,
    centerX: (from.x + camera.centerX * from.width - to.x) / to.width,
    centerY: (from.y + camera.centerY * from.height - to.y) / to.height,
  };
}

function croppedCameraRegion(region: QuickEditZoomRegion, scene?: QuickEditCameraSceneInput) {
  const transform = quickEditCropCamera(region.transform, scene ?? region.cursorFocus?.scene);
  return transform === region.transform ? region : { ...region, transform };
}

/** Coordinate compatible adjacent cameras from provisional endpoints, without recursive neighbor evaluation. */
export function resolveReviewSceneCameraPlan(
  regions: readonly QuickEditZoomRegion[],
  region: QuickEditZoomRegion,
  scene?: QuickEditCameraSceneInput
): WorkingZoneCameraPlan | null {
  const geometry = resolveReviewCameraGeometry(regions, region, scene);
  if (!geometry || region.cursorFocus?.path.mode !== 'follow') return null;
  const boundaries: WorkingZoneCameraBoundaries = {};
  const active = regions.filter((item) => !item.dormant && quickEditFocusType(item) === 'zoom');
  const share = (
    left: QuickEditZoomRegion,
    right: QuickEditZoomRegion
  ): CameraBoundaryState | Extract<WorkingZoneCameraPlan, { status: 'conflict' }> | undefined => {
    const context = left.cursorFocus ?? right.cursorFocus;
    if (
      !compatibleReviewCameraPhases(left, right) ||
      !(context && hasContinuousReviewCameraSource(context, left.end))
    )
      return undefined;
    const time = left.end;
    // The manual neighbor owns the endpoint; otherwise the left provisional plan owns it.
    const owner =
      left.cursorFocus?.path.mode !== 'follow'
        ? left
        : right.cursorFocus?.path.mode !== 'follow'
          ? right
          : left;
    if (owner.cursorFocus?.path.mode === 'follow') {
      const ownerGeometry = resolveReviewCameraGeometry(regions, owner, scene);
      if (!ownerGeometry) return undefined;
      const plan = resolveReviewCursorCameraPlan(croppedCameraRegion(owner, scene), ownerGeometry);
      if (plan.status === 'conflict')
        return { ...plan, interval: { start: region.start, end: region.end }, time };
      return plan.targetScale === region.transform.scale
        ? evaluateWorkingZoneCameraBoundary(plan, time)
        : undefined;
    }
    const translation = cameraTranslation(croppedCameraRegion(owner, scene).transform);
    return {
      pan: { x: translation.x * geometry.window.width, y: translation.y * geometry.window.height },
      velocity: { x: 0, y: 0 },
      acceleration: { x: 0, y: 0 },
    };
  };
  const previous = active.find((item) => item.id !== region.id && item.end === region.start);
  const next = active.find((item) => item.id !== region.id && item.start === region.end);
  const incoming = previous && share(previous, region),
    outgoing = next && share(region, next);
  if (incoming && 'status' in incoming) return incoming;
  if (outgoing && 'status' in outgoing) return outgoing;
  if (incoming) boundaries.incoming = incoming;
  if (outgoing) boundaries.outgoing = outgoing;
  return resolveReviewCursorCameraPlan(croppedCameraRegion(region, scene), geometry, boundaries);
}

function evaluateReviewSceneFollow(
  regions: readonly QuickEditZoomRegion[],
  region: QuickEditZoomRegion,
  time: number,
  camera: QuickEditCameraTransform,
  scene?: QuickEditCameraSceneInput
) {
  return evaluateReviewFollowCursor(
    region,
    time,
    quickEditCropCamera(camera, scene ?? region.cursorFocus?.scene),
    resolveReviewCameraGeometry(regions, region, scene),
    resolveReviewSceneCameraPlan(regions, region, scene) ?? undefined
  );
}

/** Link drawing and export admission use the same frozen targets and explicit authored boundary contract. */
export function resolveReviewCameraLinkPlan(
  regions: readonly QuickEditZoomRegion[],
  source: QuickEditZoomRegion,
  target: QuickEditZoomRegion,
  scene?: QuickEditCameraSceneInput
): QuickEditCameraLinkPlan {
  const from = evaluateReviewSceneFollow(regions, source, source.end, source.transform, scene);
  const to = evaluateReviewSceneFollow(regions, target, target.start, target.transform, scene);
  const a = cameraTranslation(from),
    b = cameraTranslation(to);
  const changed =
    from.scale !== to.scale ||
    a.x !== b.x ||
    a.y !== b.y ||
    JSON.stringify(cameraPerspectiveValues(source)) !==
      JSON.stringify(cameraPerspectiveValues(target));
  const discontinuities = changed
    ? [source.end, target.start].map((time) => ({ time, reason: 'nominal' as const }))
    : [];
  const conflict = reviewCameraLinkConflict(regions, source, target, scene);
  return conflict
    ? { status: 'conflict', ...conflict, from, to, discontinuities }
    : { status: 'ready', from, to, discontinuities };
}

/** Inspect the same disposable plans used for drawing, retaining full topology for fragment admission. */
export function resolveReviewCameraConflicts(
  regions: readonly QuickEditZoomRegion[],
  scene?: QuickEditCameraSceneInput,
  interval?: { start: number; end: number }
): QuickEditCameraConflict[] {
  const conflicts: QuickEditCameraConflict[] = [];
  for (const region of regions) {
    if (
      region.dormant ||
      region.spotlight ||
      quickEditFocusType(region) !== 'zoom' ||
      region.cursorFocus?.path.mode !== 'follow'
    )
      continue;
    if (interval && (region.end <= interval.start || region.start >= interval.end)) continue;
    const geometry = resolveReviewCameraGeometry(regions, region, scene);
    const plan = geometry ? resolveReviewSceneCameraPlan(regions, region, scene) : null;
    if (!plan || plan.status === 'conflict')
      conflicts.push({
        regionId: region.id,
        interval: { start: region.start, end: region.end },
        time: plan?.time ?? region.start,
        reason: plan?.reason ?? 'unproven',
      });
  }
  for (const region of regions) {
    const link = resolveQuickEditFocusLink(regions, region.id);
    if (!link || (!link.source.cursorFocus && !link.target.cursorFocus)) continue;
    const start = link.source.end,
      end = link.target.start;
    if (interval && (end <= interval.start || start >= interval.end)) continue;
    const plan = resolveReviewCameraLinkPlan(regions, link.source, link.target, scene);
    if (plan.status === 'conflict')
      conflicts.push({
        regionId: plan.regionId,
        interval: plan.interval,
        reason: plan.reason,
        time: plan.time,
      });
  }
  return conflicts;
}

const linkProofs = new WeakMap<
  NonNullable<QuickEditZoomRegion['cursorFocus']>,
  Map<string, QuickEditCameraConflict | null>
>();

function reviewCameraLinkEndpointFailure(
  regions: readonly QuickEditZoomRegion[],
  source: QuickEditZoomRegion,
  target: QuickEditZoomRegion,
  scene: QuickEditCameraSceneInput
): Pick<QuickEditCameraConflict, 'reason' | 'time'> | undefined {
  for (const region of [source, target]) {
    if (!region.cursorFocus) continue;
    const plan = resolveReviewSceneCameraPlan(regions, region, scene);
    if (!plan) return { reason: 'unproven', time: source.end };
    if (plan.status === 'conflict') return { reason: plan.reason, time: plan.time };
  }
  return undefined;
}

function reviewCameraLinkConflict(
  regions: readonly QuickEditZoomRegion[],
  source: QuickEditZoomRegion,
  target: QuickEditZoomRegion,
  scene?: QuickEditCameraSceneInput
): QuickEditCameraConflict | null {
  // The outgoing link inherits its source policy; a manual source uses the following destination policy.
  const context = source.cursorFocus ?? target.cursorFocus;
  const input = scene ?? context?.scene;
  const interval = { start: source.end, end: target.start };
  const conflict = (
    reason: QuickEditCameraConflict['reason'],
    time = source.end
  ): QuickEditCameraConflict => ({
    regionId: source.id,
    interval,
    reason,
    time,
  });
  if (!context || !input) return conflict('unproven');
  const endpointFailure = reviewCameraLinkEndpointFailure(regions, source, target, input);
  if (endpointFailure) return conflict(endpointFailure.reason, endpointFailure.time);
  const from = evaluateReviewSceneFollow(regions, source, source.end, source.transform, input);
  const to = evaluateReviewSceneFollow(regions, target, target.start, target.transform, input);
  const { output, layout, policy } = reviewCameraGeometryInputs(input, context);
  const key = reviewCameraGapSignature({ source, target, from, to, scene: input, policy });
  let cached = linkProofs.get(context);
  if (!cached) {
    cached = new Map();
    linkProofs.set(context, cached);
  }
  if (cached.has(key)) return cached.get(key) ?? null;
  const proof = proveReviewCameraGap({
    output,
    layout,
    scene: input,
    regions,
    source,
    target,
    from,
    to,
    policy,
    observations: reviewCameraPlanObservations({
      ...target,
      start: source.end,
      end: target.start,
      cursorFocus: context,
    }),
  });
  const result = proof.status === 'conflict' ? conflict(proof.reason, proof.time) : null;
  cached.set(key, result);
  if (cached.size > 4) cached.delete(cached.keys().next().value ?? '');
  return result;
}

const cameraGeometries = new WeakMap<
  NonNullable<QuickEditZoomRegion['cursorFocus']>,
  Map<string, WorkingZoneCameraGeometry>
>();

/** Resolve a disposable projection adapter; geometry or nominal-phase changes invalidate it before drawing. */
export function resolveReviewCameraGeometry(
  regions: readonly QuickEditZoomRegion[],
  region: QuickEditZoomRegion,
  scene?: QuickEditCameraSceneInput
) {
  const context = region.cursorFocus;
  const input = scene ?? context?.scene;
  if (!context || !input) return undefined;
  const { output, layout, policy } = reviewCameraGeometryInputs(input, context);
  const cornerRadius = input.background.enabled
    ? (input.background.layout.cornerRadius * output.width) /
      (input.canvas?.width ?? input.source.width)
    : 0;
  const key = JSON.stringify({
    output,
    window: layout.windowRect,
    video: layout.videoRect,
    cornerRadius,
    background: { enabled: input.background.enabled, zoomBehavior: input.background.zoomBehavior },
    region: reviewCameraNominalDescriptor(region),
    topology: regions.map(reviewCameraNominalDescriptor),
    policy,
  });
  let cached = cameraGeometries.get(context);
  if (!cached) {
    cached = new Map();
    cameraGeometries.set(context, cached);
  }
  const previous = cached.get(key);
  if (previous) return previous;
  const geometry = createReviewWorkingZoneCameraGeometry({
    output,
    window: layout.windowRect,
    video: layout.videoRect,
    cornerRadius,
    background: input.background,
    region,
    topology: regions,
    policy,
  });
  cached.set(key, geometry);
  if (cached.size > 4) cached.delete(cached.keys().next().value ?? '');
  return geometry;
}

/** Adds space above the source without changing the base canvas or fitting the video again. */
export function computeQuickEditSceneSize(input: Omit<SceneInput, 'output' | 'camera'>) {
  const base = input.canvas ?? input.source;
  const content = computeQuickEditContentRect(base, input.background);
  const { fitted } = fitSceneSource(input, content);
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
  const { crop, fitted } = fitSceneSource(input, content);
  const visibleVideoRect = {
    x: content.x + fitted.x,
    y: content.y + fitted.y + headerHeight,
    width: fitted.width,
    height: fitted.height,
  };
  const videoRect = crop ? uncropMediaSourceRect(visibleVideoRect, crop) : visibleVideoRect;
  const windowRect = {
    ...visibleVideoRect,
    y: visibleVideoRect.y - headerHeight,
    height: visibleVideoRect.height + headerHeight,
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
    ...(crop
      ? {
          sourceCrop: crop,
          visibleVideoRect,
          sourceHeaderRatio: input.windowHeader
            ? windowHeaderGeometry(input.windowHeader, input.source).height / input.source.width
            : 0,
        }
      : {}),
    videoTransform: computeQuickEditVideoTransform({ videoRect, windowRect, camera: input.camera }),
  };
}

/** Focus objects retain the original decorated-window coordinates after source cropping. */
export function computeQuickEditSourceWindowTransform(
  layout: Parameters<typeof computeQuickEditWindowTransform>[0] & { sourceHeaderRatio?: number }
): QuickEditRect {
  if (layout.sourceHeaderRatio === undefined) return computeQuickEditWindowTransform(layout);
  const header = layout.sourceHeaderRatio * layout.videoTransform.width;
  return {
    ...layout.videoTransform,
    y: layout.videoTransform.y - header,
    height: layout.videoTransform.height + header,
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

/** The selected source area remains a hard boundary after camera movement. */
export function quickEditVisibleVideoTransform(layout: {
  videoTransform: QuickEditRect;
  sourceCrop?: QuickEditRect;
}): QuickEditRect {
  const video = layout.videoTransform;
  const crop = layout.sourceCrop;
  return crop
    ? {
        x: video.x + crop.x * video.width,
        y: video.y + crop.y * video.height,
        width: video.width * crop.width,
        height: video.height * crop.height,
      }
    : video;
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
    return (
      1 - cameraTransitionProgress((timelineTime - boundary) / transition.duration, transition.type)
    );
  }
  if (timelineTime >= region.start + transition.duration) return 1;
  return cameraTransitionProgress(
    (timelineTime - region.start) / transition.duration,
    transition.type
  );
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
      const progress = cameraTransitionProgress(
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
  timelineTime: number,
  scene?: QuickEditCameraSceneInput
): QuickEditCameraTransform {
  const sample = sampleQuickEditFocusAtTime(
    regions.filter((region) => quickEditFocusType(region) === 'zoom'),
    timelineTime,
    regions
  );
  if (!sample || sample.to.spotlight) return QUICK_EDIT_IDENTITY_CAMERA;
  const linkPlan =
    sample.phase === 'link' && sample.from && (sample.from.cursorFocus || sample.to.cursorFocus)
      ? resolveReviewCameraLinkPlan(regions, sample.from, sample.to, scene)
      : null;
  const target =
    linkPlan?.to ??
    evaluateReviewSceneFollow(
      regions,
      sample.to,
      sample.phase === 'link' ? sample.to.start : timelineTime,
      sample.to.transform,
      scene
    );
  const from =
    linkPlan?.from ??
    (sample.from
      ? evaluateReviewSceneFollow(
          regions,
          sample.from,
          sample.phase === 'link' ? sample.from.end : timelineTime,
          sample.from.transform,
          scene
        )
      : QUICK_EDIT_IDENTITY_CAMERA);
  const camera = interpolateCamera(from, target, sample.progress);
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
  const legacyFollows =
    !layout.spatial?.lockBackground &&
    background.enabled &&
    background.zoomBehavior === 'follow-video';
  const follows = legacyFollows || background.zoomBehavior === 'window';
  const scale = follows ? layout.videoTransform.width / layout.videoRect.width : 1;
  const base = layout.windowRect ?? layout.videoRect;
  const windowClip = layout.spatial
    ? computeQuickEditSpatialWindow(layout, background)
    : follows
      ? computeQuickEditWindowTransform(layout)
      : base;
  return {
    scale,
    backgroundScale: legacyFollows ? scale : 1,
    x: legacyFollows ? layout.videoTransform.x - scale * layout.videoRect.x : 0,
    y: legacyFollows ? layout.videoTransform.y - scale * layout.videoRect.y : 0,
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
  if (background.zoomBehavior === 'window') return target;
  if (background.zoomBehavior === 'content') return base;
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

function reviewCameraGeometryInputs(
  input: QuickEditCameraSceneInput,
  context: NonNullable<QuickEditZoomRegion['cursorFocus']>
) {
  const size = input.output ?? computeQuickEditSceneSize(input);
  const output = { width: size.width, height: size.height };
  const layout = computeQuickEditSceneLayout({
    ...input,
    output,
    camera: QUICK_EDIT_IDENTITY_CAMERA,
  });
  const policy =
    context.policy ?? resolveCameraFollowPolicy({ legacySensitivity: context.path.sensitivity });
  return { output, layout, policy };
}

function fitSceneSource(input: Omit<SceneInput, 'output' | 'camera'>, content: QuickEditRect) {
  const base = input.canvas ?? input.source;
  const crop = input.canvas?.crop
    ? fitQuickEditSourceCrop(input.source, base, input.canvas.crop)
    : undefined;
  const fitted = fitVideoRect(
    content,
    crop
      ? { width: input.source.width * crop.width, height: input.source.height * crop.height }
      : input.source
  );
  return { crop, fitted };
}
