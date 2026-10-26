import { expect, it } from 'vitest';
import {
  cameraShadowLocalOffset,
  isCameraShadowDirection,
  resolveCameraShadowVector,
} from './shadow-direction';
const scene = { width: 1000, height: 500 };
const windowAt = (x: number, y: number) => ({ x: x - 50, y: y - 50, width: 100, height: 100 });

it.each([0, 90, 180, 270])('resolves fixed %s degrees in scene space', (angle) => {
  const vector = resolveCameraShadowVector({ mode: 'angle', angle }, windowAt(100, 100), scene)!;
  expect(vector.x).toBeCloseTo(Math.cos((angle * Math.PI) / 180), 8);
  expect(vector.y).toBeCloseTo(Math.sin((angle * Math.PI) / 180), 8);
});
it('keeps classic absent and explicit classic identical', () => {
  expect(resolveCameraShadowVector(undefined, windowAt(100, 100), scene)).toBeUndefined();
  expect(
    resolveCameraShadowVector({ mode: 'classic', angle: 123 }, windowAt(100, 100), scene)
  ).toBeUndefined();
});
it('softens center direction to zero continuously and recomputes moving windows', () => {
  const direction = { mode: 'center', angle: 123 } as const;
  expect(resolveCameraShadowVector(direction, windowAt(0, 250), scene)).toEqual({ x: 1, y: 0 });
  expect(resolveCameraShadowVector(direction, windowAt(487.5, 250), scene)).toEqual({
    x: 0.5,
    y: 0,
  });
  expect(resolveCameraShadowVector(direction, windowAt(500, 250), scene)).toEqual({ x: 0, y: 0 });
  expect(resolveCameraShadowVector(direction, windowAt(1000, 250), scene)).toEqual({ x: -1, y: 0 });
});
it('blends adjacent edge ties without renormalizing and cancels opposite ties', () => {
  const direction = { mode: 'nearest-edge', angle: 37 } as const;
  expect(resolveCameraShadowVector(direction, windowAt(20, 20), scene)).toEqual({
    x: -0.5,
    y: -0.5,
  });
  expect(resolveCameraShadowVector(direction, windowAt(10, 250), scene)).toEqual({ x: -1, y: 0 });
  expect(resolveCameraShadowVector(direction, windowAt(500, 250), scene)).toEqual({ x: 0, y: 0 });
  const a = resolveCameraShadowVector(direction, windowAt(20, 20 - 1e-7), scene)!;
  const b = resolveCameraShadowVector(direction, windowAt(20, 20 + 1e-7), scene)!;
  expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-8);
});
it.each([
  null,
  {},
  { mode: 'bad', angle: 0 },
  { mode: 'angle', angle: 360 },
  { mode: 'angle', angle: NaN },
  { mode: 'angle', angle: Infinity },
  { mode: 'center', angle: -1 },
  { mode: 'classic', angle: 0, hidden: true },
])('refuses malformed direction %j', (value) => {
  expect(isCameraShadowDirection(value)).toBe(false);
});
it('compensates rotation and anisotropic scale, refusing singular transforms', () => {
  const matrix = { a: 0, b: 3, c: -2, d: 0 };
  const local = cameraShadowLocalOffset({ x: 1, y: 0 }, 7, matrix)!;
  expect(matrix.a * local.x + matrix.c * local.y).toBeCloseTo(7, 8);
  expect(matrix.b * local.x + matrix.d * local.y).toBeCloseTo(0, 8);
  expect(cameraShadowLocalOffset({ x: 1, y: 0 }, 7, { a: 0, b: 0, c: 0, d: 1 })).toBeNull();
});
