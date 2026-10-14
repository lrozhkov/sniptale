import { describe, expect, it } from 'vitest';
import { cameraTrajectoryBounds, createCameraTrajectory } from './camera-trajectory';
import { evaluateCameraPlanSpan, proveCameraPlan } from './camera-plan-proof';
import type { CameraPlanSpan, CameraProofGeometry } from './camera-plan-proof';

const geometry: CameraProofGeometry = {
  breaks: [],
  clearanceBounds({ pan, actual, targetScale }) {
    const pose = Math.min(
      pan.minX,
      pan.minY,
      1000 * (targetScale - 1) - pan.maxX,
      600 * (targetScale - 1) - pan.maxY
    );
    const viewport = actual
      ? Math.min(
          Math.min(actual.from.x, actual.to.x) * targetScale - pan.maxX,
          1000 - Math.max(actual.from.x, actual.to.x) * targetScale + pan.minX,
          Math.min(actual.from.y, actual.to.y) * targetScale - pan.maxY,
          600 - Math.max(actual.from.y, actual.to.y) * targetScale + pan.minY
        )
      : undefined;
    return {
      pose: { low: pose, high: pose },
      denominator: { low: 1, high: 1 },
      ...(actual ? { raster: { low: 1, high: 1 } } : {}),
      ...(viewport === undefined
        ? {}
        : { viewport: { low: viewport, high: Math.max(1000, viewport) } }),
    };
  },
  motionBounds({ trajectory, start, end }) {
    if (!trajectory) return { speed: 0, acceleration: 0, jerk: 0 };
    const normBound = (order: 1 | 2 | 3) => {
      const bounds = cameraTrajectoryBounds(trajectory, start, end, order);
      return Math.hypot(
        Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX)),
        Math.max(Math.abs(bounds.minY), Math.abs(bounds.maxY))
      );
    };
    return { speed: normBound(1), acceleration: normBound(2), jerk: normBound(3) };
  },
};

const limits = { speed: 1e9, acceleration: 1e9, jerk: 1e9 };
const hold: CameraPlanSpan = {
  kind: 'hold',
  pan: { x: 500, y: 300 },
  start: 0,
  end: 1,
  segmentId: 'source',
};

describe('continuous camera admission', () => {
  it('bounds observation lookup work for a dense captured path', () => {
    let reads = 0;
    const observations = Array.from({ length: 512 }, (_, index) => ({
      get time() {
        reads++;
        return index / 511;
      },
      segmentId: 'source',
      actual: { x: 300 + index / 512, y: 200 },
    }));
    expect(
      proveCameraPlan({
        spans: [hold],
        observations,
        geometry,
        targetScale: 2,
        preservePointer: true,
        limits,
      })
    ).toEqual({ status: 'proven' });
    // The generous operation budget rejects repeated full scans without a wall-clock threshold.
    expect(reads).toBeLessThan(512 * 100);
  });

  it.each([
    [0, 0.5, 0.5, 1],
    [0.5, 1, 0, 0.5],
  ])('preserves first/last neighbors for observation times %j', (...times) => {
    const observations = times.map((time, index) => ({
      time,
      segmentId: 'source',
      actual: { x: 300 + index, y: 200 },
    }));
    let checked = 0;
    expect(
      proveCameraPlan({
        spans: [hold],
        observations,
        targetScale: 2,
        preservePointer: true,
        limits,
        geometry: {
          ...geometry,
          clearanceBounds(input) {
            const left = observations.findLast(({ time }) => time <= input.start);
            const right = observations.find(({ time }) => time >= input.end);
            if (left && right) {
              const at = (time: number) => {
                const progress =
                  right.time > left.time ? (time - left.time) / (right.time - left.time) : 0;
                return { x: left.actual.x + (right.actual.x - left.actual.x) * progress, y: 200 };
              };
              expect(input.actual).toEqual({ from: at(input.start), to: at(input.end) });
            } else expect(input.actual).toBeUndefined();
            checked++;
            return geometry.clearanceBounds(input);
          },
        },
      })
    ).toEqual({ status: 'proven' });
    expect(checked).toBeGreaterThan(0);
  });

  it('admits a held pose with a continuously contained native pointer', () => {
    expect(
      proveCameraPlan({
        spans: [hold],
        observations: [
          { time: 0, segmentId: 'source', actual: { x: 300, y: 200 } },
          { time: 1, segmentId: 'source', actual: { x: 600, y: 300 } },
        ],
        geometry,
        targetScale: 2,
        preservePointer: true,
        limits,
      })
    ).toEqual({ status: 'proven' });
  });

  it('rejects an interior pan extremum even when both endpoint poses are valid', () => {
    const trajectory = createCameraTrajectory({
      start: 0,
      end: 1,
      from: { x: 100, y: 300 },
      to: { x: 100, y: 300 },
      fromVelocity: { x: 10000, y: 0 },
      toVelocity: { x: 10000, y: 0 },
    });
    expect(
      proveCameraPlan({
        spans: [{ ...hold, kind: 'transition', trajectory }],
        observations: [],
        geometry,
        targetScale: 2,
        preservePointer: true,
        limits,
      }).status
    ).toBe('conflict');
  });

  it('does not fabricate missing observations, but retains isolated confirmed points', () => {
    const observations = [
      { time: 0, segmentId: 'source' },
      { time: 0.5, segmentId: 'source', actual: { x: 900, y: 300 } },
      { time: 1, segmentId: 'source' },
    ];
    expect(
      proveCameraPlan({
        spans: [hold],
        observations: [],
        geometry,
        targetScale: 2,
        preservePointer: true,
        limits,
      }).status
    ).toBe('proven');
    expect(
      proveCameraPlan({
        spans: [hold],
        observations,
        geometry,
        targetScale: 2,
        preservePointer: true,
        limits,
      }).status
    ).toBe('conflict');
  });

  it('returns a conflict when geometry cannot establish continuous bounds', () => {
    expect(
      proveCameraPlan({
        spans: [hold],
        observations: [],
        geometry: { ...geometry, clearanceBounds: () => null },
        targetScale: 2,
        preservePointer: true,
        limits,
        maximumCells: 8,
      })
    ).toMatchObject({ status: 'conflict', reason: 'unproven' });
  });

  it('checks screen dynamics and never changes an admitted pose during random access', () => {
    const trajectory = createCameraTrajectory({
      start: 0,
      end: 1,
      from: { x: 100, y: 100 },
      to: { x: 800, y: 100 },
    });
    const span: CameraPlanSpan = { ...hold, kind: 'transition', trajectory };
    expect(
      proveCameraPlan({
        spans: [span],
        observations: [],
        geometry,
        targetScale: 2,
        preservePointer: false,
        limits: { speed: 10, acceleration: 10, jerk: 10 },
        maximumCells: 200,
      }).status
    ).toBe('conflict');
    const middle = evaluateCameraPlanSpan(span, 0.5);
    evaluateCameraPlanSpan(span, 0.9);
    expect(evaluateCameraPlanSpan(span, 0.5)).toEqual(middle);
    expect(middle.x).toBeCloseTo(450);
  });
});
