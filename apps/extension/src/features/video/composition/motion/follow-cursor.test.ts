import { expect, it } from 'vitest';
import { planFollowCursorCamera, evaluateFollowCursorCamera } from './follow-cursor';
it('holds tiny jitter and keeps trusted actual pointer visible even at source corners', () => {
  const frames = Array.from({ length: 60 }, (_, index) => ({
    time: index / 30,
    x: 0.5 + Math.sin(index) * 0.005,
    y: 0.5,
    segmentId: 'one',
  }));
  const plan = planFollowCursorCamera(frames, 4, 0.5);
  expect(plan.every((pose) => pose.x === 0.5 && pose.y === 0.5)).toBe(true);
  const corner = evaluateFollowCursorCamera(plan, 1, { x: 1, y: 0 }, 4)!;
  expect(corner).toMatchObject({ x: 0.875, y: 0.125, constrained: true });
  expect(evaluateFollowCursorCamera(plan, 1, { x: 1, y: 0 }, 4)).toEqual(corner);
});
it('replans in output seconds and never looks ahead across an independent segment', () => {
  const plan = planFollowCursorCamera(
    [
      { time: 0, x: 0.5, y: 0.5, segmentId: 'a' },
      { time: 0.1, x: 0.5, y: 0.5, segmentId: 'a' },
      { time: 0.2, x: 1, y: 1, segmentId: 'b' },
    ],
    2,
    0.5
  );
  expect(plan[1]).toMatchObject({ x: 0.5, y: 0.5 });
});
