import { expect, it } from 'vitest';
import {
  nearestPageCorner,
  nextPageCorner,
  pageCornerForKey,
  pageCornerOffsets,
  clampCornerDragPosition,
} from './geometry';
it('uses the same corner geometry for pointer and keyboard input', () => {
  expect(nearestPageCorner({ x: 40, y: 40 }, { width: 1280, height: 560 })).toBe('top-left');
  expect(nearestPageCorner({ x: 640, y: 280 }, { width: 1280, height: 560 })).toBe('bottom-right');
  expect(nextPageCorner('bottom-left')).toBe('top-left');
  expect(pageCornerForKey('bottom-right', 'ArrowLeft')).toBe('bottom-left');
  expect(pageCornerForKey('bottom-left', 'ArrowUp')).toBe('top-left');
  expect(pageCornerForKey('top-left', 'ArrowRight')).toBe('top-right');
  expect(pageCornerForKey('top-right', 'ArrowDown')).toBe('bottom-right');
  expect(pageCornerForKey('top-right', 'Escape')).toBeNull();
});
it('keeps groups within the viewport and accounts for the scrollbar at the right edge', () => {
  expect(
    clampCornerDragPosition(
      { x: 1500, y: -1 },
      { width: 72, height: 40 },
      { width: 1280, height: 560 }
    )
  ).toEqual({ x: 1208, y: 0 });
  expect(
    clampCornerDragPosition(
      { x: 8, y: 8 },
      { width: 200, height: 200 },
      { width: 100, height: 100 }
    )
  ).toEqual({ x: 0, y: 0 });
  expect(pageCornerOffsets('bottom-right', 1, 15)).toEqual({
    right: 35,
    bottom: 20,
    transformOrigin: 'right bottom',
  });
  expect(pageCornerOffsets('top-left', 0.5)).toEqual({
    left: 10,
    top: 10,
    transformOrigin: 'left top',
  });
});
