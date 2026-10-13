import type { CursorFocusPoint } from '../../project/cursor-focus-path/types';

export interface FollowCursorFrame extends CursorFocusPoint {
  time: number;
  /** Trusted captured position; absent coverage cannot impose a fabricated constraint. */
  actual?: CursorFocusPoint;
  segmentId: string;
}

interface FollowCursorPose extends CursorFocusPoint {
  time: number;
  segmentId: string;
  constrained: boolean;
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

function contain(center: number, actual: number | undefined, half: number) {
  const low = actual === undefined ? half : Math.max(half, actual - half);
  const high = actual === undefined ? 1 - half : Math.min(1 - half, actual + half);
  return clamp(center, low, high);
}

/** Output-time planner. Safe margins yield to source edges and actual pointer containment. */
export function planFollowCursorCamera(
  frames: readonly FollowCursorFrame[],
  scale: number,
  sensitivity: number
): FollowCursorPose[] {
  const half = 0.5 / Math.max(1, scale);
  const margin = half * (0.55 + 0.25 * (1 - sensitivity));
  const finishMargin = margin * 0.65;
  const output: FollowCursorPose[] = [];
  let center: CursorFocusPoint = { x: 0.5, y: 0.5 };
  let velocity: CursorFocusPoint = { x: 0, y: 0 };
  let moving = false;
  let previous: FollowCursorFrame | undefined;
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index]!;
    const boundary = previous?.segmentId !== frame.segmentId;
    if (boundary) {
      velocity = { x: 0, y: 0 };
      moving = false;
    }
    const future =
      frames
        .slice(index + 1, index + 7)
        .find((item) => item.segmentId === frame.segmentId && item.time >= frame.time + 0.12) ??
      frame;
    const dx = future.x - center.x;
    const dy = future.y - center.y;
    if (Math.abs(dx) > margin || Math.abs(dy) > margin) moving = true;
    else if (Math.abs(dx) < finishMargin && Math.abs(dy) < finishMargin) moving = false;
    const dt = previous ? Math.max(0, frame.time - previous.time) : 0;
    if (moving && dt > 0) {
      const maxSpeed = 0.8 + sensitivity * 1.2;
      const acceleration = 4;
      const target = {
        x: center.x + Math.sign(dx) * Math.max(0, Math.abs(dx) - finishMargin),
        y: center.y + Math.sign(dy) * Math.max(0, Math.abs(dy) - finishMargin),
      };
      const response = 1 - Math.exp(-dt * 8);
      for (const axis of ['x', 'y'] as const) {
        const desired = clamp(((target[axis] - center[axis]) * response) / dt, -maxSpeed, maxSpeed);
        velocity[axis] += clamp(desired - velocity[axis], -acceleration * dt, acceleration * dt);
        center[axis] += velocity[axis] * dt;
      }
    }
    const bounded = {
      x: contain(center.x, frame.actual?.x, half),
      y: contain(center.y, frame.actual?.y, half),
    };
    const constrained = bounded.x !== center.x || bounded.y !== center.y;
    center = bounded;
    output.push({ ...center, time: frame.time, segmentId: frame.segmentId, constrained });
    previous = frame;
  }
  return output;
}

/** Random access never depends on prior playback calls. */
export function evaluateFollowCursorCamera(
  plan: readonly FollowCursorPose[],
  time: number,
  actual: CursorFocusPoint | undefined,
  scale: number
): FollowCursorPose | null {
  let previous: FollowCursorPose | undefined;
  let next: FollowCursorPose | undefined;
  for (const pose of plan) {
    if (pose.time <= time) previous = pose;
    else {
      next = pose;
      break;
    }
  }
  if (!previous) return null;
  const progress =
    next && next.segmentId === previous.segmentId
      ? clamp((time - previous.time) / (next.time - previous.time), 0, 1)
      : 0;
  const x = previous.x + ((next?.x ?? previous.x) - previous.x) * progress;
  const y = previous.y + ((next?.y ?? previous.y) - previous.y) * progress;
  const half = 0.5 / Math.max(1, scale);
  const boundedX = contain(x, actual?.x, half);
  const boundedY = contain(y, actual?.y, half);
  return {
    ...previous,
    time,
    x: boundedX,
    y: boundedY,
    constrained: boundedX !== x || boundedY !== y || previous.constrained,
  };
}
