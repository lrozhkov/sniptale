import { describe, expect, it } from 'vitest';
import type { DrawingObject } from '../../../features/drawing/public';
import { createEditorDrawingFabricObject } from './vector';
import { applyEditorDrawingInteractionControls } from './controls';

describe('drawing interaction controls', () => {
  it('uses exactly two grab endpoints and no bounding box for arrows', () => {
    const arrow: DrawingObject = {
      id: 'arrow-1',
      kind: 'arrow',
      start: { x: 10, y: 10 },
      end: { x: 120, y: 60 },
      color: '#f97316',
      dynamicWidth: true,
      width: 18,
    };
    const object = createEditorDrawingFabricObject(arrow, 1);
    applyEditorDrawingInteractionControls(object);
    expect(Object.keys(object.controls)).toEqual(['start', 'end']);
    expect(object.controls['start']?.cursorStyle).toBe('grab');
    expect(object.controls['end']?.cursorStyle).toBe('grab');
    expect(object.hasBorders).toBe(false);
    expect(object.lockRotation).toBe(true);
  });
});
