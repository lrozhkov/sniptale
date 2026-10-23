import {
  proveCameraPlan,
  type CameraPlanSpan,
  type CameraProofGeometry,
  type CameraProjectionProof,
} from './camera-plan-proof';
import {
  cameraTransitionDerivative,
  type CameraTransition,
  type CameraTransitionType,
} from '../../project/motion/transitions';
import {
  cameraFollowMotionLimits,
  type ResolvedCameraFollowPolicy,
} from '../../project/camera/cursor-policy';
import {
  interpolateCameraSpatial as interpolateQuickEditSpatial,
  hasCameraPerspective as hasQuickEditPerspective,
  type CameraSpatialRect,
  type CameraSpatialSettings,
} from '../../project/motion/spatial';
import {
  createCameraTrajectory,
  evaluateCameraTrajectory,
  evaluateCameraTrajectoryDerivative,
  cameraTrajectoryBounds,
} from './camera-trajectory';
import type { WorkingZoneCameraGeometry, FollowCursorFrame } from './follow-cursor';
import {
  boundQuickEditCameraMotion,
  boundQuickEditCameraProjection,
  type QuickEditCameraProjectionInterval,
} from './spatial-projection-bounds';
import {
  invertQuickEditProjection,
  projectQuickEditPoint,
  quickEditPlaneProjection,
  type QuickEditHomography,
} from './spatial-geometry';

function createWindowPhaseTrajectory(
  start: number,
  end: number,
  type: CameraTransitionType,
  entering: boolean
) {
  const sign = entering ? 1 : -1;
  const duration = end - start;
  const velocity = (progress: number) =>
    (sign * cameraTransitionDerivative(progress, type, 1)) / duration;
  const acceleration = (progress: number) =>
    (sign * cameraTransitionDerivative(progress, type, 2)) / duration ** 2;
  return createCameraTrajectory({
    start,
    end,
    from: { x: entering ? 0 : 1, y: 0 },
    to: { x: entering ? 1 : 0, y: 0 },
    fromVelocity: { x: velocity(0), y: 0 },
    toVelocity: { x: velocity(1), y: 0 },
    fromAcceleration: { x: acceleration(0), y: 0 },
    toAcceleration: { x: acceleration(1), y: 0 },
  });
}

function mergeWindowProjectionBounds(
  left: CameraProjectionProof,
  right: CameraProjectionProof
): CameraProjectionProof {
  const merge = (a: { low: number; high: number }, b: { low: number; high: number }) => ({
    low: Math.min(a.low, b.low),
    high: Math.max(a.high, b.high),
  });
  const raster =
    left.raster && right.raster ? merge(left.raster, right.raster) : (left.raster ?? right.raster);
  const viewport =
    left.viewport && right.viewport
      ? merge(left.viewport, right.viewport)
      : (left.viewport ?? right.viewport);
  return {
    pose: merge(left.pose, right.pose),
    denominator: merge(left.denominator, right.denominator),
    ...(raster ? { raster } : {}),
    ...(viewport ? { viewport } : {}),
  };
}

/** Shared decorated-window geometry; each editor owns its topology and observations. */
export function createWindowCameraGeometry(input: {
  output: { width: number; height: number };
  window: CameraSpatialRect;
  video: CameraSpatialRect;
  cornerRadius: number;
  planeTransform?: QuickEditHomography;
  intervalPlane?: (
    start: number,
    end: number
  ) => Pick<QuickEditCameraProjectionInterval, 'planeTransform' | 'planeTransition'> | null;
  planeBreaks?: readonly number[];
  phaseHoldAt?: number;
  windowWeight: 'window' | 'content' | 'spatial';
  region: CameraSpatialSettings & {
    start: number;
    end: number;
    enter: CameraTransition;
    exit: CameraTransition;
  };
  connectedIn: boolean;
  connectedOut: boolean;
  policy: ResolvedCameraFollowPolicy;
}): WorkingZoneCameraGeometry {
  const { region } = input;
  const enter =
    !input.connectedIn &&
    region.enter.type !== 'none' &&
    region.enter.type !== 'instant' &&
    region.enter.duration > 0
      ? createWindowPhaseTrajectory(
          region.start,
          region.start + region.enter.duration,
          region.enter.type,
          true
        )
      : null;
  const exit =
    !input.connectedOut &&
    region.exit.type !== 'none' &&
    region.exit.type !== 'instant' &&
    region.exit.duration > 0
      ? createWindowPhaseTrajectory(
          region.end - region.exit.duration,
          region.end,
          region.exit.type,
          false
        )
      : null;
  const exitStart = region.end - region.exit.duration;
  const phaseTrajectoryAt = (time: number) => {
    if (
      !input.connectedIn &&
      region.enter.duration > 0 &&
      time < region.start + region.enter.duration
    ) {
      if (region.enter.type === 'instant') return time <= region.start ? 0 : 1;
      if (enter) return enter;
    }
    if (!input.connectedOut && region.exit.duration > 0 && time > exitStart) {
      if (region.exit.type === 'instant') return 0;
      if (exit) return exit;
    }
    return 1;
  };
  const phaseAt = (time: number) => {
    const hold = input.phaseHoldAt;
    if (hold !== undefined && time >= hold) {
      const phase = phaseTrajectoryAt(hold);
      return typeof phase === 'number' ? phase : evaluateCameraTrajectory(phase, hold).x;
    }
    return phaseTrajectoryAt(time);
  };
  const instantBoundaries = [
    ...(!input.connectedIn && region.enter.type === 'instant' && region.enter.duration > 0
      ? [region.start]
      : []),
    ...(!input.connectedOut && region.exit.type === 'instant' && region.exit.duration > 0
      ? [exitStart]
      : []),
  ];
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
  const windowWeight = input.windowWeight;
  const outputPlane = (time: number) => {
    const plane = input.intervalPlane?.(time, time);
    const transition = plane?.planeTransition;
    const phase =
      transition &&
      (typeof transition.phase === 'number'
        ? transition.phase
        : evaluateCameraTrajectory(transition.phase, time).x);
    const value = (index: number) =>
      transition && typeof phase === 'number'
        ? transition.from[index]! + (transition.to[index]! - transition.from[index]!) * phase
        : 0;
    const matrix: QuickEditHomography | undefined = transition
      ? [value(0), value(1), value(2), value(3), value(4), value(5), 0, 0, 1]
      : (plane?.planeTransform ?? input.planeTransform);
    const inversePlane = matrix && invertQuickEditProjection(matrix);
    const outputCorners = inversePlane
      ? [
          [0, 0],
          [input.output.width, 0],
          [input.output.width, input.output.height],
          [0, input.output.height],
        ].flatMap(([x, y]) => {
          const point = projectQuickEditPoint(inversePlane, { x: x!, y: y! });
          return point ? [point] : [];
        })
      : [];
    const outputBounds =
      outputCorners.length === 4
        ? {
            left: Math.min(...outputCorners.map((point) => point.x)),
            right: Math.max(...outputCorners.map((point) => point.x)),
            top: Math.min(...outputCorners.map((point) => point.y)),
            bottom: Math.max(...outputCorners.map((point) => point.y)),
          }
        : { left: 0, right: input.output.width, top: 0, bottom: input.output.height };
    const outputCenter = inversePlane
      ? projectQuickEditPoint(inversePlane, {
          x: input.output.width / 2,
          y: input.output.height / 2,
        })
      : { x: input.output.width / 2, y: input.output.height / 2 };
    return { outputBounds, outputCenter };
  };
  const interval = (
    start: number,
    end: number,
    targetScale: number
  ): Omit<QuickEditCameraProjectionInterval, 'pan'> | null => {
    // Proof cells must split where the camera clock stops.
    if (input.phaseHoldAt !== undefined && start < input.phaseHoldAt && end > input.phaseHoldAt)
      return null;
    const plane = input.intervalPlane?.(start, end);
    if (input.intervalPlane && !plane) return null;
    return {
      start,
      end,
      targetScale,
      window: input.window,
      video: input.video,
      output: input.output,
      cornerRadius: input.cornerRadius,
      ...(input.planeTransform ? { planeTransform: input.planeTransform } : {}),
      perspective,
      windowWeight,
      phase: phaseAt((start + end) / 2),
      ...plane,
    };
  };
  const minimumScale = (start: number, end: number, targetScale: number) => {
    const values = [phaseValue(start), phaseValue(end)];
    end = Math.min(end, input.phaseHoldAt ?? Infinity);
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
    breaks: [
      region.start,
      input.phaseHoldAt,
      enter?.end,
      exit?.start,
      ...(!input.connectedOut && region.exit.type === 'instant' ? [exitStart] : []),
      region.end,
      ...(input.planeBreaks ?? []),
    ].filter((time): time is number => time !== undefined),
    discontinuities(targetScale) {
      if (targetScale === 1 && !hasQuickEditPerspective(region.perspective)) return [];
      const times: number[] = [];
      const hold = input.phaseHoldAt;
      if (hold !== undefined) {
        const phase = phaseTrajectoryAt(hold);
        if (
          typeof phase !== 'number' &&
          [1, 2].some(
            (order) =>
              Math.abs(evaluateCameraTrajectoryDerivative(phase, hold, order === 1 ? 1 : 2).x) >
              1e-9
          )
        )
          times.push(hold);
      }
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
      if (!enter && !input.connectedIn) times.push(region.start);
      if (!exit && !input.connectedOut)
        times.push(
          region.exit.type === 'instant' && region.exit.duration > 0 ? exitStart : region.end
        );
      return times;
    },
    panDomain: (targetScale) => ({
      minX: 0,
      minY: 0,
      maxX: (targetScale - 1) * input.window.width,
      maxY: (targetScale - 1) * input.window.height,
    }),
    pointPanBounds(frame, targetScale, marginFraction = 0) {
      const { outputBounds } = outputPlane(frame.time);
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
        minX: Math.max(domain.minX, (point.x - outputBounds.right + mx) / progress),
        maxX: Math.min(domain.maxX, (point.x - outputBounds.left - mx) / progress),
        minY: Math.max(domain.minY, (point.y - outputBounds.bottom + my) / progress),
        maxY: Math.min(domain.maxY, (point.y - outputBounds.top - my) / progress),
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
      const { outputCenter } = outputPlane(frame.time);
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
        ? {
            x: projected.x - (outputCenter?.x ?? input.output.width / 2),
            y: projected.y - (outputCenter?.y ?? input.output.height / 2),
          }
        : { x: 0, y: 0 };
    },
    clearanceBounds({ start, end, targetScale, pan, actual }) {
      const current = interval(start, end, targetScale);
      if (!current) return null;
      let bounds = boundQuickEditCameraProjection({
        ...current,
        pan,
        ...(actual ? { actual } : {}),
      });
      if (!bounds) return null;
      // Proof cells split at breaks; closed cells also contain the exact instant-jump endpoint.
      for (const time of instantBoundaries) {
        if (time < start || time > end) continue;
        const edge = interval(time, time, targetScale);
        if (!edge) return null;
        const fraction = end > start ? (time - start) / (end - start) : 0;
        const point = actual && {
          x: actual.from.x + (actual.to.x - actual.from.x) * fraction,
          y: actual.from.y + (actual.to.y - actual.from.y) * fraction,
        };
        const endpoint = boundQuickEditCameraProjection({
          ...edge,
          pan,
          ...(point ? { actual: { from: point, to: point } } : {}),
        });
        if (!endpoint) return null;
        bounds = mergeWindowProjectionBounds(bounds, endpoint);
      }
      return bounds;
    },
    motionBounds({ start, end, targetScale, trajectory, pan }) {
      const current = interval(start, end, targetScale);
      return current
        ? boundQuickEditCameraMotion({ ...current, pan, ...(trajectory ? { trajectory } : {}) })
        : null;
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

/** Clip native linear observations without joining separate visible visits across discarded pixels. */
export function cropWindowCameraObservations(
  frames: readonly FollowCursorFrame[],
  crop: CameraSpatialRect
) {
  const result: FollowCursorFrame[] = [];
  let visit = 0;
  let previousEnd = -Infinity;
  let previousSegment = '';
  for (let index = 0; index < frames.length; index++) {
    const a = frames[index]!;
    const next = frames[index + 1];
    const b = next?.segmentId === a.segmentId ? next : a;
    const from = a.actual ?? a;
    const to = b.actual ?? b;
    let low = 0,
      high = 1;
    for (const axis of ['x', 'y'] as const) {
      const start = crop[axis];
      const end = start + (axis === 'x' ? crop.width : crop.height);
      const delta = to[axis] - from[axis];
      if (delta === 0) {
        if (from[axis] < start || from[axis] > end) high = -1;
      } else {
        const left = (start - from[axis]) / delta;
        const right = (end - from[axis]) / delta;
        low = Math.max(low, Math.min(left, right));
        high = Math.min(high, Math.max(left, right));
      }
    }
    if (low > high) continue;
    const startTime = a.time + (b.time - a.time) * low;
    if (previousSegment !== a.segmentId || Math.abs(previousEnd - startTime) > 1e-9) visit++;
    const segmentId = `${a.segmentId}:crop:${visit}`;
    for (const fraction of [low, high]) {
      const mix = (left: number, right: number) => left + (right - left) * fraction;
      const time = mix(a.time, b.time);
      if (result.at(-1)?.time === time && result.at(-1)?.segmentId === segmentId) continue;
      const { actual: _actual, ...base } = a;
      result.push({
        ...base,
        time,
        segmentId,
        x: mix(a.x, b.x),
        y: mix(a.y, b.y),
        ...(a.actual && b.actual ? { actual: { x: mix(from.x, to.x), y: mix(from.y, to.y) } } : {}),
      });
    }
    previousEnd = a.time + (b.time - a.time) * high;
    previousSegment = a.segmentId;
  }
  return result;
}

/** Bound the same frozen window endpoints for Gallery and multitrack camera links. */
export function createWindowCameraLinkGeometry(input: {
  output: { width: number; height: number };
  window: CameraSpatialRect;
  video: CameraSpatialRect;
  cornerRadius: number;
  planeTransform?: QuickEditHomography;
  intervalPlane?: (
    start: number,
    end: number
  ) => Pick<QuickEditCameraProjectionInterval, 'planeTransform' | 'planeTransition'> | null;
  planeBreaks?: readonly number[];
  windowWeight: QuickEditCameraProjectionInterval['windowWeight'];
  type: CameraTransitionType;
  from: {
    end: number;
    scale: number;
    pan: { x: number; y: number };
    perspective?: CameraSpatialSettings['perspective'];
  };
  to: {
    start: number;
    scale: number;
    pan: { x: number; y: number };
    perspective?: CameraSpatialSettings['perspective'];
  };
  policy: ResolvedCameraFollowPolicy;
}) {
  const start = input.from.end,
    end = input.to.start;
  const phase =
    input.type === 'instant' || input.type === 'none'
      ? 1
      : createWindowPhaseTrajectory(start, end, input.type, true);
  const perspective = (value: CameraSpatialSettings['perspective']) =>
    hasQuickEditPerspective(value)
      ? {
          rotateX: value.rotateX,
          rotateY: value.rotateY,
          rotateZ: value.rotateZ,
          strength: value.strength,
        }
      : { rotateX: 0, rotateY: 0, rotateZ: 0, strength: 0 };
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
    ...(input.planeTransform ? { planeTransform: input.planeTransform } : {}),
    targetScale: input.to.scale,
    phase: input.type === 'instant' && b === start ? 0 : phase,
    pan,
    windowWeight: input.windowWeight,
    perspective: perspective(input.to.perspective),
    targetWindowMotion: hasQuickEditPerspective(input.to.perspective) ? 1 : 0,
    from: {
      scale: input.from.scale,
      pan: input.from.pan,
      perspective: perspective(input.from.perspective),
      windowMotion: hasQuickEditPerspective(input.from.perspective) ? 1 : 0,
    },
  });
  const geometry: CameraProofGeometry = {
    breaks: [start, end, ...(input.planeBreaks ?? [])],
    clearanceBounds({ start: a, end: b, pan, actual }) {
      const plane = input.intervalPlane?.(a, b);
      if (input.intervalPlane && !plane) return null;
      const current = boundQuickEditCameraProjection({
        ...plane,
        ...interval(a, b, pan),
        ...(actual ? { actual } : {}),
      });
      if (!current || input.type !== 'instant' || a !== start || b === start) return current;
      const previous = boundQuickEditCameraProjection({
        ...interval(start, start, pan),
        ...input.intervalPlane?.(start, start),
        phase: 0,
        ...(actual ? { actual: { from: actual.from, to: actual.from } } : {}),
      });
      if (!previous) return null;
      return mergeWindowProjectionBounds(current, previous);
    },
    motionBounds({ start: a, end: b, pan }) {
      const plane = input.intervalPlane?.(a, b);
      if (input.intervalPlane && !plane) return null;
      return boundQuickEditCameraMotion({ ...interval(a, b, pan), ...plane });
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

/** Native observation runs remain separate while the authored camera gap uses frozen endpoints. */
export function proveWindowCameraGap(input: {
  adapter: ReturnType<typeof createWindowCameraLinkGeometry>;
  start: number;
  end: number;
  targetScale: number;
  toPan: { x: number; y: number };
  policy: ResolvedCameraFollowPolicy;
  observations: Parameters<typeof proveCameraPlan>[0]['observations'];
}) {
  const { adapter, observations, toPan } = input;
  const spans: CameraPlanSpan[] = [];
  let cursor = input.start;
  for (let index = 0; index < observations.length; index++) {
    const current = observations[index]!,
      next = observations[index + 1];
    if (next?.segmentId === current.segmentId) continue;
    const end = next?.time ?? input.end;
    if (end > cursor || spans.length === 0)
      spans.push({ kind: 'hold', pan: toPan, start: cursor, end, segmentId: current.segmentId });
    cursor = end;
  }
  if (!spans.length)
    spans.push({ kind: 'hold', pan: toPan, start: input.start, end: input.end, segmentId: '' });
  return proveCameraPlan({
    spans,
    observations,
    geometry: adapter.geometry,
    targetScale: input.targetScale,
    limits: adapter.limits,
    preservePointer: input.policy.settings.preservePointer,
  });
}
