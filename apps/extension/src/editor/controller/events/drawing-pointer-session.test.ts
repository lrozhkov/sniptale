// @vitest-environment jsdom

import { Point, Rect } from 'fabric';
import { expect, it } from 'vitest';
import type { DrawSession } from '../core/types';

import {
  isEditorDrawingSessionPointer,
  readEditorDrawingPointerId,
} from './drawing-pointer-session';

function pointerEvent(pointerId: number): PointerEvent {
  const event = new Event('pointermove') as PointerEvent;
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
}

function drawSession(pointerId: number | null): DrawSession {
  return {
    object: new Rect({ height: 1, width: 1 }),
    objectId: 'drawing-1',
    pointerId,
    start: new Point(0, 0),
    tool: 'pencil',
  };
}

it('keeps pointer identity in the draw session and rejects foreign pointer delivery', () => {
  const session = drawSession(7);

  expect(readEditorDrawingPointerId(pointerEvent(7))).toBe(7);
  expect(isEditorDrawingSessionPointer(session, pointerEvent(7))).toBe(true);
  expect(isEditorDrawingSessionPointer(session, pointerEvent(8))).toBe(false);
});

it('supports legacy mouse sessions without creating a second gesture authority', () => {
  const session = drawSession(null);

  expect(readEditorDrawingPointerId(new MouseEvent('mousemove'))).toBeNull();
  expect(isEditorDrawingSessionPointer(session, pointerEvent(8))).toBe(true);
});
