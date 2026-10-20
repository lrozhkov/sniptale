import { cameraTransitionDerivative } from '../../project/motion/transitions';
import { proveCameraPlan } from '../../composition/motion/camera-plan-proof';
import type { CameraPlanSpan } from '../../composition/motion/camera-plan-proof';
import type { CameraProofGeometry } from '../../composition/motion/camera-plan-proof';
import { cameraFollowMotionLimits } from '../../project/camera/cursor-policy';
import type { ResolvedCameraFollowPolicy } from '../../project/camera/cursor-policy';
import {
  createCameraTrajectory,
  evaluateCameraTrajectory,
  evaluateCameraTrajectoryDerivative,
  cameraTrajectoryBounds,
} from '../../composition/motion/camera-trajectory';
import type { WorkingZoneCameraGeometry } from '../../composition/motion/follow-cursor';
import {
  boundQuickEditCameraMotion,
  boundQuickEditCameraProjection,
} from '../../composition/motion/spatial-projection-bounds';
import type { QuickEditCameraProjectionInterval } from '../../composition/motion/spatial-projection-bounds';
import { fitQuickEditZoomTransitions } from './zoom';
import { resolveQuickEditFocusLink } from './focus-layout';
import { quickEditSpatialSpan } from './spatial';
import {
  interpolateCameraSpatial as interpolateQuickEditSpatial,
  hasCameraPerspective as hasQuickEditPerspective,
} from '../../project/motion/spatial';
import {
  invertQuickEditProjection,
  projectQuickEditPoint,
  quickEditPlaneProjection,
} from '../../composition/motion/spatial-geometry';
import type {
  QuickEditBackgroundSettings,
  QuickEditZoomRegion,
  QuickEditCameraTransform,
} from './types';
import type { QuickEditRect, QuickEditCameraSceneInput } from './types';

function phaseTrajectory(
  start: number,
  end: number,
  type: 'linear' | 'ease-in-out',
  entering: boolean
) {
  const sign = entering ? 1 : -1;
  const duration = end - start;
  const velocity = (sign * cameraTransitionDerivative(0, type, 1)) / duration;
  const acceleration = (sign * cameraTransitionDerivative(0, type, 2)) / duration ** 2;
  return createCameraTrajectory({
    start,
    end,
    from: { x: entering ? 0 : 1, y: 0 },
    to: { x: entering ? 1 : 0, y: 0 },
    fromVelocity: { x: velocity, y: 0 },
    toVelocity: { x: velocity, y: 0 },
    fromAcceleration: { x: acceleration, y: 0 },
    toAcceleration: { x: -acceleration, y: 0 },
  });
}

/** Bind real static layout and authored nominal phases to the pure working-zone planner. */
export function createReviewWorkingZoneCameraGeometry(input: {
  output: { width: number; height: number };
  window: QuickEditRect;
  video: QuickEditRect;
  cornerRadius: number;
  background: QuickEditBackgroundSettings;
  region: QuickEditZoomRegion;
  topology: readonly QuickEditZoomRegion[];
  policy: ResolvedCameraFollowPolicy;
}): WorkingZoneCameraGeometry {
  const region = fitQuickEditZoomTransitions(input.region, input.region.end - input.region.start);
  const linkedPrevious = input.topology.some(
    (item) => resolveQuickEditFocusLink(input.topology, item.id)?.target.id === region.id
  );
  const linkedNext = resolveQuickEditFocusLink(input.topology, region.id) !== null;
  const enter =
    !linkedPrevious && region.enter.type !== 'none' && region.enter.duration > 0
      ? phaseTrajectory(region.start, region.start + region.enter.duration, region.enter.type, true)
      : null;
  const exit =
    !linkedNext && region.exit.type !== 'none' && region.exit.duration > 0
      ? phaseTrajectory(region.end - region.exit.duration, region.end, region.exit.type, false)
      : null;
  const phaseAt = (time: number) =>
    enter && time < enter.end ? enter : exit && time >= exit.start ? exit : 1;
  const phaseValue = (time: number) => {
    const phase = phaseAt(time);
    return typeof phase === 'number' ? phase : evaluateCameraTrajectory(phase, time).x;
  };
  const perspective = hasQuickEditPerspective(region.perspective)
    ? {
        rotateX: region.perspective.rotateX,
        rotateY: region.perspective.rotateY,
        rotateZ: ((region.perspective.rotateZ + 540) % 360) - 180,
        strength: region.perspective.strength,
      }
    : { rotateX: 0, rotateY: 0, rotateZ: 0, strength: 0 };
  const lockBackground = quickEditSpatialSpan(input.topology, (region.start + region.end) / 2);
  const follows =
    input.background.enabled && input.background.zoomBehavior === 'follow-video' && !lockBackground;
  const windowWeight =
    input.background.zoomBehavior === 'window' || follows
      ? 'window'
      : input.background.zoomBehavior === 'content' || !hasQuickEditPerspective(region.perspective)
        ? 'content'
        : 'spatial';
  const interval = (
    start: number,
    end: number,
    targetScale: number
  ): Omit<QuickEditCameraProjectionInterval, 'pan'> => ({
    start,
    end,
    targetScale,
    window: input.window,
    video: input.video,
    output: input.output,
    cornerRadius: input.cornerRadius,
    perspective,
    windowWeight,
    phase: phaseAt((start + end) / 2),
  });
  const minimumScale = (start: number, end: number, targetScale: number) => {
    const values = [phaseValue(start), phaseValue(end)];
    for (const trajectory of [enter, exit]) {
      if (trajectory && start < trajectory.end && end > trajectory.start)
        values.push(
          cameraTrajectoryBounds(
            trajectory,
            Math.max(start, trajectory.start),
            Math.min(end, trajectory.end)
          ).minX
        );
    }
    return 1 + (targetScale - 1) * Math.max(0, Math.min(...values));
  };
  return {
    viewport: { ...input.output },
    window: { width: input.window.width, height: input.window.height },
    breaks: [region.start, enter?.end, exit?.start, region.end].filter(
      (time): time is number => time !== undefined
    ),
    discontinuities(targetScale) {
      if (targetScale === 1 && !hasQuickEditPerspective(region.perspective)) return [];
      const times: number[] = [];
      for (const phase of [enter, exit]) {
        if (!phase) continue;
        for (const time of [phase.start, phase.end])
          if (
            [1, 2].some(
              (order) =>
                Math.abs(evaluateCameraTrajectoryDerivative(phase, time, order === 1 ? 1 : 2).x) >
                1e-9
            )
          )
            times.push(time);
      }
      if (!enter && !linkedPrevious) times.push(region.start);
      if (!exit && !linkedNext) times.push(region.end);
      return times;
    },
    panDomain: (targetScale) => ({
      minX: 0,
      minY: 0,
      maxX: (targetScale - 1) * input.window.width,
      maxY: (targetScale - 1) * input.window.height,
    }),
    pointPanBounds(frame, targetScale, marginFraction = 0) {
      const domain = {
        minX: 0,
        minY: 0,
        maxX: (targetScale - 1) * input.window.width,
        maxY: (targetScale - 1) * input.window.height,
      };
      if (!frame.actual) return domain;
      const progress = phaseValue(frame.time);
      if (progress <= 1e-12) return domain;
      const spatial = interpolateQuickEditSpatial(null, region, progress);
      const scale = 1 + (targetScale - 1) * progress;
      const native = {
        x: input.video.x + frame.actual.x * input.video.width,
        y: input.video.y + frame.actual.y * input.video.height,
      };
      if (windowWeight !== 'window' && hasQuickEditPerspective(region.perspective)) return null;
      const point =
        windowWeight === 'window'
          ? projectQuickEditPoint(
              quickEditPlaneProjection(
                input.window,
                {
                  ...input.window,
                  width: input.window.width * scale,
                  height: input.window.height * scale,
                },
                spatial
              ),
              native
            )
          : {
              x: input.window.x + scale * (native.x - input.window.x),
              y: input.window.y + scale * (native.y - input.window.y),
            };
      if (!point) return null;
      const mx = input.output.width * marginFraction,
        my = input.output.height * marginFraction;
      const bounds = {
        minX: Math.max(domain.minX, (point.x - input.output.width + mx) / progress),
        maxX: Math.min(domain.maxX, (point.x - mx) / progress),
        minY: Math.max(domain.minY, (point.y - input.output.height + my) / progress),
        maxY: Math.min(domain.maxY, (point.y - my) / progress),
      };
      if (windowWeight === 'content') {
        bounds.minX = Math.max(
          bounds.minX,
          (scale * (native.x - input.window.x) - input.window.width) / progress
        );
        bounds.maxX = Math.min(bounds.maxX, (scale * (native.x - input.window.x)) / progress);
        bounds.minY = Math.max(
          bounds.minY,
          (scale * (native.y - input.window.y) - input.window.height) / progress
        );
        bounds.maxY = Math.min(bounds.maxY, (scale * (native.y - input.window.y)) / progress);
      }
      return bounds;
    },
    preferredPan(frame, targetScale) {
      const spatial = interpolateQuickEditSpatial(null, region, 1);
      const basePoint = {
        x: input.video.x + frame.x * input.video.width,
        y: input.video.y + frame.y * input.video.height,
      };
      if (windowWeight === 'content') {
        const inverse = invertQuickEditProjection(
          quickEditPlaneProjection(input.window, input.window, spatial)
        );
        const desired =
          inverse &&
          projectQuickEditPoint(inverse, { x: input.output.width / 2, y: input.output.height / 2 });
        return desired
          ? {
              x: targetScale * (basePoint.x - input.window.x) - desired.x + input.window.x,
              y: targetScale * (basePoint.y - input.window.y) - desired.y + input.window.y,
            }
          : { x: 0, y: 0 };
      }
      const target = {
        ...input.window,
        width: input.window.width * targetScale,
        height: input.window.height * targetScale,
      };
      const projected = projectQuickEditPoint(
        quickEditPlaneProjection(input.window, target, spatial),
        basePoint
      );
      return projected
        ? { x: projected.x - input.output.width / 2, y: projected.y - input.output.height / 2 }
        : { x: 0, y: 0 };
    },
    clearanceBounds({ start, end, targetScale, pan, actual }) {
      return boundQuickEditCameraProjection({
        ...interval(start, end, targetScale),
        pan,
        ...(actual ? { actual } : {}),
      });
    },
    motionBounds({ start, end, targetScale, trajectory, pan }) {
      return boundQuickEditCameraMotion({
        ...interval(start, end, targetScale),
        pan,
        ...(trajectory ? { trajectory } : {}),
      });
    },
    motionLimits(start, end, targetScale) {
      return cameraFollowMotionLimits(input.policy, {
        viewportWidth: input.output.width,
        viewportHeight: input.output.height,
        windowWidth: input.window.width,
        windowHeight: input.window.height,
        minimumScale: minimumScale(start, end, targetScale),
      });
    },
  };
}

/** Bound the renderer's authored link between frozen camera endpoints, including its nominal discontinuities. */
export function createReviewCameraLinkGeometry(input: {
  output: { width: number; height: number };
  window: QuickEditRect;
  video: QuickEditRect;
  cornerRadius: number;
  background: QuickEditBackgroundSettings;
  topology: readonly QuickEditZoomRegion[];
  from: { region: QuickEditZoomRegion; scale: number; pan: { x: number; y: number } };
  to: { region: QuickEditZoomRegion; scale: number; pan: { x: number; y: number } };
  policy: ResolvedCameraFollowPolicy;
}) {
  const start = input.from.region.end,
    end = input.to.region.start;
  const phase = phaseTrajectory(start, end, input.from.region.linkEasing ?? 'ease-in-out', true);
  const perspective = (region: QuickEditZoomRegion) =>
    hasQuickEditPerspective(region.perspective)
      ? {
          rotateX: region.perspective.rotateX,
          rotateY: region.perspective.rotateY,
          rotateZ: region.perspective.rotateZ,
          strength: region.perspective.strength,
        }
      : { rotateX: 0, rotateY: 0, rotateZ: 0, strength: 0 };
  const lockBackground = quickEditSpatialSpan(input.topology, (start + end) / 2);
  const follows =
    input.background.enabled && input.background.zoomBehavior === 'follow-video' && !lockBackground;
  const windowWeight =
    input.background.zoomBehavior === 'window' || follows
      ? 'window'
      : input.background.zoomBehavior === 'content' || !lockBackground
        ? 'content'
        : 'spatial';
  const interval = (
    a: number,
    b: number,
    pan: QuickEditCameraProjectionInterval['pan']
  ): QuickEditCameraProjectionInterval => ({
    start: a,
    end: b,
    window: input.window,
    video: input.video,
    output: input.output,
    cornerRadius: input.cornerRadius,
    targetScale: input.to.scale,
    phase,
    pan,
    windowWeight,
    perspective: perspective(input.to.region),
    targetWindowMotion: hasQuickEditPerspective(input.to.region.perspective) ? 1 : 0,
    from: {
      scale: input.from.scale,
      pan: input.from.pan,
      perspective: perspective(input.from.region),
      windowMotion: hasQuickEditPerspective(input.from.region.perspective) ? 1 : 0,
    },
  });
  const geometry: CameraProofGeometry = {
    breaks: [start, end],
    clearanceBounds({ start: a, end: b, pan, actual }) {
      return boundQuickEditCameraProjection({
        ...interval(a, b, pan),
        ...(actual ? { actual } : {}),
      });
    },
    motionBounds({ start: a, end: b, pan }) {
      return boundQuickEditCameraMotion(interval(a, b, pan));
    },
  };
  return {
    geometry,
    limits: cameraFollowMotionLimits(input.policy, {
      viewportWidth: input.output.width,
      viewportHeight: input.output.height,
      windowWidth: input.window.width,
      windowHeight: input.window.height,
      minimumScale: Math.min(input.from.scale, input.to.scale),
    }),
  };
}

/** Prove an authored gap from frozen admitted endpoints and native observation runs. */
export function proveReviewCameraGap(input: {
  output: { width: number; height: number };
  layout: { windowRect: QuickEditRect; videoRect: QuickEditRect };
  scene: QuickEditCameraSceneInput;
  regions: readonly QuickEditZoomRegion[];
  source: QuickEditZoomRegion;
  target: QuickEditZoomRegion;
  from: QuickEditCameraTransform;
  to: QuickEditCameraTransform;
  policy: ResolvedCameraFollowPolicy;
  observations: Parameters<typeof proveCameraPlan>[0]['observations'];
}) {
  const { source, target, output, layout, scene, policy, observations } = input;
  const pan = (camera: QuickEditCameraTransform) => ({
    x:
      Math.max(0, Math.min(camera.scale - 1, camera.centerX * camera.scale - 0.5)) *
      layout.windowRect.width,
    y:
      Math.max(0, Math.min(camera.scale - 1, camera.centerY * camera.scale - 0.5)) *
      layout.windowRect.height,
  });
  const toPan = pan(input.to);
  const adapter = createReviewCameraLinkGeometry({
    output,
    window: layout.windowRect,
    video: layout.videoRect,
    cornerRadius: scene.background.enabled
      ? (scene.background.layout.cornerRadius * output.width) /
        (scene.canvas?.width ?? scene.source.width)
      : 0,
    background: scene.background,
    topology: input.regions,
    from: { region: source, scale: input.from.scale, pan: pan(input.from) },
    to: { region: target, scale: input.to.scale, pan: toPan },
    policy,
  });
  const spans: CameraPlanSpan[] = [];
  let cursor = source.end;
  for (let index = 0; index < observations.length; index++) {
    const current = observations[index]!,
      next = observations[index + 1];
    if (next?.segmentId === current.segmentId) continue;
    const end = next?.time ?? target.start;
    if (end > cursor || spans.length === 0)
      spans.push({ kind: 'hold', pan: toPan, start: cursor, end, segmentId: current.segmentId });
    cursor = end;
  }
  if (!spans.length)
    spans.push({ kind: 'hold', pan: toPan, start: source.end, end: target.start, segmentId: '' });
  return proveCameraPlan({
    spans,
    observations,
    geometry: adapter.geometry,
    targetScale: input.to.scale,
    limits: adapter.limits,
    preservePointer: policy.settings.preservePointer,
  });
}

/** Select every nominal field that the cached renderer geometry or authored link can read. */
export function reviewCameraNominalDescriptor(region: QuickEditZoomRegion) {
  return {
    id: region.id,
    start: region.start,
    end: region.end,
    transform: region.transform,
    enter: region.enter,
    exit: region.exit,
    linkTo: region.linkTo,
    linkEasing: region.linkEasing,
    perspective: region.perspective,
    dormant: region.dormant,
    spotlight: !!region.spotlight,
  };
}

/** Frozen endpoint metadata identifies the gap proof without serializing captured observations. */
export function reviewCameraGapSignature(
  input: Pick<
    Parameters<typeof proveReviewCameraGap>[0],
    'source' | 'target' | 'from' | 'to' | 'scene' | 'policy'
  >
) {
  return JSON.stringify({
    source: reviewCameraNominalDescriptor(input.source),
    target: reviewCameraNominalDescriptor(input.target),
    from: input.from,
    to: input.to,
    input: input.scene,
    policy: input.policy,
  });
}
