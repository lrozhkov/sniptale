import type { CameraPanBounds, CameraPanPoint, CameraTrajectory } from './camera-trajectory';
import { cameraTrajectoryBounds, evaluateCameraTrajectory } from './camera-trajectory';

export type CameraPlanSpan = {
  start: number;
  end: number;
  segmentId: string;
} & ({ kind: 'hold'; pan: CameraPanPoint } | { kind: 'transition'; trajectory: CameraTrajectory });

interface CameraActualObservation {
  time: number;
  segmentId: string;
  actual?: CameraPanPoint;
}

/** Bounds include every value in the interval. Missing bounds cannot establish admission. */
interface CameraClearanceRange {
  low: number;
  high: number;
}

export interface CameraProjectionProof {
  pose: CameraClearanceRange;
  raster?: CameraClearanceRange;
  viewport?: CameraClearanceRange;
  denominator: CameraClearanceRange;
}

/** The renderer owns source projection, clipping, nominal zoom phases, and physical screen motion. */
export interface CameraProofGeometry {
  breaks: readonly number[];
  clearanceBounds(input: {
    start: number;
    end: number;
    segmentId: string;
    pan: CameraPanBounds;
    actual?: { from: CameraPanPoint; to: CameraPanPoint };
    targetScale: number;
    preservePointer?: boolean;
  }): CameraProjectionProof | null;
  motionBounds(input: {
    start: number;
    end: number;
    trajectory?: CameraTrajectory;
    pan: CameraPanBounds;
    targetScale: number;
  }): { speed: number; acceleration: number; jerk: number } | null;
}

type CameraProofConflictReason =
  | 'pose'
  | 'raster'
  | 'viewport'
  | 'projection'
  | 'dynamics'
  | 'unproven';

export type CameraPlanProofResult =
  | { status: 'proven' }
  | {
      status: 'conflict';
      reason: CameraProofConflictReason;
      time: number;
    };

/** Evaluate the disposable plan without late clamps, source reads, or playback state. */
export function evaluateCameraPlanSpan(span: CameraPlanSpan, time: number): CameraPanPoint {
  return span.kind === 'hold' ? { ...span.pan } : evaluateCameraTrajectory(span.trajectory, time);
}

function panBounds(span: CameraPlanSpan, start: number, end: number): CameraPanBounds {
  if (span.kind === 'transition') return cameraTrajectoryBounds(span.trajectory, start, end);
  return { minX: span.pan.x, maxX: span.pan.x, minY: span.pan.y, maxY: span.pan.y };
}

function actualInterval(
  a: CameraActualObservation | undefined,
  b: CameraActualObservation | undefined,
  start: number,
  end: number
) {
  if (!a?.actual || !b?.actual || a.segmentId !== b.segmentId) return undefined;
  const fromPoint = a.actual;
  const toPoint = b.actual;
  const duration = b.time - a.time;
  const at = (time: number) => {
    const progress = duration > 0 ? (time - a.time) / duration : 0;
    return {
      x: fromPoint.x + (toPoint.x - fromPoint.x) * progress,
      y: fromPoint.y + (toPoint.y - fromPoint.y) * progress,
    };
  };
  return { from: at(start), to: at(end) };
}

function compactObservationHolds(observations: readonly CameraActualObservation[]) {
  const same = (a: CameraActualObservation, b: CameraActualObservation) =>
    a.segmentId === b.segmentId && a.actual?.x === b.actual?.x && a.actual?.y === b.actual?.y;
  return observations.filter(
    (point, index) =>
      index === 0 ||
      index === observations.length - 1 ||
      !same(observations[index - 1]!, point) ||
      !same(point, observations[index + 1]!)
  );
}

/** Prove every covered interval with conservative hulls; subdivision exhaustion is a typed conflict. */
interface CameraPlanProofInput {
  spans: readonly CameraPlanSpan[];
  observations: readonly CameraActualObservation[];
  geometry: CameraProofGeometry;
  targetScale: number;
  preservePointer: boolean;
  limits: { speed: number; acceleration: number; jerk: number };
  limitsAt?: (start: number, end: number) => { speed: number; acceleration: number; jerk: number };
  pixelTolerance?: number;
  maximumCells?: number;
}

function classifyProjection(
  input: CameraPlanProofInput,
  bounds: CameraProjectionProof | null,
  actual: ReturnType<typeof actualInterval>,
  tolerance: number
): { proven: boolean; reason?: CameraProofConflictReason } {
  const constraints: {
    reason: CameraProofConflictReason;
    range: CameraClearanceRange;
    tolerance: number;
  }[] = [];
  if (bounds) {
    constraints.push({ reason: 'pose', range: bounds.pose, tolerance: 1e-8 });
    constraints.push({ reason: 'projection', range: bounds.denominator, tolerance: -1e-9 });
    if (input.preservePointer) {
      if (bounds.raster) constraints.push({ reason: 'raster', range: bounds.raster, tolerance });
      if (bounds.viewport)
        constraints.push({ reason: 'viewport', range: bounds.viewport, tolerance });
    }
  }
  const violated = constraints.find(
    ({ range, tolerance: allowed }) => Number.isFinite(range.high) && range.high < -allowed
  );
  if (violated) return { proven: false, reason: violated.reason };
  const pointerRequired =
    input.preservePointer &&
    (actual !== undefined || bounds?.raster !== undefined || bounds?.viewport !== undefined);
  const proven =
    bounds !== null &&
    constraints.every(
      ({ range, tolerance: allowed }) =>
        Number.isFinite(range.low) &&
        Number.isFinite(range.high) &&
        range.low <= range.high &&
        range.low >= -allowed
    ) &&
    (!pointerRequired || (bounds.raster !== undefined && bounds.viewport !== undefined));
  return { proven };
}

function cameraProofCells(
  span: CameraPlanSpan,
  observations: readonly CameraActualObservation[],
  breaks: readonly number[]
) {
  const boundaries = [
    ...new Set([
      span.start,
      span.end,
      ...breaks.filter((time) => time > span.start && time < span.end),
      ...observations
        .filter(({ time }) => time > span.start && time < span.end)
        .map(({ time }) => time),
    ]),
  ].sort((a, b) => a - b);
  const intervals =
    boundaries.length === 1
      ? [{ start: span.start, end: span.end, depth: 0 }]
      : boundaries
          .slice(0, -1)
          .map((start, index) => ({ start, end: boundaries[index + 1]!, depth: 0 }));
  for (const observation of observations) {
    if (observation.actual && observation.time >= span.start && observation.time <= span.end)
      intervals.push({ start: observation.time, end: observation.time, depth: 0 });
  }
  return intervals;
}

export function proveCameraPlan(input: CameraPlanProofInput): CameraPlanProofResult {
  const tolerance = input.pixelTolerance ?? 0.5;
  const confirmed = compactObservationHolds(input.observations);
  let remaining =
    input.maximumCells ??
    Math.max(4096, 16 * (confirmed.length + input.spans.length + input.geometry.breaks.length));
  for (const span of input.spans) {
    const observations = confirmed.filter((item) => item.segmentId === span.segmentId);
    const intervals = cameraProofCells(span, observations, input.geometry.breaks);
    while (intervals.length) {
      const cell = intervals.pop()!;
      if (--remaining < 0) return { status: 'conflict', reason: 'unproven', time: cell.start };
      const left = observations.findLast(({ time }) => time <= cell.start);
      const right = observations.find(({ time }) => time >= cell.end);
      const actual = actualInterval(left, right, cell.start, cell.end);
      const bounds = input.geometry.clearanceBounds({
        start: cell.start,
        end: cell.end,
        segmentId: span.segmentId,
        pan: panBounds(span, cell.start, cell.end),
        ...(input.preservePointer && actual ? { actual } : {}),
        targetScale: input.targetScale,
        preservePointer: input.preservePointer,
      });
      const projection = classifyProjection(input, bounds, actual, tolerance);
      if (projection.reason)
        return { status: 'conflict', reason: projection.reason, time: cell.start };
      const projectionProven = projection.proven;
      const dynamics = input.geometry.motionBounds({
        start: cell.start,
        end: cell.end,
        ...(span.kind === 'transition' ? { trajectory: span.trajectory } : {}),
        pan: panBounds(span, cell.start, cell.end),
        targetScale: input.targetScale,
      });
      const limits = input.limitsAt?.(cell.start, cell.end) ?? input.limits;
      const dynamicsProven =
        dynamics !== null &&
        (['speed', 'acceleration', 'jerk'] as const).every(
          (key) => Number.isFinite(dynamics[key]) && dynamics[key] <= limits[key] * (1 + 1e-6)
        );
      if (projectionProven && dynamicsProven) continue;
      if (cell.depth >= 16 || cell.start === cell.end)
        return {
          status: 'conflict',
          reason: projectionProven ? 'dynamics' : 'unproven',
          time: cell.start,
        };
      const middle = (cell.start + cell.end) / 2;
      intervals.push(
        { start: cell.start, end: middle, depth: cell.depth + 1 },
        { start: middle, end: cell.end, depth: cell.depth + 1 }
      );
    }
  }
  return { status: 'proven' };
}
