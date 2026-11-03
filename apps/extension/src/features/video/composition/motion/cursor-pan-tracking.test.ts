import { expect, it } from 'vitest';
import { compileCursorPanTracking } from './cursor-pan-tracking';
import { cameraTrajectoryBounds, evaluateCameraTrajectoryDerivative } from './camera-trajectory';
import { evaluateCameraPlanSpan } from './camera-plan-proof';

const domain = { minX: 0, maxX: 1000, minY: 0, maxY: 600 };

it('stays inside the full legal domain at fast reversals and remains C2 at every join', () => {
  const spans = compileCursorPanTracking({
    preferences: [0, 10, -20, 30, -40, 50, 0].map((x, time) => ({
      x: x * 100,
      y: 300 + x * 100,
      time,
      segmentId: 'source',
    })),
    start: 0,
    end: 6,
    step: 0.3,
    domain,
  });
  for (const [index, span] of spans.entries()) {
    if (span.kind === 'transition') {
      const bounds = cameraTrajectoryBounds(span.trajectory, span.start, span.end);
      expect(bounds.minX).toBeGreaterThanOrEqual(-1e-8);
      expect(bounds.maxX).toBeLessThanOrEqual(1000 + 1e-8);
      expect(bounds.minY).toBeGreaterThanOrEqual(-1e-8);
      expect(bounds.maxY).toBeLessThanOrEqual(600 + 1e-8);
    }
    const previous = spans[index - 1];
    if (!previous) continue;
    expect(span.start).toBe(previous.end);
    expect(evaluateCameraPlanSpan(span, span.start).x).toBeCloseTo(
      evaluateCameraPlanSpan(previous, previous.end).x,
      8
    );
    for (const order of [1, 2] as const) {
      const left =
        previous.kind === 'hold'
          ? { x: 0, y: 0 }
          : evaluateCameraTrajectoryDerivative(previous.trajectory, previous.end, order);
      const right =
        span.kind === 'hold'
          ? { x: 0, y: 0 }
          : evaluateCameraTrajectoryDerivative(span.trajectory, span.start, order);
      expect(right.x).toBeCloseTo(left.x, 7);
      expect(right.y).toBeCloseTo(left.y, 7);
    }
  }
});

it('never blends cursor histories across a source cut', () => {
  const spans = compileCursorPanTracking({
    preferences: [
      { time: 0, x: 100, y: 100, segmentId: 'before' },
      { time: 2, x: 200, y: 100, segmentId: 'before' },
      { time: 3, x: 800, y: 500, segmentId: 'after' },
      { time: 5, x: 900, y: 500, segmentId: 'after' },
    ],
    start: 0,
    end: 5,
    step: 0.3,
    domain,
  });
  expect(spans.filter((span) => span.start < 3).every((span) => span.end <= 3)).toBe(true);
  expect(
    evaluateCameraPlanSpan(
      spans.findLast((span) => span.end <= 3)!,
      3
    )
  ).toEqual({ x: 200, y: 100 });
  expect(
    evaluateCameraPlanSpan(
      spans.find((span) => span.start === 3)!,
      3
    )
  ).toEqual({ x: 800, y: 500 });
});

it('represents a full-frame view without fabricated pan motion', () => {
  const spans = compileCursorPanTracking({
    preferences: [
      { time: 0, x: -100, y: 300, segmentId: 'source' },
      { time: 5, x: 1000, y: 700, segmentId: 'source' },
    ],
    start: 0,
    end: 5,
    step: 0.3,
    domain: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
  });
  expect(spans).toEqual([
    { kind: 'hold', start: 0, end: 5, pan: { x: 0, y: 0 }, segmentId: 'source' },
  ]);
});

it('keeps authored focus more influential than an adjacent recorded preference', () => {
  const plan = (weight: number) =>
    compileCursorPanTracking({
      preferences: [
        { time: 0, x: 100, y: 300, segmentId: 'source' },
        { time: 3, x: 800, y: 300, segmentId: 'source', preferenceWeight: weight },
        { time: 6, x: 100, y: 300, segmentId: 'source' },
      ],
      start: 0,
      end: 6,
      step: 0.3,
      domain,
    });
  const at = (weight: number, time: number) => {
    const spans = plan(weight);
    return evaluateCameraPlanSpan(
      spans.findLast((span) => span.start <= time)!,
      time
    ).x;
  };
  expect(at(4, 2)).toBeGreaterThan(at(1, 2) + 100);
  expect(at(4, 4)).toBeGreaterThan(at(1, 4) + 100);
});

it('rejects an invalid geometry domain instead of generating a nonfinite path', () => {
  expect(() =>
    compileCursorPanTracking({
      preferences: [{ time: 0, x: 1, y: 2, segmentId: 'source' }],
      start: 0,
      end: 1,
      step: 0.3,
      domain: { ...domain, maxX: NaN },
    })
  ).toThrow('finite legal domain');
});
