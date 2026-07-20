import { expect, it, vi } from 'vitest';
import { restoreRectangleCenter } from './center';
import { clampRectangleGeometry, resolveRectangleDimension, resolveRectangleScale } from './math';
import { resolveRectangleIntentRadius, resolveRectangleRenderRadius } from './radius';
import { captureRectangleVisualState } from './visual-state';

it('keeps rectangle scale and dimension math in the math owner', () => {
  expect(resolveRectangleScale(0)).toBe(1);
  expect(resolveRectangleScale(-2)).toBe(2);
  expect(resolveRectangleDimension(Number.NaN)).toBe(0);
  expect(clampRectangleGeometry(0, 10, 2)).toBe(1);
});

it('keeps rectangle visual-state capture separate from mutation owners', () => {
  expect(
    captureRectangleVisualState({
      height: 20,
      left: 5,
      scaleX: 2,
      scaleY: 3,
      strokeWidth: 4,
      top: 10,
      width: 30,
    } as never)
  ).toEqual({
    center: { x: 35, y: 40 },
    outerHeight: 64,
    outerWidth: 64,
  });

  expect(
    captureRectangleVisualState({
      getCenterPoint: () => ({ x: 7, y: 9 }),
      height: 10,
      scaleX: 1,
      scaleY: 1,
      strokeWidth: 2,
      width: 12,
    } as never).center
  ).toEqual({ x: 7, y: 9 });

  expect(
    captureRectangleVisualState({
      height: 4,
      left: null,
      scaleX: 1,
      scaleY: 1,
      top: undefined,
      width: 6,
    } as never).center
  ).toEqual({ x: 3, y: 2 });
});

it('keeps rectangle radius intent and render clamping in the radius owner', () => {
  expect(
    resolveRectangleIntentRadius({ sniptaleShapeRadius: Number.NaN, rx: -2, ry: 6 } as never)
  ).toBe(0);
  expect(resolveRectangleIntentRadius({ ry: 6 } as never)).toBe(6);
  expect(resolveRectangleRenderRadius(20, 10, 30)).toBe(5);
});

it('keeps center restoration fallback in the center owner', () => {
  const rect = {
    height: 20,
    scaleX: 2,
    scaleY: 1,
    set: vi.fn((values: Record<string, unknown>) => Object.assign(rect, values)),
    width: 10,
  };

  restoreRectangleCenter(rect as never, { x: 50, y: 60 });

  expect(rect.set).toHaveBeenCalledWith({ left: 40, top: 50 });
});
