// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import {
  attachEditorCanvasPointerCapture,
  detachEditorCanvasPointerCapture,
} from './pointer-capture';

function pointerEvent(type: string, pointerId: number, button = 0) {
  const event = new Event(type) as PointerEvent;
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
  element.setPointerCapture = vi.fn((pointerId) => captured.add(pointerId));
  element.hasPointerCapture = vi.fn((pointerId) => captured.has(pointerId));
  element.releasePointerCapture = vi.fn((pointerId) => captured.delete(pointerId));
  const canvas = { upperCanvasEl: element };

  attachEditorCanvasPointerCapture(canvas);
  element.dispatchEvent(pointerEvent('pointerdown', 7));
  expect(element.setPointerCapture).toHaveBeenCalledWith(7);
  element.dispatchEvent(pointerEvent('pointerup', 7));
  expect(element.releasePointerCapture).toHaveBeenCalledWith(7);

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

  attachEditorCanvasPointerCapture(canvas);
  element.dispatchEvent(pointerEvent('pointerdown', 3, 2));

  expect(element.setPointerCapture).not.toHaveBeenCalled();
  detachEditorCanvasPointerCapture(canvas);
});
