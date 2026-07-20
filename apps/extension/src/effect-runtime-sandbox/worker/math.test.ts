import { expect, it, vi } from 'vitest';

import {
  clamp,
  deterministicRandom,
  interpolatePoints,
  interpolateTimelineValue,
  lerp,
  roundRect,
  segment,
} from './math';
import { cubicBezierYForX, ease, resolveTimelineEase } from './timeline/easing';

it('keeps deterministic math bounded across scalar and structured values', () => {
  expect(deterministicRandom(null)).toBe(0.986326);
  expect(deterministicRandom('seed')).toBe(deterministicRandom('seed'));
  expect(clamp(4, 0, 2)).toBe(2);
  expect(lerp(0, 10, 2)).toBe(10);
  expect(segment(-1, 0, 1)).toBe(0);
  expect(segment(2, 0, 1)).toBe(1);
  expect(segment(0.5, 0, 1)).toBe(0.5);
  expect(interpolateTimelineValue(0, 10, 0.25)).toBe(2.5);
  expect(interpolateTimelineValue([0, 'a'], [10, 'b'], 0.25)).toEqual([2.5, 'a']);
  expect(interpolateTimelineValue([0, 'a'], [10, 'b'], 0.75)).toEqual([7.5, 'b']);
  expect(interpolateTimelineValue({ x: 0 }, { x: 10, y: 2 }, 0.5)).toEqual({ x: 5, y: 2 });
  expect(interpolateTimelineValue('from', 'to', 0.75)).toBe('to');
});

it('interpolates point ranges and easing profiles at every boundary', () => {
  expect(interpolatePoints(0, null, null, 'linear')).toBeNull();
  expect(interpolatePoints(-1, [0, 1], [10, 20], 'linear')).toBe(10);
  expect(interpolatePoints(0.5, [0, 1], [10, 20], 'linear')).toBe(15);
  expect(interpolatePoints(2, [0, 1], [10, 20], 'linear')).toBe(20);
  expect(resolveTimelineEase({ easing: 'hold' }, 0.5)).toBe(0);
  expect(resolveTimelineEase({ easing: 'hold' }, 1)).toBe(1);
  expect(resolveTimelineEase({ easing: 'bezier', handles: null }, 0.5)).toBeGreaterThan(0);
  expect(cubicBezierYForX({ x1: -1, x2: 2, y1: 0, y2: 1 }, 0.5)).toBeCloseTo(0.5, 2);
  expect(ease('in', 0.5)).toBe(0.125);
  expect(ease('out', 0.5)).toBe(0.875);
  expect(ease('back', 0.5)).toBeGreaterThan(0.5);
  expect(ease('inOut', 0.25)).toBe(0.0625);
  expect(ease('inOut', 0.75)).toBe(0.9375);
  expect(ease('linear', 2)).toBe(1);
});

it('constructs the complete bounded round-rectangle path', () => {
  const context = {
    arcTo: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
  };

  roundRect(context, 1, 2, 30, 20, 4);

  expect(context.beginPath).toHaveBeenCalledOnce();
  expect(context.moveTo).toHaveBeenCalledWith(5, 2);
  expect(context.arcTo).toHaveBeenCalledTimes(4);
  expect(context.closePath).toHaveBeenCalledOnce();
});
