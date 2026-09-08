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

it.each(['pointercancel', 'blur', 'Escape'])(
  'routes %s to cancellation exactly once',
  (trigger) => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const onCancel = vi.fn();
    startWindowPointerSession({ onMove, onEnd, onCancel });
    window.dispatchEvent(
      trigger === 'Escape'
        ? new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
        : new Event(trigger)
    );
    window.dispatchEvent(new Event('pointerup'));
    dispatchPointerMove(10, 20);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onEnd).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  }
);

it.each(['pointerup', 'pointercancel', 'blur', 'Escape', 'cleanup'])(
  'holds a document cursor until %s and removes its override',
  (trigger) => {
    const cleanup = startWindowPointerSession({
      cursor: 'grabbing',
      onMove: vi.fn(),
      onCancel: vi.fn(),
    });
    const style = document.querySelector('style[data-video-editor-pointer-cursor]');
    expect(style?.textContent).toContain('cursor: grabbing !important');
    if (trigger === 'cleanup') cleanup();
    else
      window.dispatchEvent(
        trigger === 'Escape' ? new KeyboardEvent('keydown', { key: 'Escape' }) : new Event(trigger)
      );
    expect(document.querySelector('style[data-video-editor-pointer-cursor]')).toBeNull();
    cleanup();
  }
);

it('does not release another session cursor when an older session is cleaned up', () => {
  const first = startWindowPointerSession({ cursor: 'grabbing', onMove: vi.fn() });
  const second = startWindowPointerSession({ cursor: 'ew-resize', onMove: vi.fn() });
  first();
  expect(document.querySelector('style[data-video-editor-pointer-cursor]')?.textContent).toContain(
    'cursor: ew-resize !important'
  );
  second();
  expect(document.querySelector('style[data-video-editor-pointer-cursor]')).toBeNull();
});
