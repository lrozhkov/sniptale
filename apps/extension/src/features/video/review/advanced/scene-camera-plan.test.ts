import { expect, it } from 'vitest';
import { evaluateWorkingZoneCameraBoundary } from '../../composition/motion/follow-cursor';
import {
  resolveReviewSceneCameraPlan,
  resolveReviewCameraConflicts,
  evaluateQuickEditCameraAtTime,
} from './scene';
import {
  createCameraFollowSettings,
  resolveCameraFollowPolicy,
} from '../../project/camera/cursor-policy';
import type { QuickEditZoomRegion } from './types';

it('rejects a fragment inside a link gap when its captured pointer leaves the admitted output', () => {
  const focus = {
    version: 1 as const,
    mode: 'follow' as const,
    smoothing: 0,
    sensitivity: 0.5,
    gapPolicy: 'hold' as const,
    segments: [
      {
        id: 'native',
        start: 0,
        end: 4,
        binding: { kind: 'project' as const },
        keys: [0, 1, 2, 3, 4].map((time) => ({
          id: `point-${time}`,
          time,
          x: 0.5,
          y: 0.5,
          anchor: 'movement' as const,
          interpolation: 'linear' as const,
        })),
      },
    ],
  };
  const observed = {
    ...focus,
    segments: focus.segments.map((segment) => ({
      ...segment,
      keys: segment.keys.map((key) => ({ ...key, x: key.time === 2 ? 0.05 : 0.5 })),
    })),
  };
  const scene = {
    source: { width: 1000, height: 600 },
    background: { enabled: false as const, zoomBehavior: 'window' as const },
  };
  const from = {
    id: 'from',
    start: 0,
    end: 1,
    linkTo: 'to',
    transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'none' as const, duration: 0 },
    exit: { type: 'none' as const, duration: 0 },
    cursorFocus: {
      path: focus,
      observed,
      scene,
      policy: resolveCameraFollowPolicy({ defaults: createCameraFollowSettings('calm') }),
    },
  };
  const to = {
    id: 'to',
    start: 3,
    end: 4,
    transform: from.transform,
    enter: from.enter,
    exit: from.exit,
  };
  expect(resolveReviewCameraConflicts([from, to], scene, { start: 0, end: 0.5 })).toEqual([]);
  expect(resolveReviewCameraConflicts([from, to], scene, { start: 1.9, end: 2.1 })).toContainEqual(
    expect.objectContaining({
      regionId: 'from',
      interval: { start: 1, end: 3 },
      reason: 'viewport',
    })
  );
});

it.each([
  ['manual', 'none'],
  ['follow', 'none'],
  ['follow', 'ease-in-out'],
] as const)(
  'shares a C2 endpoint between contiguous %s and follow cameras with %s phases',
  (mode, phase) => {
    const path = {
      version: 1 as const,
      mode: 'follow' as const,
      smoothing: 0,
      sensitivity: 0.5,
      gapPolicy: 'hold' as const,
      segments: [
        {
          id: 'native',
          start: 0,
          end: 6,
          binding: { kind: 'project' as const },
          keys: [0, 3, 6].map((time) => ({
            id: `point-${time}`,
            time,
            x: time < 3 ? 0.4 : 0.6,
            y: 0.5,
            anchor: 'movement' as const,
            interpolation: 'linear' as const,
          })),
        },
      ],
    };
    const scene = { source: { width: 1000, height: 600 }, background: { enabled: false as const } };
    const context = {
      path,
      scene,
      policy: resolveCameraFollowPolicy({ defaults: createCameraFollowSettings('fast') }),
    };
    const from: QuickEditZoomRegion = {
      id: 'from',
      start: 0,
      end: 3,
      transform: { scale: 2, centerX: 0.4, centerY: 0.5 },
      enter: { type: phase, duration: phase === 'none' ? 0 : 0.6 },
      exit: { type: phase, duration: phase === 'none' ? 0 : 0.6 },
      ...(mode === 'follow' ? { cursorFocus: context } : {}),
    };
    const to: QuickEditZoomRegion = { ...from, id: 'to', start: 3, end: 6, cursorFocus: context };
    const regions = [from, to];
    expect(resolveReviewCameraConflicts(regions, scene)).toEqual([]);
    const position = (time: number) => {
      const camera = evaluateQuickEditCameraAtTime(regions, time, scene);
      return (camera.centerX * camera.scale - 0.5) * 1000;
    };
    const epsilon = 1e-4;
    expect(position(3 - epsilon)).toBeCloseTo(position(3), 4);
    expect(Math.abs((position(3 + epsilon) - position(3)) / epsilon)).toBeLessThan(2);
    const plan = resolveReviewSceneCameraPlan(regions, to, scene);
    expect(plan?.status).toBe('ready');
    if (plan?.status === 'ready') {
      const boundary = evaluateWorkingZoneCameraBoundary(plan, 3);
      expect(boundary.velocity.x).toBeCloseTo(0, 8);
      expect(boundary.acceleration.x).toBeCloseTo(0, 8);
    }
  }
);

it('keeps a nominal discontinuity when short-camera fitting changes adjacent phase acceleration', () => {
  const path = {
    version: 1 as const,
    mode: 'follow' as const,
    smoothing: 0,
    sensitivity: 0.5,
    gapPolicy: 'hold' as const,
    segments: [
      {
        id: 'native',
        start: 0,
        end: 4,
        binding: { kind: 'project' as const },
        keys: [0, 4].map((time) => ({
          id: `point-${time}`,
          time,
          x: 0.5,
          y: 0.5,
          anchor: 'movement' as const,
          interpolation: 'linear' as const,
        })),
      },
    ],
  };
  const scene = { source: { width: 1000, height: 600 }, background: { enabled: false as const } };
  const context = {
    path,
    scene,
    policy: resolveCameraFollowPolicy({ defaults: createCameraFollowSettings('fast') }),
  };
  const left: QuickEditZoomRegion = {
    id: 'short',
    start: 0,
    end: 0.5,
    transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'ease-in-out', duration: 0.6 },
    exit: { type: 'ease-in-out', duration: 0.6 },
    cursorFocus: context,
  };
  const right = { ...left, id: 'long', start: 0.5, end: 3.5 };
  const plan = resolveReviewSceneCameraPlan([left, right], right, scene);
  expect(plan?.status).toBe('ready');
  if (plan?.status === 'ready')
    expect(plan.discontinuities).toContainEqual({ time: 0.5, reason: 'nominal' });
});
