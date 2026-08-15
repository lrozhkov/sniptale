// @vitest-environment jsdom

import { Canvas } from 'fabric';
import { afterEach, expect, it, vi } from 'vitest';

import { createEditorDrawingPointerGesture } from './drawing-pointer-gesture';

function pointerEvent(pointerId: number): PointerEvent {
  const event = new Event('pointermove') as PointerEvent;
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('deduplicates pointer delivery, filters foreign pointers, and flushes the owner pointer', () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    })
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const updateDraft = vi.fn();
  const gesture = createEditorDrawingPointerGesture(
    {
      cancelTransientInteraction: vi.fn(() => true),
      getCanvas: vi.fn(() => null),
    },
    updateDraft,
    () => true
  );
  const ownerMove = pointerEvent(7);

  gesture.start(ownerMove);
  gesture.queue(pointerEvent(8));
  gesture.queue(ownerMove);
  gesture.queue(ownerMove);
  expect(frames).toHaveLength(1);
  expect(gesture.finish(pointerEvent(8))).toBe(false);
  expect(updateDraft).not.toHaveBeenCalled();

  expect(gesture.finish(pointerEvent(7))).toBe(true);
  expect(updateDraft).toHaveBeenCalledWith([ownerMove]);
  expect(cancelAnimationFrame).toHaveBeenCalledOnce();
});

it('updates legacy mouse delivery immediately and flushes a scheduled pointer frame', () => {
  const queuedFrame: { callback: FrameRequestCallback | null } = { callback: null };
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      queuedFrame.callback = callback;
      return 3;
    })
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const updateDraft = vi.fn();
  const gesture = createEditorDrawingPointerGesture(
    {
      cancelTransientInteraction: vi.fn(() => true),
      getCanvas: vi.fn(() => null),
    },
    updateDraft,
    () => true
  );
  const mouseMove = new MouseEvent('mousemove');
  gesture.queue(mouseMove);
  expect(updateDraft).toHaveBeenCalledWith([mouseMove]);

  const move = pointerEvent(2);
  gesture.start(move);
  gesture.queue(move);
  if (!queuedFrame.callback) throw new Error('Expected a scheduled frame');
  queuedFrame.callback(10);
  expect(updateDraft).toHaveBeenLastCalledWith([move]);
});

it('cancels queued work and terminates the active Canvas interaction', () => {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 4)
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const canvas = { _currentTransform: {}, endCurrentTransform: vi.fn() };
  const cancelTransientInteraction = vi.fn(() => true);
  const updateDraft = vi.fn();
  const gesture = createEditorDrawingPointerGesture(
    { cancelTransientInteraction, getCanvas: () => canvas },
    updateDraft,
    () => true
  );
  const ownerMove = pointerEvent(5);
  gesture.start(ownerMove);
  gesture.queue(ownerMove);

  gesture.cancel(pointerEvent(6));
  expect(cancelTransientInteraction).not.toHaveBeenCalled();
  gesture.cancel(ownerMove);

  expect(cancelAnimationFrame).toHaveBeenCalledOnce();
  expect(canvas.endCurrentTransform).toHaveBeenCalledWith(ownerMove);
  expect(cancelTransientInteraction).toHaveBeenCalledOnce();
  expect(updateDraft).not.toHaveBeenCalled();
});

it('treats repeated delivery of the same terminal cancellation as idempotent', () => {
  const canvas = { _currentTransform: {}, endCurrentTransform: vi.fn() };
  const cancelTransientInteraction = vi.fn(() => true);
  const gesture = createEditorDrawingPointerGesture(
    { cancelTransientInteraction, getCanvas: () => canvas },
    vi.fn(),
    () => true
  );
  const event = pointerEvent(5);
  gesture.start(event);

  gesture.cancel(event);
  gesture.cancel(event);

  expect(canvas.endCurrentTransform).toHaveBeenCalledOnce();
  expect(cancelTransientInteraction).toHaveBeenCalledOnce();
});

it('terminates queued work without mutating state after an external cancellation', () => {
  const canvas = { _currentTransform: {}, endCurrentTransform: vi.fn() };
  const cancelTransientInteraction = vi.fn(() => true);
  let hasSession = true;
  const gesture = createEditorDrawingPointerGesture(
    { cancelTransientInteraction, getCanvas: () => canvas },
    vi.fn(),
    () => hasSession
  );
  const event = pointerEvent(5);
  gesture.start(event);
  hasSession = false;

  gesture.cancel(event);
  gesture.cancel(event);

  expect(canvas.endCurrentTransform).toHaveBeenCalledOnce();
  expect(cancelTransientInteraction).not.toHaveBeenCalled();
});

it('cancels drawing state once without entering an idle real Fabric transform finalizer', () => {
  const canvas = new Canvas(document.createElement('canvas'));
  const endCurrentTransform = vi.spyOn(canvas, 'endCurrentTransform');
  const cancelTransientInteraction = vi.fn(() => true);
  const gesture = createEditorDrawingPointerGesture(
    { cancelTransientInteraction, getCanvas: () => canvas },
    vi.fn(),
    () => true
  );
  const event = pointerEvent(5);
  gesture.start(event);

  gesture.cancel(event);
  gesture.cancel(event);

  expect(endCurrentTransform).not.toHaveBeenCalled();
  expect(cancelTransientInteraction).toHaveBeenCalledOnce();
  canvas.dispose();
});

it('rejects idle moves and clears stale queued work when a new gesture starts', () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    })
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  let hasSession = false;
  const updateDraft = vi.fn();
  const gesture = createEditorDrawingPointerGesture(
    {
      cancelTransientInteraction: vi.fn(() => true),
      getCanvas: vi.fn(() => null),
    },
    updateDraft,
    () => hasSession
  );

  gesture.queue(pointerEvent(1));
  expect(frames).toHaveLength(0);

  hasSession = true;
  gesture.queue(pointerEvent(1));
  expect(frames).toHaveLength(1);
  gesture.start(pointerEvent(2));
  frames[0]?.(10);

  expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
  expect(updateDraft).not.toHaveBeenCalled();
});
