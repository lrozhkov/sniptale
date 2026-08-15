// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import {
  attachEditorCanvasPointerCapture,
  detachEditorCanvasPointerCapture,
} from './pointer-capture';

function pointerEvent(type: string, pointerId: number, button = 0, bubbles = false) {
  const event = new Event(type, { bubbles }) as PointerEvent;
  Object.defineProperties(event, {
    button: { value: button },
    isPrimary: { value: true },
    pointerId: { value: pointerId },
  });
  return event;
}

it('captures a primary drag until pointer release and removes lifecycle listeners', () => {
  const element = document.createElement('canvas');
  const captured = new Set<number>();
  const dispatchOrder: string[] = [];
  element.setPointerCapture = vi.fn((pointerId) => captured.add(pointerId));
  element.hasPointerCapture = vi.fn((pointerId) => captured.has(pointerId));
  element.releasePointerCapture = vi.fn((pointerId) => captured.delete(pointerId));
  const canvas = { upperCanvasEl: element };

  const terminate = vi.fn();
  const beforeFabric = vi.fn(() => dispatchOrder.push('editor-preflight'));
  attachEditorCanvasPointerCapture(canvas, terminate, beforeFabric);
  element.addEventListener('pointerdown', () => dispatchOrder.push('fabric-target-resolution'));
  element.dispatchEvent(pointerEvent('pointerdown', 7, 0, true));
  expect(beforeFabric).toHaveBeenCalledWith(expect.objectContaining({ pointerId: 7 }));
  expect(beforeFabric.mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(element.setPointerCapture).mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
  );
  expect(element.setPointerCapture).toHaveBeenCalledWith(7);
  expect(dispatchOrder).toEqual(['editor-preflight', 'fabric-target-resolution']);
  element.dispatchEvent(pointerEvent('pointerup', 7));
  expect(element.releasePointerCapture).toHaveBeenCalledWith(7);
  element.dispatchEvent(pointerEvent('lostpointercapture', 7));
  expect(terminate).not.toHaveBeenCalled();

  detachEditorCanvasPointerCapture(canvas);
  element.dispatchEvent(pointerEvent('pointerdown', 8));
  expect(element.setPointerCapture).not.toHaveBeenCalledWith(8);
});

it('ignores non-primary mouse buttons', () => {
  const element = document.createElement('canvas');
  element.setPointerCapture = vi.fn();
  element.hasPointerCapture = vi.fn(() => false);
  element.releasePointerCapture = vi.fn();
  const canvas = { upperCanvasEl: element };

  attachEditorCanvasPointerCapture(canvas, vi.fn());
  element.dispatchEvent(pointerEvent('pointerdown', 3, 2));

  expect(element.setPointerCapture).not.toHaveBeenCalled();
  detachEditorCanvasPointerCapture(canvas);
});

it('terminates the active gesture when pointer capture is cancelled or unexpectedly lost', () => {
  const element = document.createElement('canvas');
  const captured = new Set<number>();
  element.setPointerCapture = vi.fn((pointerId) => captured.add(pointerId));
  element.hasPointerCapture = vi.fn((pointerId) => captured.has(pointerId));
  element.releasePointerCapture = vi.fn((pointerId) => captured.delete(pointerId));
  const canvas = { upperCanvasEl: element };
  const terminate = vi.fn();

  attachEditorCanvasPointerCapture(canvas, terminate);
  element.dispatchEvent(pointerEvent('pointerdown', 4));
  element.dispatchEvent(pointerEvent('lostpointercapture', 4));
  expect(terminate).toHaveBeenCalledWith(expect.objectContaining({ pointerId: 4 }));

  element.dispatchEvent(pointerEvent('pointerdown', 5));
  element.dispatchEvent(pointerEvent('pointercancel', 5));
  expect(terminate).toHaveBeenCalledWith(expect.objectContaining({ pointerId: 5 }));
  expect(terminate).toHaveBeenCalledTimes(2);

  detachEditorCanvasPointerCapture(canvas);
});

it('cancels a drawing gesture once when pointercancel bubbles to the window owner', () => {
  const element = document.createElement('canvas');
  document.body.append(element);
  const captured = new Set<number>();
  element.setPointerCapture = vi.fn((pointerId) => captured.add(pointerId));
  element.hasPointerCapture = vi.fn((pointerId) => captured.has(pointerId));
  element.releasePointerCapture = vi.fn((pointerId) => captured.delete(pointerId));
  const canvas = { upperCanvasEl: element };
  const cancelTransientInteraction = vi.fn();
  let activePointerId: number | null = 9;
  const cancel = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) return;
    activePointerId = null;
    cancelTransientInteraction();
  };
  attachEditorCanvasPointerCapture(canvas, cancel);
  window.addEventListener('pointercancel', cancel);
  const down = pointerEvent('pointerdown', 9);
  element.dispatchEvent(down);

  element.dispatchEvent(pointerEvent('pointercancel', 9, 0, true));

  expect(cancelTransientInteraction).toHaveBeenCalledOnce();
  window.removeEventListener('pointercancel', cancel);
  detachEditorCanvasPointerCapture(canvas);
  element.remove();
});
