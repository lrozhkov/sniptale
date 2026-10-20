import { expect, it } from 'vitest';
import { createQuickEditBorder } from '../project/scene/focus-appearance';
import type { CameraTransitionType } from '../project/motion/transitions';
import { sampleSceneBorder } from './scene-border';

it.each<{ type: CameraTransitionType; enter: number; exit: number }>([
  { type: 'none', enter: 1, exit: 1 },
  { type: 'linear', enter: 0.25, exit: 0.75 },
  { type: 'ease-in-out', enter: 0.15625, exit: 0.84375 },
  { type: 'ease-out', enter: 0.4375, exit: 0.5625 },
  { type: 'instant', enter: 1, exit: 0 },
])('uses $type phases at retained animation times', ({ type, enter, exit }) => {
  const sample = (time: number) =>
    sampleSceneBorder({
      id: 'border',
      border: createQuickEditBorder(),
      clock: { time, duration: 4, enter: { type, duration: 1 }, exit: { type, duration: 1 } },
      window: { x: 100, y: 50, width: 400, height: 200 },
      scale: 2,
    })[0]!;
  expect(sample(0.25).opacity).toBeCloseTo(enter, 12);
  expect(sample(3.25).opacity).toBeCloseTo(exit, 12);
  expect(sample(2)).toMatchObject({
    id: 'border',
    width: 6,
    color: '#ff8800ff',
    style: 'solid',
    opacity: 1,
  });
  expect(sample(2).path).toMatch(/^M300 103H/);
});

it('keeps instantaneous and disabled phases distinct at the exact authored boundary', () => {
  const args = {
    id: 'border',
    border: createQuickEditBorder(),
    window: { x: 0, y: 0, width: 400, height: 200 },
    scale: 1,
  };
  expect(
    sampleSceneBorder({
      ...args,
      clock: {
        time: 0,
        duration: 4,
        enter: { type: 'instant', duration: 1 },
        exit: { type: 'none', duration: 0 },
      },
    })[0]?.opacity
  ).toBe(0);
  expect(
    sampleSceneBorder({
      ...args,
      clock: {
        time: 0,
        duration: 4,
        enter: { type: 'none', duration: 1 },
        exit: { type: 'none', duration: 0 },
      },
    })[0]?.opacity
  ).toBe(1);
});

it('keeps ripple energy inside the retained hold and uses one independent outline', () => {
  const sample = (time: number) =>
    sampleSceneBorder({
      id: 'ripple',
      border: { ...createQuickEditBorder(), loop: true, motion: 'ripple' },
      clock: {
        time,
        duration: 4,
        enter: { type: 'linear', duration: 1 },
        exit: { type: 'linear', duration: 1 },
      },
      window: { x: 0, y: 0, width: 400, height: 200 },
      scale: 1,
    });
  expect(sample(1)).toHaveLength(1);
  expect(sample(3)).toHaveLength(1);
  const active = sample(1.5);
  expect(active).toHaveLength(2);
  expect(active[1]).toMatchObject({ id: 'ripple:ripple', start: 0, end: 1 });
  expect(active[1]!.opacity).toBeCloseTo(0.6 * Math.SQRT1_2, 12);
  expect(active[1]!.perimeter).toBeGreaterThan(active[0]!.perimeter);
});
