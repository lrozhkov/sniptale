// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { Rect } from 'fabric';
import { createFabricCanvasFixture } from '../../testing/fabric-canvas.test-support';
import {
  deferEditorFreehandCompletion,
  flushEditorFreehandCompletion,
  hasPendingEditorFreehandCompletion,
} from './released';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function fixture() {
  vi.useFakeTimers();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++id, callback);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((key) => {
    frames.delete(key);
  });
  const object = new Rect();
  const objects = [object];
  const canvas = createFabricCanvasFixture({ getObjects: () => objects });
  const complete = vi.fn();
  const onFailure = vi.fn();
  const enqueue = () => deferEditorFreehandCompletion({ canvas, object, complete, onFailure });
  const frame = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(0);
  };
  return { canvas, object, objects, complete, onFailure, enqueue, frame, frames };
}
it('allows a presentation frame before completing a released stroke', () => {
  const f = fixture();
  f.enqueue();
  expect(hasPendingEditorFreehandCompletion(f.canvas)).toBe(true);
  f.frame();
  vi.runOnlyPendingTimers();
  expect(f.complete).not.toHaveBeenCalled();
  f.frame();
  vi.runOnlyPendingTimers();
  expect(f.complete).toHaveBeenCalledOnce();
  expect(hasPendingEditorFreehandCompletion(f.canvas)).toBe(false);
});
it('flushes before the next input and does not finish the same stroke twice', () => {
  const f = fixture();
  f.enqueue();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z' }));
  expect(f.complete).toHaveBeenCalledOnce();
  f.frame();
  vi.runOnlyPendingTimers();
  flushEditorFreehandCompletion(f.canvas);
  expect(f.complete).toHaveBeenCalledOnce();
});
it('keeps failed completion available for explicit retry', () => {
  const f = fixture();
  f.complete.mockImplementationOnce(() => {
    throw new Error('failure');
  });
  f.enqueue();
  f.frame();
  f.frame();
  vi.runOnlyPendingTimers();
  expect(f.onFailure).toHaveBeenCalledOnce();
  expect(f.objects).toEqual([f.object]);
  expect(hasPendingEditorFreehandCompletion(f.canvas)).toBe(true);
  flushEditorFreehandCompletion(f.canvas);
  expect(f.complete).toHaveBeenCalledTimes(2);
  expect(hasPendingEditorFreehandCompletion(f.canvas)).toBe(false);
});
it('does not resurrect a stroke removed by document replacement', () => {
  const f = fixture();
  f.enqueue();
  f.objects.length = 0;
  f.frame();
  f.frame();
  vi.runOnlyPendingTimers();
  expect(f.complete).not.toHaveBeenCalled();
  expect(hasPendingEditorFreehandCompletion(f.canvas)).toBe(false);
});

it('does not let an obsolete frame settle a newer stroke on the same canvas', () => {
  const f = fixture();
  f.enqueue();
  f.frame();
  const obsolete = [...f.frames.values()][0]!;
  flushEditorFreehandCompletion(f.canvas);
  f.enqueue();
  obsolete(0);
  vi.runOnlyPendingTimers();
  expect(f.complete).toHaveBeenCalledOnce();
  expect(hasPendingEditorFreehandCompletion(f.canvas)).toBe(true);
  f.frame();
  f.frame();
  vi.runOnlyPendingTimers();
  expect(f.complete).toHaveBeenCalledTimes(2);
});

it('settles accepted work when its page hides instead of waiting for frames', () => {
  const f = fixture();
  f.enqueue();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  document.dispatchEvent(new Event('visibilitychange'));
  expect(f.complete).toHaveBeenCalledOnce();
  expect(hasPendingEditorFreehandCompletion(f.canvas)).toBe(false);
});
