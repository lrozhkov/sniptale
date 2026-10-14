import type { CursorFocusPoint } from '../../project/cursor-focus-path/types';
import type { ResolvedCameraFollowPolicy } from '../../project/camera/cursor-policy';
import { createCameraTrajectory, evaluateCameraTrajectoryDerivative } from './camera-trajectory';
import type { CameraPanBounds, CameraPanPoint } from './camera-trajectory';
import { evaluateCameraPlanSpan, proveCameraPlan } from './camera-plan-proof';
import type {
  CameraPlanSpan,
  CameraPlanProofResult,
  CameraProofGeometry,
} from './camera-plan-proof';
import {
  groupCameraWorkingZones,
  mergeCameraWorkingZones,
  createCameraWorkingZone,
} from './camera-zones';
import type { CameraWorkingZone } from './camera-zones';

/** Projection facts are supplied by the renderer that will consume the resulting plan. */
export interface WorkingZoneCameraGeometry extends CameraProofGeometry {
  viewport: { width: number; height: number };
  window: { width: number; height: number };
  preferredPan(frame: FollowCursorFrame, targetScale: number): CameraPanPoint;
  panDomain(targetScale: number): CameraPanBounds;
  /** Necessary real-geometry bounds at a captured point; continuous admission still verifies the entire interval. */
  pointPanBounds?(
    frame: FollowCursorFrame,
    targetScale: number,
    marginFraction?: number
  ): CameraPanBounds | null;
  discontinuities?(targetScale: number): readonly number[];
  motionLimits(
    start: number,
    end: number,
    targetScale: number
  ): {
    speed: number;
    acceleration: number;
    jerk: number;
  };
}

export type WorkingZoneCameraPlan =
  | {
      status: 'ready';
      spans: readonly CameraPlanSpan[];
      targetScale: number;
      discontinuities: readonly { time: number; reason: 'source' | 'nominal' }[];
    }
  | {
      status: 'conflict';
      interval: { start: number; end: number };
      reason: Extract<CameraPlanProofResult, { status: 'conflict' }>['reason'];
      time: number;
      fallback: CameraPanPoint;
    };

interface PlannedCameraZone extends CameraWorkingZone {
  pan: CameraPanPoint;
}

function legalPan(point: CameraPanPoint, bounds: CameraPanBounds): CameraPanPoint {
  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, point.x)),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, point.y)),
  };
}

function intersectPanBounds(a: CameraPanBounds, b: CameraPanBounds): CameraPanBounds {
  return {
    minX: Math.max(a.minX, b.minX),
    maxX: Math.min(a.maxX, b.maxX),
    minY: Math.max(a.minY, b.minY),
    maxY: Math.min(a.maxY, b.maxY),
  };
}

/** Plan held activity centers and anticipatory C2 transitions over the complete selected interval. */
export interface CameraBoundaryState {
  pan: CameraPanPoint;
  velocity: CameraPanPoint;
  acceleration: CameraPanPoint;
}

export interface WorkingZoneCameraBoundaries {
  incoming?: CameraBoundaryState;
  outgoing?: CameraBoundaryState;
}

/** Endpoint derivatives use nominal target-zoom pixels and output seconds. */
export function evaluateWorkingZoneCameraBoundary(
  plan: Extract<WorkingZoneCameraPlan, { status: 'ready' }>,
  time: number
): CameraBoundaryState {
  const span = plan.spans.findLast((item) => item.start <= time) ?? plan.spans[0];
  return {
    pan: evaluateWorkingZoneCamera(plan, time),
    velocity:
      span?.kind === 'transition'
        ? evaluateCameraTrajectoryDerivative(span.trajectory, time, 1)
        : { x: 0, y: 0 },
    acceleration:
      span?.kind === 'transition'
        ? evaluateCameraTrajectoryDerivative(span.trajectory, time, 2)
        : { x: 0, y: 0 },
  };
}

interface WorkingZoneCameraInput extends WorkingZoneCameraBoundaries {
  frames: readonly FollowCursorFrame[];
  start: number;
  end: number;
  targetScale: number;
  policy: ResolvedCameraFollowPolicy;
  geometry: WorkingZoneCameraGeometry;
  fallback?: CameraPanPoint;
}

export function planWorkingZoneCamera(input: WorkingZoneCameraInput): WorkingZoneCameraPlan {
  const nominal = planWorkingZoneCameraAtScale(input);
  // A shared boundary uses its neighbor's nominal scale.
  // Keep that scale across this camera.
  if (
    nominal.status === 'ready' ||
    !input.policy.settings.allowExpansion ||
    input.incoming ||
    input.outgoing
  )
    return nominal;
  const minimum = Math.max(1, Math.min(input.targetScale, input.policy.settings.minimumScale));
  if (minimum === input.targetScale) return nominal;
  for (const fraction of [0.75, 0.5, 0.25, 0]) {
    const expanded = planWorkingZoneCameraAtScale({
      ...input,
      targetScale: minimum + (input.targetScale - minimum) * fraction,
    });
    if (expanded.status === 'ready') return expanded;
  }
  return nominal;
}

function validateCameraInput(input: WorkingZoneCameraInput) {
  const frames = input.frames;
  if (
    !Number.isFinite(input.start) ||
    !Number.isFinite(input.end) ||
    input.end < input.start ||
    !Number.isFinite(input.targetScale) ||
    input.targetScale < 1
  )
    throw new Error('Camera planning requires a finite selected interval and target scale.');
  if (
    frames.some(
      (frame, index) =>
        !Number.isFinite(frame.time) ||
        !Number.isFinite(frame.x) ||
        !Number.isFinite(frame.y) ||
        frame.time < input.start ||
        frame.time > input.end ||
        (index > 0 &&
          (frame.time < frames[index - 1]!.time ||
            (frame.time === frames[index - 1]!.time &&
              frame.segmentId === frames[index - 1]!.segmentId)))
    )
  )
    throw new Error(
      'Camera observations require finite coordinates and increasing selected output times.'
    );
}

function illegalCameraBoundary(
  input: WorkingZoneCameraInput,
  domain: CameraPanBounds,
  fallback: CameraPanPoint
): Extract<WorkingZoneCameraPlan, { status: 'conflict' }> | undefined {
  for (const [boundary, time] of [
    [input.incoming, input.start],
    [input.outgoing, input.end],
  ] as const) {
    if (!boundary) continue;
    if (
      [boundary.pan, boundary.velocity, boundary.acceleration].some(
        (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)
      ) ||
      boundary.pan.x < domain.minX ||
      boundary.pan.x > domain.maxX ||
      boundary.pan.y < domain.minY ||
      boundary.pan.y > domain.maxY
    )
      return {
        status: 'conflict',
        reason: 'pose',
        interval: { start: input.start, end: input.end },
        time,
        fallback,
      };
  }
  return undefined;
}

function cameraReady(
  input: WorkingZoneCameraInput,
  spans: readonly CameraPlanSpan[],
  discontinuities: Extract<WorkingZoneCameraPlan, { status: 'ready' }>['discontinuities']
): WorkingZoneCameraPlan {
  return { status: 'ready', spans, targetScale: input.targetScale, discontinuities };
}

function proveWorkingZoneSpans(
  input: WorkingZoneCameraInput,
  spans: readonly CameraPlanSpan[],
  targetScale = input.targetScale
) {
  const { frames, geometry, policy } = input;
  return proveCameraPlan({
    spans,
    observations: frames,
    geometry,
    targetScale,
    preservePointer: policy.settings.preservePointer,
    limits: geometry.motionLimits(input.start, input.end, targetScale),
    limitsAt: (start, end) => geometry.motionLimits(start, end, targetScale),
  });
}

function boundaryMoves(boundary: CameraBoundaryState | undefined, span: CameraPlanSpan) {
  return (
    !!boundary &&
    (span.kind !== 'hold' ||
      Math.hypot(
        boundary.pan.x - span.pan.x,
        boundary.pan.y - span.pan.y,
        boundary.velocity.x,
        boundary.velocity.y,
        boundary.acceleration.x,
        boundary.acceleration.y
      ) > 1e-8)
  );
}

function boundaryTransitionDuration(
  input: WorkingZoneCameraInput,
  boundary: CameraBoundaryState | undefined,
  span: CameraPlanSpan
) {
  const { geometry, policy } = input;
  if (!boundary || span.kind !== 'hold') return 0;
  const distance = Math.hypot(boundary.pan.x - span.pan.x, boundary.pan.y - span.pan.y);
  const caps = geometry.motionLimits(span.start, span.end, input.targetScale);
  return Math.max(
    policy.settings.transitionDuration,
    (1.875 * distance) / caps.speed,
    Math.sqrt((((10 * Math.sqrt(3)) / 3) * distance) / caps.acceleration),
    Math.cbrt((60 * distance) / caps.jerk)
  );
}

function spliceCameraBoundarySpans(
  input: WorkingZoneCameraInput,
  body: readonly CameraPlanSpan[],
  incoming: CameraBoundaryState | undefined,
  outgoing: CameraBoundaryState | undefined,
  enterEnd: number,
  exitStart: number
) {
  const first = body[0]!,
    last = body.at(-1)!;
  const spans: CameraPlanSpan[] = body.flatMap((span, index) => {
    const start = index === 0 ? enterEnd : span.start;
    const end = index === body.length - 1 ? exitStart : span.end;
    return end >= start ? [{ ...span, start, end }] : [];
  });
  if (incoming && first.kind === 'hold')
    spans.unshift({
      kind: 'transition',
      start: input.start,
      end: enterEnd,
      segmentId: first.segmentId,
      trajectory: createCameraTrajectory({
        start: input.start,
        end: enterEnd,
        from: incoming.pan,
        to: first.pan,
        fromVelocity: incoming.velocity,
        fromAcceleration: incoming.acceleration,
      }),
    });
  if (outgoing && last.kind === 'hold')
    spans.push({
      kind: 'transition',
      start: exitStart,
      end: input.end,
      segmentId: last.segmentId,
      trajectory: createCameraTrajectory({
        start: exitStart,
        end: input.end,
        from: last.pan,
        to: outgoing.pan,
        toVelocity: outgoing.velocity,
        toAcceleration: outgoing.acceleration,
      }),
    });
  return spans;
}

function admitCameraBoundaries(
  input: WorkingZoneCameraInput,
  body: readonly CameraPlanSpan[],
  discontinuities: Extract<WorkingZoneCameraPlan, { status: 'ready' }>['discontinuities'],
  fallback: CameraPanPoint
): WorkingZoneCameraPlan {
  const first = body[0]!,
    last = body.at(-1)!;
  const incoming = boundaryMoves(input.incoming, first) ? input.incoming : undefined;
  const outgoing = boundaryMoves(input.outgoing, last) ? input.outgoing : undefined;
  if ((incoming && first.kind !== 'hold') || (outgoing && last.kind !== 'hold'))
    return {
      status: 'conflict',
      reason: 'unproven',
      interval: { start: input.start, end: input.end },
      time: input.start,
      fallback,
    };
  let failure: CameraPlanProofResult = {
    status: 'conflict',
    reason: 'unproven',
    time: input.start,
  };
  for (const factor of [1, 1.5, 2, 3]) {
    const enterEnd = input.start + boundaryTransitionDuration(input, incoming, first) * factor;
    const exitStart = input.end - boundaryTransitionDuration(input, outgoing, last) * factor;
    if (enterEnd > first.end || exitStart < last.start || enterEnd > exitStart) continue;
    const spans = spliceCameraBoundarySpans(input, body, incoming, outgoing, enterEnd, exitStart);
    failure = proveWorkingZoneSpans(input, spans);
    if (failure.status === 'proven') return cameraReady(input, spans, discontinuities);
  }
  return {
    status: 'conflict',
    reason: failure.status === 'conflict' ? failure.reason : 'unproven',
    interval: { start: input.start, end: input.end },
    time: failure.status === 'conflict' ? failure.time : input.start,
    fallback,
  };
}

function zoneFramingBounds(input: WorkingZoneCameraInput, zone: CameraWorkingZone) {
  const { frames, geometry, policy } = input;
  const domain = geometry.panDomain(input.targetScale);
  let bounds = domain;
  let softBounds = domain;
  if (policy.settings.preservePointer && geometry.pointPanBounds) {
    for (let index = zone.first; index <= zone.last; index++) {
      const pointBounds = geometry.pointPanBounds(frames[index]!, input.targetScale);
      if (pointBounds) bounds = intersectPanBounds(bounds, pointBounds);
      const marginBounds = geometry.pointPanBounds(
        frames[index]!,
        input.targetScale,
        policy.settings.marginFraction
      );
      if (marginBounds) softBounds = intersectPanBounds(softBounds, marginBounds);
    }
  }
  if (bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) return null;
  const recommended = intersectPanBounds(bounds, softBounds);
  const framingBounds = {
    minX: recommended.minX <= recommended.maxX ? recommended.minX : bounds.minX,
    maxX: recommended.minX <= recommended.maxX ? recommended.maxX : bounds.maxX,
    minY: recommended.minY <= recommended.maxY ? recommended.minY : bounds.minY,
    maxY: recommended.minY <= recommended.maxY ? recommended.maxY : bounds.maxY,
  };
  return { bounds, framingBounds };
}

function fitCameraZone(
  input: WorkingZoneCameraInput,
  zone: CameraWorkingZone,
  preferences: readonly FollowCursorFrame[]
) {
  const { frames, geometry } = input;
  const fit = zoneFramingBounds(input, zone);
  if (!fit)
    return {
      proof: { status: 'conflict' as const, reason: 'viewport' as const, time: zone.start },
      pan: undefined,
    };
  const { bounds, framingBounds } = fit;
  const preferred = legalPan(zone.preferred, framingBounds);
  const candidateIndexes = [
    ...new Set(
      Array.from({ length: 9 }, (_, index) =>
        Math.round(zone.first + ((zone.last - zone.first) * index) / 8)
      )
    ),
  ];
  const actualCandidates = candidateIndexes.flatMap((index) => {
    const frame = frames[index]!;
    return frame.actual
      ? [legalPan(geometry.preferredPan({ ...frame, ...frame.actual }, input.targetScale), bounds)]
      : [];
  });
  const candidates = [
    ...new Map(
      [
        preferred,
        legalPan(
          { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
          bounds
        ),
        ...candidateIndexes.map((index) => legalPan(preferences[index]!, bounds)),
        ...actualCandidates,
      ].map((point) => [`${point.x}:${point.y}`, point])
    ).values(),
  ];
  candidates.sort(
    (a, b) =>
      Math.hypot(a.x - preferred.x, a.y - preferred.y) -
      Math.hypot(b.x - preferred.x, b.y - preferred.y)
  );
  let failure: CameraPlanProofResult = {
    status: 'conflict',
    reason: 'unproven',
    time: zone.start,
  };
  for (const pan of candidates) {
    failure = proveWorkingZoneSpans(input, [
      { kind: 'hold', pan, start: zone.start, end: zone.end, segmentId: zone.segmentId },
    ]);
    if (failure.status === 'proven') return { pan, proof: failure };
  }
  return { pan: undefined, proof: failure };
}

function fitCameraZonePrefix(
  input: WorkingZoneCameraInput,
  preferences: readonly FollowCursorFrame[],
  zone: CameraWorkingZone
) {
  let low = zone.first,
    high = zone.last - 1;
  let prefix: { zone: CameraWorkingZone; pan: CameraPanPoint } | undefined;
  while (low <= high) {
    const last = Math.floor((low + high) / 2);
    const candidate = createCameraWorkingZone(preferences, zone.first, last);
    const fit = fitCameraZone(input, candidate, preferences);
    if (fit.pan) {
      prefix = { zone: candidate, pan: fit.pan };
      low = last + 1;
    } else high = last - 1;
  }
  return prefix;
}

function fitWorkingCameraZones(
  input: WorkingZoneCameraInput,
  preferences: readonly FollowCursorFrame[],
  fallback: CameraPanPoint
): PlannedCameraZone[] | Extract<WorkingZoneCameraPlan, { status: 'conflict' }> {
  const policy = input.policy;
  const pending = groupCameraWorkingZones(
    preferences,
    input.geometry.viewport,
    policy.settings.zoneSize
  );
  const zones: PlannedCameraZone[] = [];
  while (pending.length) {
    let zone = pending.shift()!;
    let fitted = fitCameraZone(input, zone, preferences);
    if (!fitted.pan && zone.first < zone.last) {
      const prefix = fitCameraZonePrefix(input, preferences, zone);
      if (prefix) {
        pending.unshift(createCameraWorkingZone(preferences, prefix.zone.last + 1, zone.last));
        zone = prefix.zone;
        fitted = { pan: prefix.pan, proof: { status: 'proven' } };
      }
    }
    if (fitted.pan) {
      const previous = zones.at(-1);
      const shortVisit =
        Math.min(zone.end - zone.start, previous ? previous.end - previous.start : Infinity) <
        policy.settings.minimumHoldDuration;
      if (previous?.segmentId === zone.segmentId && shortVisit) {
        const merged = mergeCameraWorkingZones(previous, zone, preferences);
        const fit = fitCameraZone(input, merged, preferences);
        if (fit.pan) {
          zones[zones.length - 1] = { ...merged, pan: fit.pan };
          continue;
        }
      }
      zones.push({ ...zone, pan: fitted.pan });
      continue;
    }
    return {
      status: 'conflict',
      reason: fitted.proof.status === 'conflict' ? fitted.proof.reason : 'unproven',
      interval: { start: input.start, end: input.end },
      time: zone.start,
      fallback,
    };
  }
  return zones;
}

function prepareCameraTransitions(
  input: WorkingZoneCameraInput,
  zones: readonly PlannedCameraZone[]
) {
  const { geometry, policy } = input;
  return zones.slice(1).map((zone, index) => {
    const previous = zones[index]!;
    if (
      zone.segmentId !== previous.segmentId ||
      Math.hypot(zone.pan.x - previous.pan.x, zone.pan.y - previous.pan.y) < 1e-8
    )
      return null;
    const distance = Math.hypot(zone.pan.x - previous.pan.x, zone.pan.y - previous.pan.y);
    const boundary = (previous.end + zone.start) / 2;
    const limits = geometry.motionLimits(
      Math.max(input.start, boundary - policy.settings.transitionDuration / 2),
      Math.min(input.end, boundary + policy.settings.transitionDuration / 2),
      input.targetScale
    );
    const duration = Math.max(
      policy.settings.transitionDuration,
      (1.875 * distance) / limits.speed,
      Math.sqrt((((10 * Math.sqrt(3)) / 3) * distance) / limits.acceleration),
      Math.cbrt((60 * distance) / limits.jerk)
    );
    return { boundary, duration, previous, zone };
  });
}

function buildCameraZoneSpans(
  input: WorkingZoneCameraInput,
  zones: readonly PlannedCameraZone[],
  transitions: ReturnType<typeof prepareCameraTransitions>,
  factor: number,
  anticipation: number
) {
  const spans: CameraPlanSpan[] = [];
  let cursor = input.start;
  let invalid = false;
  for (let index = 0; index < zones.length; index++) {
    const zone = zones[index]!;
    const next = zones[index + 1];
    const transition = transitions[index];
    if (transition) {
      const duration = transition.duration * factor;
      const start = Math.max(input.start, transition.boundary - duration * anticipation);
      const end = start + duration;
      const nextBoundary =
        next && zones[index + 2]?.segmentId === next.segmentId
          ? (next.end + zones[index + 2]!.start) / 2
          : input.end;
      if (start < cursor || end > nextBoundary || end > input.end) {
        invalid = true;
        break;
      }
      if (start > cursor)
        spans.push({
          kind: 'hold',
          start: cursor,
          end: start,
          segmentId: zone.segmentId,
          pan: zone.pan,
        });
      spans.push({
        kind: 'transition',
        start,
        end,
        segmentId: zone.segmentId,
        trajectory: createCameraTrajectory({
          start,
          end,
          from: zone.pan,
          to: transition.zone.pan,
        }),
      });
      cursor = end;
    } else {
      const end = next
        ? next.segmentId === zone.segmentId
          ? (zone.end + next.start) / 2
          : next.start
        : input.end;
      if (end > cursor || spans.length === 0)
        spans.push({
          kind: 'hold',
          start: cursor,
          end,
          segmentId: zone.segmentId,
          pan: zone.pan,
        });
      cursor = end;
    }
  }
  if (invalid) return undefined;
  return spans;
}

function scheduleCameraZones(
  input: WorkingZoneCameraInput,
  zones: readonly PlannedCameraZone[],
  discontinuities: Extract<WorkingZoneCameraPlan, { status: 'ready' }>['discontinuities']
): WorkingZoneCameraPlan {
  const transitions = prepareCameraTransitions(input, zones);
  // Each attempt advances and lengthens the transition inside the authored interval before refusing it.
  let lastFailure: CameraPlanProofResult = {
    status: 'conflict',
    reason: 'unproven',
    time: input.start,
  };
  for (const factor of [1, 1.5, 2, 3]) {
    for (const anticipation of [0.5, 0.75, 1]) {
      const spans = buildCameraZoneSpans(input, zones, transitions, factor, anticipation);
      if (!spans) continue;
      lastFailure = proveWorkingZoneSpans(input, spans);
      if (lastFailure.status === 'proven') {
        const result = admitCameraBoundaries(input, spans, discontinuities, zones[0]!.pan);
        if (result.status === 'ready') return result;
        lastFailure = { status: 'conflict', reason: result.reason, time: result.time };
      }
    }
  }
  return {
    status: 'conflict',
    reason: lastFailure.status === 'conflict' ? lastFailure.reason : 'unproven',
    interval: { start: input.start, end: input.end },
    time: lastFailure.status === 'conflict' ? lastFailure.time : input.start,
    fallback: zones[0]!.pan,
  };
}

function planWorkingZoneCameraAtScale(input: WorkingZoneCameraInput): WorkingZoneCameraPlan {
  validateCameraInput(input);
  const { geometry, frames } = input;
  const domain = geometry.panDomain(input.targetScale);
  const fallback = legalPan(input.fallback ?? { x: 0, y: 0 }, domain);
  const discontinuities: { time: number; reason: 'source' | 'nominal' }[] = [
    ...(geometry.discontinuities?.(input.targetScale) ?? [])
      .filter(
        (time) =>
          time >= input.start &&
          time <= input.end &&
          !(time === input.start && input.incoming) &&
          !(time === input.end && input.outgoing)
      )
      .map((time) => ({ time, reason: 'nominal' as const })),
    ...frames
      .slice(1)
      .flatMap((frame, index) =>
        frame.segmentId === frames[index]!.segmentId
          ? []
          : [{ time: frame.time, reason: 'source' as const }]
      ),
  ].sort((a, b) => a.time - b.time);
  const boundaryFailure = illegalCameraBoundary(input, domain, fallback);
  if (boundaryFailure) return boundaryFailure;
  const preferences = frames.map((frame) => ({
    ...geometry.preferredPan(frame, input.targetScale),
    time: frame.time,
    segmentId: frame.segmentId,
    ...(frame.preferenceWeight !== undefined ? { preferenceWeight: frame.preferenceWeight } : {}),
  }));
  const zones = fitWorkingCameraZones(input, preferences, fallback);
  if (!Array.isArray(zones)) return zones;
  if (!zones.length)
    return admitCameraBoundaries(
      input,
      [{ kind: 'hold', pan: fallback, start: input.start, end: input.end, segmentId: '' }],
      discontinuities,
      fallback
    );
  return scheduleCameraZones(input, zones, discontinuities);
}

/** Seek, preview, and export evaluate the same pre-admitted spans without further containment changes. */
export function evaluateWorkingZoneCamera(
  plan: WorkingZoneCameraPlan,
  time: number
): CameraPanPoint {
  if (plan.status === 'conflict') return { ...plan.fallback };
  const span = plan.spans.findLast((item) => item.start <= time) ?? plan.spans[0];
  return span ? evaluateCameraPlanSpan(span, time) : { x: 0, y: 0 };
}

export interface FollowCursorFrame extends CursorFocusPoint {
  time: number;
  preferenceWeight?: number;
  /** Confirmed captured or renderer-owned pointer position; missing coverage adds no fabricated constraint. */
  actual?: CursorFocusPoint;
  segmentId: string;
}
