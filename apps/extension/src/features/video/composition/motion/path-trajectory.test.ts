import { expect, it } from 'vitest';
import { VideoMotionPathTrajectoryPreset } from '../../project/types/index';
import { interpolatePathFocusPoint, resolvePathSegmentIndex } from './path-trajectory';
import type { VideoProjectMotionPathStop } from '../../project/types/index';

it('resolves the active segment index from ordered stop offsets', () => {
  const stops: VideoProjectMotionPathStop[] = [
    { id: 'stop-1', offset: 0, target: { kind: 'POINT', scale: 2, x: 100, y: 100 } },
    { id: 'stop-2', offset: 0.35, target: { kind: 'POINT', scale: 2, x: 200, y: 100 } },
    { id: 'stop-3', offset: 0.8, target: { kind: 'POINT', scale: 2, x: 300, y: 100 } },
    { id: 'stop-4', offset: 1, target: { kind: 'POINT', scale: 2, x: 400, y: 100 } },
  ];

  expect(resolvePathSegmentIndex(stops, 0.1)).toBe(0);
  expect(resolvePathSegmentIndex(stops, 0.6)).toBe(1);
  expect(resolvePathSegmentIndex(stops, 1.2)).toBe(2);
  expect(resolvePathSegmentIndex([stops[0]!], 0.5)).toBe(0);
});

it('interpolates linear path segments on the direct line', () => {
  expect(
    interpolatePathFocusPoint({ x: 100, y: 200 }, { x: 300, y: 500 }, 0.25, {
      trajectoryPreset: VideoMotionPathTrajectoryPreset.LINEAR,
    })
  ).toEqual({ x: 150, y: 275 });
});

it('bends soft arc path segments away from the direct line', () => {
  const point = interpolatePathFocusPoint({ x: 120, y: 200 }, { x: 420, y: 200 }, 0.5, {
    trajectoryPreset: VideoMotionPathTrajectoryPreset.SOFT_ARC,
  });

  expect(point.x).toBe(270);
  expect(point.y).toBeLessThan(200);
});
