// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

import {
  buildKeyboardInteractionPoint,
  buildPointerCaptureMetadata,
  getScrollPosition,
  updatePendingPointerRange,
  type PendingPointerCapture,
} from './metadata';

function createTarget() {
  const target = document.createElement('button');
  target.textContent = 'Submit';
  document.body.appendChild(target);
  return target;
}

function createPendingPointerCapture(
  target: HTMLElement,
  overrides: Partial<PendingPointerCapture> = {}
): PendingPointerCapture {
  return {
    endPoint: { x: 18, y: 24 },
    maxX: 18,
    maxY: 24,
    minX: 10,
    minY: 12,
    scrollStartX: 4,
    scrollStartY: 20,
    startPoint: { x: 10, y: 12 },
    startedAt: 100,
    target,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it('tracks the pointer bounding box while the gesture moves', () => {
  const pendingPointerCapture = createPendingPointerCapture(createTarget());

  updatePendingPointerRange(pendingPointerCapture, { x: 32, y: 8 });

  expect(pendingPointerCapture).toEqual(
    expect.objectContaining({
      endPoint: { x: 32, y: 8 },
      minX: 10,
      minY: 8,
      maxX: 32,
      maxY: 24,
    })
  );
});

it('builds pointer-up metadata with gesture distance, duration, and scroll delta', () => {
  const target = createTarget();
  const pendingPointerCapture = createPendingPointerCapture(target, {
    endPoint: { x: 34, y: 30 },
    maxX: 34,
    maxY: 30,
  });
  vi.spyOn(Date, 'now').mockReturnValue(460);
  Object.defineProperty(window, 'scrollX', { configurable: true, value: 8 });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 140 });

  expect(buildPointerCaptureMetadata(pendingPointerCapture)).toEqual({
    pointerRange: {
      start: { x: 10, y: 12 },
      end: { x: 34, y: 30 },
      minX: 10,
      minY: 12,
      maxX: 34,
      maxY: 30,
      distance: 30,
      durationMs: 360,
    },
    scroll: {
      startX: 4,
      startY: 20,
      endX: 8,
      endY: 140,
      deltaX: 4,
      deltaY: 120,
    },
    trigger: 'pointer-up',
  });
});

it('reads keyboard interaction points from the visual target center and reports scroll separately', () => {
  const target = createTarget();
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
    x: 20,
    y: 40,
    left: 20,
    top: 40,
    right: 120,
    bottom: 80,
    width: 100,
    height: 40,
    toJSON: () => ({}),
  });
  Object.defineProperty(window, 'scrollX', { configurable: true, value: 14 });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 60 });

  expect(buildKeyboardInteractionPoint(target)).toEqual({ x: 70, y: 60 });
  expect(getScrollPosition()).toEqual({ x: 14, y: 60 });
});
