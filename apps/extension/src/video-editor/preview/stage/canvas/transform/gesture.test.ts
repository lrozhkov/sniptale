// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoProjectTransform } from '../../../../../features/video/project/types';
import { startPreviewTransformGesture } from './gesture';
import { createPreviewTransformGestureState } from './state';

const TRANSFORM: VideoProjectTransform = {
  height: 40,
  opacity: 1,
  rotation: 0,
  width: 60,
  x: 10,
  y: 20,
};

let animationFrame: FrameRequestCallback | null;

function dispatchPointer(
  type: 'pointercancel' | 'pointermove' | 'pointerup',
  x: number,
  y: number
) {
  const event = new Event(type);
  Object.defineProperties(event, {
    clientX: { value: x },
    clientY: { value: y },
  });
  window.dispatchEvent(event);
}

function createHarness() {
  const callbacks = {
    onActivate: vi.fn(),
    onBegin: vi.fn(),
    onCacheBypassChange: vi.fn(),
    onCommit: vi.fn(),
    onPreviewTransform: vi.fn(),
    onRestore: vi.fn(),
    onSettle: vi.fn(),
  };
  const state = createPreviewTransformGestureState({
    clipId: 'clip-1',
    origin: { clientX: 10, clientY: 20 },
    transform: TRANSFORM,
  });
  const cleanup = startPreviewTransformGesture({
    ...callbacks,
    resolveTransform: ({ clientX, clientY }) => ({
      ...TRANSFORM,
      x: TRANSFORM.x + clientX - 10,
      y: TRANSFORM.y + clientY - 20,
    }),
    state,
  });
  return { callbacks, cleanup, state };
}

beforeEach(() => {
  animationFrame = null;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    animationFrame = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('coalesces moves into one RAF preview and commits the latest patch once', () => {
  const { callbacks } = createHarness();

  dispatchPointer('pointermove', 14, 24);
  dispatchPointer('pointermove', 18, 29);
  expect(callbacks.onPreviewTransform).not.toHaveBeenCalled();

  animationFrame?.(10);
  expect(callbacks.onPreviewTransform).toHaveBeenCalledTimes(1);
  expect(callbacks.onActivate).toHaveBeenCalledOnce();
  expect(callbacks.onPreviewTransform).toHaveBeenLastCalledWith(
    'clip-1',
    expect.objectContaining({ x: 18, y: 29 })
  );

  dispatchPointer('pointerup', 18, 29);
  expect(callbacks.onCommit).toHaveBeenCalledTimes(1);
  expect(callbacks.onCommit).toHaveBeenCalledWith(
    'clip-1',
    expect.objectContaining({ x: 18, y: 29 })
  );
  expect(callbacks.onCacheBypassChange.mock.calls).toEqual([[true], [false]]);
  expect(callbacks.onSettle).toHaveBeenCalledWith('commit');
});

it('restores without committing when the pointer is cancelled', () => {
  const { callbacks } = createHarness();

  dispatchPointer('pointermove', 18, 29);
  animationFrame?.(10);
  dispatchPointer('pointercancel', 18, 29);

  expect(callbacks.onCommit).not.toHaveBeenCalled();
  expect(callbacks.onActivate).toHaveBeenCalledOnce();
  expect(callbacks.onRestore).toHaveBeenCalledWith('clip-1');
  expect(callbacks.onPreviewTransform).toHaveBeenLastCalledWith('clip-1', null);
  expect(callbacks.onSettle).toHaveBeenCalledWith('cancel');
});

it('treats release below the threshold as a cancelled transform', () => {
  const { callbacks } = createHarness();

  dispatchPointer('pointermove', 11, 21);
  dispatchPointer('pointerup', 11, 21);

  expect(callbacks.onPreviewTransform).not.toHaveBeenCalledWith(
    'clip-1',
    expect.objectContaining({ x: expect.any(Number) })
  );
  expect(callbacks.onActivate).not.toHaveBeenCalled();
  expect(callbacks.onCommit).not.toHaveBeenCalled();
  expect(callbacks.onRestore).toHaveBeenCalledWith('clip-1');
});

it.each([false, true])(
  'cancels Escape before late pointer release (activated: %s)',
  (activated) => {
    const { callbacks, cleanup, state } = createHarness();
    try {
      if (activated) dispatchPointer('pointermove', 18, 29);
      const pendingFrame = animationFrame;
      const escape = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(escape);
      expect(escape.defaultPrevented).toBe(true);
      expect(state.finished).toBe(true);
      pendingFrame?.(10);
      dispatchPointer('pointermove', 30, 40);
      dispatchPointer('pointerup', 30, 40);
      expect(callbacks.onCommit).not.toHaveBeenCalled();
      expect(callbacks.onRestore).toHaveBeenCalledExactlyOnceWith('clip-1');
      expect(callbacks.onSettle).toHaveBeenCalledExactlyOnceWith('cancel');
      expect(callbacks.onCacheBypassChange.mock.calls).toEqual([[true], [false]]);
      const idleEscape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
      window.dispatchEvent(idleEscape);
      expect(idleEscape.defaultPrevented).toBe(false);
    } finally {
      cleanup();
    }
  }
);

it('releases Escape after commit and cleanup, and allows a fresh gesture', () => {
  for (const finish of ['commit', 'cleanup']) {
    const { callbacks, cleanup } = createHarness();
    const otherKey = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    window.dispatchEvent(otherKey);
    expect(otherKey.defaultPrevented).toBe(false);
    if (finish === 'commit') {
      dispatchPointer('pointerup', 18, 29);
      expect(callbacks.onCommit).toHaveBeenCalledOnce();
    } else cleanup();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    window.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(false);
  }
});
