import { expect, it } from 'vitest';
import { createCursorResponse, compileCursorResponse } from './cursor-response';
import { evaluateCameraTrajectory, evaluateCameraTrajectoryDerivative } from './camera-trajectory';

it('fits the analytic critically damped ramp with position, velocity and acceleration endpoint jets', () => {
  const omega = 5,
    slope = 20;
  const spans = compileCursorResponse(
    createCursorResponse(
      [
        { time: 0, x: 0, y: 0 },
        { time: 2, x: 40, y: 0 },
      ],
      omega
    ),
    0,
    1.5
  );
  expect(spans.length).toBeLessThan(12);
  for (let index = 0; index <= 300; index++) {
    const time = index / 200,
      t = time + 0.25,
      decay = Math.exp(-omega * t);
    const exact = slope * (t - 2 / omega + (t + 2 / omega) * decay);
    const velocity = slope * (1 - (1 + omega * t) * decay);
    const span = spans.findLast((span) => span.start <= time)!;
    expect(Math.abs(evaluateCameraTrajectory(span, time).x - exact)).toBeLessThanOrEqual(0.05);
    expect(
      Math.abs(evaluateCameraTrajectoryDerivative(span, time, 1).x - velocity)
    ).toBeLessThanOrEqual(0.2);
  }
  for (let index = 1; index < spans.length; index++)
    for (const order of [1, 2] as const)
      expect(
        evaluateCameraTrajectoryDerivative(spans[index - 1]!, spans[index]!.start, order).x
      ).toBeCloseTo(
        evaluateCameraTrajectoryDerivative(spans[index]!, spans[index]!.start, order).x,
        8
      );
});

it('keeps anticipation inside a capture run and resets history at the exact next run', () => {
  const response = createCursorResponse(
    [
      { time: 0, x: 10, y: -4, segmentId: 'a' },
      { time: 1, x: 10, y: -4, segmentId: 'a' },
      { time: 1, x: -20, y: 8, segmentId: 'b' },
      { time: 2, x: -20, y: 8, segmentId: 'b' },
    ],
    5
  );
  const spans = compileCursorResponse(response, 0, 2);
  const at = (time: number) =>
    evaluateCameraTrajectory(
      spans.findLast((span) => span.start <= time)!,
      time
    );
  expect(at(0.99)).toEqual({ x: 10, y: -4 });
  expect(at(1)).toEqual({ x: -20, y: 8 });
  expect(at(2)).toEqual({ x: -20, y: 8 });
  expect(spans).toHaveLength(2);
});

it('preserves a fast reversal with sparse quintics and settles at the held target', () => {
  const observations = [
    { time: 0, x: 0, y: 0 },
    { time: 0.2, x: 22, y: -12 },
    { time: 0.4, x: -22, y: 12 },
    { time: 6, x: -22, y: 12 },
  ];
  const spans = compileCursorResponse(createCursorResponse(observations, 5), 0, 6);
  expect(spans.length).toBeLessThan(30);
  const at = (time: number) =>
    evaluateCameraTrajectory(
      spans.findLast((span) => span.start <= time)!,
      time
    );
  expect(at(0.1).x).toBeGreaterThan(at(0).x);
  expect(at(0.8).x).toBeLessThan(0);
  expect(at(6).x).toBeCloseTo(-22, 5);
  expect(at(6).y).toBeCloseTo(12, 5);
  const chronological = [0, 0.1, 0.2, 0.4, 1, 6].map(at);
  expect([6, 1, 0.4, 0.2, 0.1, 0].map(at)).toEqual(chronological.toReversed());
});

it('ignores malformed observations without producing NaN polynomials', () => {
  expect(compileCursorResponse(createCursorResponse([{ time: NaN, x: 1, y: 1 }], 5), 0, 1)).toEqual(
    []
  );
  const spans = compileCursorResponse(
    createCursorResponse(
      [
        { time: 0, x: 3, y: 4 },
        { time: 1, x: Infinity, y: 4 },
      ],
      5
    ),
    0,
    1
  );
  expect(evaluateCameraTrajectory(spans[0]!, 0.5)).toEqual({ x: 3, y: 4 });
});
