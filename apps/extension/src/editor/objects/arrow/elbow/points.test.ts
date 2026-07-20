import { expect, it } from 'vitest';
import { areCollinear, clonePoint, getTerminalAxis, isNear } from './points';

it('clones points and classifies elbow point geometry', () => {
  const point = { x: 1, y: 2 };
  expect(clonePoint(point)).toEqual(point);
  expect(clonePoint(point)).not.toBe(point);
  expect(isNear(0, 4)).toBe(true);
  expect(isNear(0, 5)).toBe(false);
  expect(getTerminalAxis({ x: 0, y: 0 }, { x: 10, y: 4 })).toBe('horizontal');
  expect(getTerminalAxis({ x: 0, y: 0 }, { x: 4, y: 10 })).toBe('vertical');
  expect(areCollinear({ x: 1, y: 0 }, { x: 1.5, y: 10 }, { x: 2, y: 20 })).toBe(true);
});
