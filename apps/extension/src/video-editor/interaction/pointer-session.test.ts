// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { startWindowPointerSession } from './pointer-session';

function dispatchPointerMove(clientX: number, clientY: number) {
  const moveEvent = new Event('pointermove');
  Object.defineProperty(moveEvent, 'clientX', { value: clientX });
  Object.defineProperty(moveEvent, 'clientY', { value: clientY });
  window.dispatchEvent(moveEvent);
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('stops forwarding pointer events after explicit cleanup', () => {
  const onMove = vi.fn();
  const cleanup = startWindowPointerSession({ onMove });

  act(() => {
    dispatchPointerMove(10, 20);
  });
  cleanup();
  act(() => {
    dispatchPointerMove(30, 40);
  });

  expect(onMove).toHaveBeenCalledTimes(1);
});

it('runs the end handler exactly once for pointerup and pointercancel', () => {
  const onEnd = vi.fn();
  startWindowPointerSession({ onEnd, onMove: vi.fn() });

  act(() => {
    window.dispatchEvent(new Event('pointerup'));
    window.dispatchEvent(new Event('pointercancel'));
  });

  expect(onEnd).toHaveBeenCalledTimes(1);
});
