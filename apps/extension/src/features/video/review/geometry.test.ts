import { expect, it } from 'vitest';
import {
  fitVideoRect,
  normalizeVideoPoint,
  projectVideoRegion,
  regionFromPoints,
} from './geometry';

it('excludes letterboxing and preserves the same intrinsic rectangle after resize', () => {
  const source = { width: 1920, height: 1080 };
  const first = fitVideoRect({ width: 800, height: 600 }, source);
  expect(first).toEqual({ x: 0, y: 75, width: 800, height: 450 });
  expect(normalizeVideoPoint({ x: 100, y: 20 }, first)).toBeNull();
  const region = regionFromPoints(
    normalizeVideoPoint({ x: 200, y: 187.5 }, first)!,
    normalizeVideoPoint({ x: 600, y: 412.5 }, first)!
  )!;
  expect(region).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
  const second = fitVideoRect({ width: 400, height: 300 }, source);
  expect(projectVideoRegion(region, second)).toEqual({
    x: 100,
    y: 93.75,
    width: 200,
    height: 112.5,
  });
  expect(projectVideoRegion(region, { x: 0, y: 0, ...source })).toEqual({
    x: 480,
    y: 270,
    width: 960,
    height: 540,
  });
});

it('handles oriented portrait content, reversed drags and edge clamping', () => {
  const content = fitVideoRect({ width: 800, height: 600 }, { width: 1080, height: 1920 });
  expect(content.height).toBe(600);
  expect(content.x).toBeGreaterThan(0);
  expect(normalizeVideoPoint({ x: -10, y: 700 }, content, true)).toEqual({ x: 0, y: 1 });
  expect(regionFromPoints({ x: 1, y: 1 }, { x: 0, y: 0 })).toEqual({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  expect(regionFromPoints({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeNull();
  expect(() => fitVideoRect({ width: 0, height: 10 }, { width: 10, height: 10 })).toThrow();
});
