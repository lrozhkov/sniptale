import { expect, it } from 'vitest';
import type { VideoProjectTransform } from '../../../../../features/video/project/types';
import {
  getPreviewTransformHandlePoint,
  getPreviewTransformResizeCursor,
  isPointInsidePreviewTransform,
  resizePreviewTransform,
} from './geometry';

const TRANSFORM: VideoProjectTransform = {
  height: 40,
  opacity: 1,
  rotation: 45,
  width: 100,
  x: 20,
  y: 30,
};

it('inverse-rotates hit-test points into the local clip frame', () => {
  expect(isPointInsidePreviewTransform({ point: { x: 70, y: 50 }, transform: TRANSFORM })).toBe(
    true
  );
  expect(isPointInsidePreviewTransform({ point: { x: 21, y: 31 }, transform: TRANSFORM })).toBe(
    false
  );
});

it('keeps the opposite rotated corner fixed while resizing', () => {
  const beforePivot = getPreviewTransformHandlePoint(TRANSFORM, 'nw');
  const resized = resizePreviewTransform({
    delta: { x: 30, y: 10 },
    handle: 'se',
    minSize: 20,
    transform: TRANSFORM,
  });

  expect(getPreviewTransformHandlePoint(resized, 'nw')).toEqual({
    x: expect.closeTo(beforePivot.x, 8),
    y: expect.closeTo(beforePivot.y, 8),
  });
  expect(resized.width).toBeGreaterThan(TRANSFORM.width);
});

it('rotates resize cursors with their visual handles', () => {
  expect(getPreviewTransformResizeCursor('nw', 0)).toBe('nw-resize');
  expect(getPreviewTransformResizeCursor('nw', 90)).toBe('ne-resize');
  expect(getPreviewTransformResizeCursor('se', -90)).toBe('sw-resize');
});
