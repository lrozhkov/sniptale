import type { CameraPanBounds, CameraPanPoint } from './camera-trajectory';
import type { CameraPlanSpan } from './camera-plan-proof';

interface PanObservation extends CameraPanPoint {
  time: number;
  segmentId: string;
  preferenceWeight?: number;
}

function bounded(point: CameraPanPoint, domain: CameraPanBounds): CameraPanPoint {
  return {
    x: Math.max(domain.minX, Math.min(domain.maxX, point.x)),
    y: Math.max(domain.minY, Math.min(domain.maxY, point.y)),
  };
}

function sample(points: readonly PanObservation[], time: number, domain: CameraPanBounds) {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle]!.time < time) low = middle + 1;
    else high = middle;
  }
  const right = points[Math.min(low, points.length - 1)]!;
  const left = points[Math.max(0, low - 1)]!;
  const progress =
    right.time > left.time
      ? Math.max(0, Math.min(1, (time - left.time) / (right.time - left.time)))
      : 0;
  const leftWeight = left.preferenceWeight ?? 1;
  const rightWeight = right.preferenceWeight ?? 1;
  const fraction =
    (progress * rightWeight) / ((1 - progress) * leftWeight + progress * rightWeight);
  return bounded(
    {
      x: left.x + (right.x - left.x) * fraction,
      y: left.y + (right.y - left.y) * fraction,
    },
    domain
  );
}

function blend(a: CameraPanPoint, b: CameraPanPoint, c: CameraPanPoint) {
  return { x: (a.x + 4 * b.x + c.x) / 6, y: (a.y + 4 * b.y + c.y) / 6 };
}

function trackingRun(
  points: readonly PanObservation[],
  start: number,
  end: number,
  step: number,
  domain: CameraPanBounds
): CameraPlanSpan[] {
  const first = sample(points, start, domain);
  const last = sample(points, end, domain);
  const segmentId = points[0]!.segmentId;
  if (
    end <= start ||
    points.every((point) => {
      const pan = bounded(point, domain);
      return pan.x === first.x && pan.y === first.y;
    })
  )
    return [{ kind: 'hold', start, end, pan: first, segmentId }];
  const hold = Math.min(step, (end - start) / 5);
  const low = start + hold;
  const high = end - hold;
  const count = Math.max(3, Math.ceil((high - low) / step));
  const duration = (high - low) / count;
  const controls = Array.from({ length: count + 3 }, (_, index) =>
    index < 3 ? first : index >= count ? last : sample(points, low + (index - 1) * duration, domain)
  );
  const spans: CameraPlanSpan[] = [{ kind: 'hold', start, end: low, pan: first, segmentId }];
  for (let index = 0; index < count; index++) {
    const a = controls[index]!;
    const b = controls[index + 1]!;
    const c = controls[index + 2]!;
    const d = controls[index + 3]!;
    const spanStart = low + index * duration;
    const spanEnd = index === count - 1 ? high : low + (index + 1) * duration;
    // A uniform cubic B-spline is C2. Its Bezier controls are convex combinations
    // of legal targets, so its complete path stays inside the legal pan domain.
    spans.push({
      kind: 'transition',
      start: spanStart,
      end: spanEnd,
      segmentId,
      trajectory: {
        start: spanStart,
        end: spanEnd,
        controls: [
          blend(a, b, c),
          { x: (2 * b.x + c.x) / 3, y: (2 * b.y + c.y) / 3 },
          { x: (b.x + 2 * c.x) / 3, y: (b.y + 2 * c.y) / 3 },
          blend(b, c, d),
        ],
      },
    });
  }
  spans.push({ kind: 'hold', start: high, end, pan: last, segmentId });
  return spans;
}

/** Compile bounded C2 follow curves; admission still proves actual pointer and screen dynamics. */
export function compileCursorPanTracking(input: {
  preferences: readonly PanObservation[];
  start: number;
  end: number;
  step: number;
  domain: CameraPanBounds;
}): CameraPlanSpan[] {
  if (
    !Number.isFinite(input.step) ||
    input.step <= 0 ||
    !Object.values(input.domain).every(Number.isFinite) ||
    input.domain.minX > input.domain.maxX ||
    input.domain.minY > input.domain.maxY
  )
    throw new Error('Cursor tracking requires a finite legal domain and positive time step.');
  const groups: PanObservation[][] = [];
  for (const point of input.preferences) {
    const group = groups.at(-1);
    if (!group || group[0]!.segmentId !== point.segmentId) groups.push([point]);
    else group.push(point);
  }
  return groups.flatMap((points, index) =>
    trackingRun(
      points,
      index === 0 ? input.start : points[0]!.time,
      groups[index + 1]?.[0]?.time ?? input.end,
      input.step,
      input.domain
    )
  );
}
