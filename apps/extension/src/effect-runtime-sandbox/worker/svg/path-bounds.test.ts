import { expect, it } from 'vitest';
import type { SerializedSvgVectorPart } from '../../../contracts/effect-runtime/svg-vector';
import { deriveSvgPathBounds, getSvgPartPrimitiveBounds } from './path-bounds';
it('bounds common implicit, relative and multiple subpaths independently of centroid/viewBox', () => {
  expect(deriveSvgPathBounds('M0 0 10 0 10 10h-10V0z')).toEqual({
    x: 0,
    y: 0,
    width: 10,
    height: 10,
  });
  expect(deriveSvgPathBounds('m5,6 10,0 0,10 -10,0z M-20-30h2v3z')).toEqual({
    x: -20,
    y: -30,
    width: 35,
    height: 46,
  });
  expect(deriveSvgPathBounds('M1e1 .5 L+20 -2e1')).toEqual({
    x: 10,
    y: -20,
    width: 10,
    height: 20.5,
  });
});
it('contains reflected cubic and quadratic control hulls', () => {
  expect(deriveSvgPathBounds('M0 0C5 -10 10 -10 15 0S25 10 30 0')).toEqual({
    x: 0,
    y: -10,
    width: 30,
    height: 20,
  });
  expect(deriveSvgPathBounds('M0 0Q5 -10 10 0T20 0')).toEqual({
    x: 0,
    y: -10,
    width: 20,
    height: 20,
  });
});
it('contains full corrected rotated ellipses for either arc sweep and compact flags', () => {
  for (const path of ['M0 0A5 5 0 0 1 20 0', 'M0 0a5 5 0 0120 0']) {
    expect(deriveSvgPathBounds(path)).toEqual({ x: 0, y: -10, width: 20, height: 20 });
  }
  const b = deriveSvgPathBounds('M0 0A20 10 45 1 0 20 20')!;
  expect(b.x).toBeLessThanOrEqual(0);
  expect(b.y).toBeLessThanOrEqual(0);
  expect(b.x + b.width).toBeGreaterThanOrEqual(20);
  expect(b.y + b.height).toBeGreaterThanOrEqual(20);
  expect(deriveSvgPathBounds('M1 1A0 3 0 0 1 10 10')).toEqual({ x: 1, y: 1, width: 9, height: 9 });
});
it('distinguishes native empty paths from nonempty zero-area paths and leaves unknown syntax conservative', () => {
  expect(deriveSvgPathBounds('')).toBeNull();
  expect(deriveSvgPathBounds('Z')).toBeNull();
  expect(deriveSvgPathBounds('M0 0')).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  expect(deriveSvgPathBounds('M0 0h0v0z')).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  for (const path of ['R0 0', 'M1', 'M1e999 0', 'M0 0A1 1 0 3 1 2 2', 'M0 0Lx'])
    expect(deriveSvgPathBounds(path)).toBeUndefined();
});
it('caches GPU-only bounds privately without changing hydrated part keys or fields', () => {
  const part = {
    type: 'path',
    pathData: 'M0 0h10v10h-10z',
    cx: 61.5,
    cy: 18,
  } as SerializedSvgVectorPart;
  const before = Object.keys(part);
  const first = getSvgPartPrimitiveBounds(part);
  expect(first).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  expect(getSvgPartPrimitiveBounds(part)).toBe(first);
  expect(Object.keys(part)).toEqual(before);
  expect(part).not.toHaveProperty('bounds');
});
