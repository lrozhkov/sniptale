import { expect, it } from 'vitest';
import { planWorkingZoneCamera, evaluateWorkingZoneCamera } from './follow-cursor';
import type { WorkingZoneCameraGeometry } from './follow-cursor';
import { cameraTrajectoryBounds, evaluateCameraTrajectoryDerivative } from './camera-trajectory';
import {
  cameraFollowMotionLimits,
  createCameraFollowSettings,
  resolveCameraFollowPolicy,
} from '../../project/camera/cursor-policy';

const policy = resolveCameraFollowPolicy({ defaults: createCameraFollowSettings('fast') });
const geometry: WorkingZoneCameraGeometry = {
  viewport: { width: 1000, height: 600 },
  breaks: [],
  window: { width: 1000, height: 600 },
  preferredPan: (point, scale) => ({
    x: (point.x * scale - 0.5) * 1000,
    y: (point.y * scale - 0.5) * 600,
  }),
  panDomain: (scale) => ({ minX: 0, maxX: (scale - 1) * 1000, minY: 0, maxY: (scale - 1) * 600 }),
  motionLimits: (_start, _end, scale) =>
    cameraFollowMotionLimits(policy, {
      viewportWidth: 1000,
      viewportHeight: 600,
      windowWidth: 1000,
      windowHeight: 600,
      minimumScale: scale,
    }),
  clearanceBounds({ pan, actual, targetScale }) {
    const poseLow = Math.min(
      pan.minX,
      pan.minY,
      (targetScale - 1) * 1000 - pan.maxX,
      (targetScale - 1) * 600 - pan.maxY
    );
    const viewportLow = actual
      ? Math.min(
          Math.min(actual.from.x, actual.to.x) * targetScale * 1000 - pan.maxX,
          1000 - Math.max(actual.from.x, actual.to.x) * targetScale * 1000 + pan.minX,
          Math.min(actual.from.y, actual.to.y) * targetScale * 600 - pan.maxY,
          600 - Math.max(actual.from.y, actual.to.y) * targetScale * 600 + pan.minY
        )
      : 0;
    return {
      pose: { low: poseLow, high: Math.max(1000, poseLow) },
      denominator: { low: 1, high: 1 },
      ...(actual
        ? {
            raster: { low: 1, high: 1 },
            viewport: { low: viewportLow, high: Math.max(1000, viewportLow) },
          }
        : {}),
    };
  },
  motionBounds({ trajectory, start, end }) {
    if (!trajectory) return { speed: 0, acceleration: 0, jerk: 0 };
    const norm = (order: 1 | 2 | 3) => {
      const bounds = cameraTrajectoryBounds(trajectory, start, end, order);
      return Math.hypot(
        Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX)),
        Math.max(Math.abs(bounds.minY), Math.abs(bounds.maxY))
      );
    };
    return { speed: norm(1), acceleration: norm(2), jerk: norm(3) };
  },
};

it('chooses the activity-centered stable pose even when the previous center is also feasible', () => {
  const frames = Array.from({ length: 61 }, (_, index) => {
    const x = 0.57 + Math.sin((index * Math.PI) / 15) * 0.002;
    return { time: index / 30, x, y: 0.5, actual: { x, y: 0.5 }, segmentId: 'work' };
  });
  const plan = planWorkingZoneCamera({
    frames,
    start: 0,
    end: 2,
    targetScale: 1.2,
    policy,
    geometry,
  });
  expect(plan.status).toBe('ready');
  expect((evaluateWorkingZoneCamera(plan, 1).x / 1000 + 0.5) / 1.2).toBeCloseTo(0.57, 3);
  expect(evaluateWorkingZoneCamera(plan, 0)).toEqual(evaluateWorkingZoneCamera(plan, 2));
});

it('working-zone planner anticipates a new area with one continuous C2 transition', () => {
  const frames = [
    { time: 0, x: 0.3, y: 0.5, segmentId: 'one' },
    { time: 1, x: 0.3, y: 0.5, segmentId: 'one' },
    { time: 1.1, x: 0.8, y: 0.5, segmentId: 'one' },
    { time: 3, x: 0.8, y: 0.5, segmentId: 'one' },
  ];
  const plan = planWorkingZoneCamera({
    frames,
    start: 0,
    end: 3,
    targetScale: 2,
    policy,
    geometry,
  });
  expect(plan.status).toBe('ready');
  if (plan.status !== 'ready') return;
  const transitions = plan.spans.filter((span) => span.kind === 'transition');
  expect(transitions).toHaveLength(1);
  expect(transitions[0]!.start).toBeLessThan(1.1);
  expect(evaluateWorkingZoneCamera(plan, 0).x).toBeCloseTo(100);
  expect(evaluateWorkingZoneCamera(plan, 3).x).toBeCloseTo(1000);
});

it('working-zone planner exposes a typed conflict instead of clamping an impossible event', () => {
  const frames = [
    { time: 0, x: 0.1, y: 0.5, actual: { x: 0, y: 0.5 }, segmentId: 'one' },
    { time: 0.01, x: 0.9, y: 0.5, actual: { x: 1, y: 0.5 }, segmentId: 'one' },
  ];
  const plan = planWorkingZoneCamera({
    frames,
    start: 0,
    end: 0.01,
    targetScale: 4,
    policy: { ...policy, settings: { ...policy.settings, allowExpansion: false } },
    geometry,
  });
  expect(plan.status).toBe('conflict');
  expect(evaluateWorkingZoneCamera(plan, 0)).toEqual(evaluateWorkingZoneCamera(plan, 0.01));
});

it('working-zone planner expands only with explicit permission and within its scale bound', () => {
  const frames = [
    { time: 0, x: 0.1, y: 0.5, actual: { x: 0, y: 0.5 }, segmentId: 'one' },
    { time: 0.01, x: 0.9, y: 0.5, actual: { x: 1, y: 0.5 }, segmentId: 'one' },
  ];
  const expanded = planWorkingZoneCamera({
    frames,
    start: 0,
    end: 0.01,
    targetScale: 4,
    policy: { ...policy, settings: { ...policy.settings, allowExpansion: true, minimumScale: 1 } },
    geometry,
  });
  expect(expanded.status).toBe('ready');
  if (expanded.status === 'ready') expect(expanded.targetScale).toBe(1);
  const restricted = planWorkingZoneCamera({
    frames,
    start: 0,
    end: 0.01,
    targetScale: 4,
    policy: {
      ...policy,
      settings: { ...policy.settings, allowExpansion: true, minimumScale: 3.9 },
    },
    geometry,
  });
  expect(restricted.status).toBe('conflict');
});

it('working-zone planner chooses the dominant short-camera area from entry without a tail trip', () => {
  const frames = [
    { time: 0, x: 0.3, y: 0.5, segmentId: 'one' },
    { time: 0.05, x: 0.6, y: 0.5, segmentId: 'one' },
    { time: 0.95, x: 0.6, y: 0.5, segmentId: 'one' },
    { time: 1, x: 0.3, y: 0.5, segmentId: 'one' },
  ];
  const plan = planWorkingZoneCamera({
    frames,
    start: 0,
    end: 1,
    targetScale: 2,
    policy: { ...policy, settings: { ...policy.settings, zoneSize: 0.2 } },
    geometry,
  });
  expect(plan.status).toBe('ready');
  if (plan.status !== 'ready') return;
  expect(plan.spans.every((span) => span.kind === 'hold')).toBe(true);
  expect(evaluateWorkingZoneCamera(plan, 0)).toEqual(evaluateWorkingZoneCamera(plan, 1));
  expect(evaluateWorkingZoneCamera(plan, 0).x).toBeCloseTo(670);
});

it('working-zone planner keeps independent source instances discontinuous', () => {
  const frames = [
    { time: 0, x: 0.3, y: 0.5, segmentId: 'a' },
    { time: 1, x: 0.3, y: 0.5, segmentId: 'a' },
    { time: 2, x: 0.8, y: 0.5, segmentId: 'b' },
    { time: 3, x: 0.8, y: 0.5, segmentId: 'b' },
  ];
  const plan = planWorkingZoneCamera({
    frames,
    start: 0,
    end: 3,
    targetScale: 2,
    policy,
    geometry,
  });
  expect(plan.status).toBe('ready');
  if (plan.status !== 'ready') return;
  expect(plan.spans.every((span) => span.kind === 'hold')).toBe(true);
  expect(evaluateWorkingZoneCamera(plan, 1.9).x).toBeCloseTo(100);
  expect(evaluateWorkingZoneCamera(plan, 2).x).toBeCloseTo(1000);
  expect(plan.discontinuities).toContainEqual({ time: 2, reason: 'source' });
});

it('working-zone planner retains both one-sided cut poses at a shared output timestamp', () => {
  const frames = [
    { time: 0, x: 0.3, y: 0.5, segmentId: 'before' },
    { time: 1, x: 0.3, y: 0.5, segmentId: 'before' },
    { time: 1, x: 0.8, y: 0.5, segmentId: 'after' },
    { time: 2, x: 0.8, y: 0.5, segmentId: 'after' },
  ];
  const plan = planWorkingZoneCamera({
    frames,
    start: 0,
    end: 2,
    targetScale: 2,
    policy,
    geometry,
  });
  expect(plan.status).toBe('ready');
  if (plan.status !== 'ready') return;
  expect(plan.spans.every((span) => span.kind === 'hold')).toBe(true);
  expect(evaluateWorkingZoneCamera(plan, 1).x).toBeCloseTo(1000);
  expect(plan.discontinuities).toContainEqual({ time: 1, reason: 'source' });
});

it('uses feasible screen margins and yields an impossible margin to hard source bounds', () => {
  const marginGeometry: WorkingZoneCameraGeometry = {
    ...geometry,
    pointPanBounds(frame, scale, margin = 0) {
      if (!frame.actual) return geometry.panDomain(scale);
      return {
        minX: Math.max(0, (frame.actual.x * scale - 1 + margin) * 1000),
        maxX: Math.min((scale - 1) * 1000, (frame.actual.x * scale - margin) * 1000),
        minY: Math.max(0, (frame.actual.y * scale - 1 + margin) * 600),
        maxY: Math.min((scale - 1) * 600, (frame.actual.y * scale - margin) * 600),
      };
    },
  };
  const plan = (x: number, marginFraction: number) =>
    planWorkingZoneCamera({
      frames: [0, 1].map((time) => ({
        time,
        x: 0.5,
        y: 0.5,
        actual: { x, y: 0.5 },
        segmentId: 'margin',
      })),
      start: 0,
      end: 1,
      targetScale: 2,
      geometry: marginGeometry,
      policy: { ...policy, settings: { ...policy.settings, marginFraction } },
    });
  expect(evaluateWorkingZoneCamera(plan(0.9, 0), 0.5).x).toBeCloseTo(800);
  expect(evaluateWorkingZoneCamera(plan(0.9, 0.2), 0.5).x).toBeCloseTo(1000);
  const edge = plan(1, 0.2);
  expect(edge.status).toBe('ready');
  expect(evaluateWorkingZoneCamera(edge, 0.5).x).toBeCloseTo(1000);
});

it('preserves incoming and outgoing position, velocity, and acceleration on a single working zone', () => {
  const incoming = {
    pan: { x: 200, y: 300 },
    velocity: { x: 10, y: 0 },
    acceleration: { x: 2, y: 0 },
  };
  const outgoing = {
    pan: { x: 800, y: 300 },
    velocity: { x: -10, y: 0 },
    acceleration: { x: -2, y: 0 },
  };
  const plan = planWorkingZoneCamera({
    frames: [0, 4].map((time) => ({ time, x: 0.5, y: 0.5, segmentId: 'one' })),
    start: 0,
    end: 4,
    targetScale: 2,
    policy,
    geometry,
    incoming,
    outgoing,
  });
  expect(plan.status).toBe('ready');
  expect(evaluateWorkingZoneCamera(plan, 0)).toEqual(incoming.pan);
  expect(evaluateWorkingZoneCamera(plan, 4)).toEqual(outgoing.pan);
  if (plan.status !== 'ready') return;
  const first = plan.spans[0]!,
    last = plan.spans.at(-1)!;
  expect(first.kind).toBe('transition');
  expect(last.kind).toBe('transition');
  if (first.kind !== 'transition' || last.kind !== 'transition') return;
  for (const [span, time, boundary] of [
    [first, 0, incoming],
    [last, 4, outgoing],
  ] as const) {
    expect(evaluateCameraTrajectoryDerivative(span.trajectory, time, 1).x).toBeCloseTo(
      boundary.velocity.x,
      8
    );
    expect(evaluateCameraTrajectoryDerivative(span.trajectory, time, 2).x).toBeCloseTo(
      boundary.acceleration.x,
      8
    );
  }
});

it('refuses an illegal boundary without clamping it or lowering its shared scale', () => {
  const plan = planWorkingZoneCamera({
    frames: [],
    start: 0,
    end: 1,
    targetScale: 2,
    geometry,
    incoming: { pan: { x: -1, y: 300 }, velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 } },
    policy: { ...policy, settings: { ...policy.settings, allowExpansion: true } },
  });
  expect(plan).toMatchObject({ status: 'conflict', reason: 'pose', time: 0 });
});
