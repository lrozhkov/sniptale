import { describe, expect, it, vi } from 'vitest';
import { createDefaultDrawingToolDefaults } from './model';
import { createDrawingObject } from './create';
import { updateCreatedDrawingObject } from './update';

vi.stubGlobal('crypto', { randomUUID: () => 'object-id' });
const defaults = createDefaultDrawingToolDefaults();
const start = { x: 100, y: 80 };

describe('shared drawing creation', () => {
  it.each(['pencil', 'marker', 'shape', 'arrow', 'blur'] as const)(
    'creates %s through one model factory',
    (tool) => {
      expect(createDrawingObject(tool, start, 10, defaults)).toMatchObject({
        id: 'drawing-object-id',
      });
    }
  );

  it('keeps select and text creation under their interaction-specific owners', () => {
    expect(createDrawingObject('select', start, 10, defaults)).toBeNull();
    expect(createDrawingObject('text', start, 10, defaults)).toBeNull();
  });

  it('keeps shape-only aspect locking without changing the pointer-down origin', () => {
    const shape = createDrawingObject('shape', start, 10, defaults)!;
    expect(
      updateCreatedDrawingObject({
        modifiers: { ctrlKey: true, shiftKey: false },
        object: shape,
        point: { x: 130, y: 100 },
        start,
        timestamp: 20,
      })
    ).toMatchObject({ bounds: { x: 100, y: 80, width: 30, height: 20 } });
    expect(
      updateCreatedDrawingObject({
        modifiers: { ctrlKey: true, shiftKey: true },
        object: shape,
        point: { x: 130, y: 100 },
        start,
        timestamp: 20,
      })
    ).toMatchObject({ bounds: { x: 100, y: 80, width: 30, height: 30 } });

    const blur = createDrawingObject('blur', start, 10, defaults)!;
    expect(
      updateCreatedDrawingObject({
        modifiers: { ctrlKey: true, shiftKey: true },
        object: blur,
        point: { x: 130, y: 100 },
        start,
        timestamp: 20,
      })
    ).toMatchObject({ bounds: { x: 100, y: 80, width: 30, height: 20 } });
  });

  it('uses Ctrl for a straight free-angle stroke and Shift for angle snapping', () => {
    const pencil = createDrawingObject('pencil', start, 10, defaults)!;
    const straight = updateCreatedDrawingObject({
      modifiers: { ctrlKey: true, shiftKey: false },
      object: pencil,
      point: { x: 123, y: 97 },
      start,
      timestamp: 20,
    });
    expect(straight.kind === 'pencil' && straight.samples).toHaveLength(2);
    const arrow = createDrawingObject('arrow', start, 10, defaults)!;
    const snapped = updateCreatedDrawingObject({
      modifiers: { ctrlKey: false, shiftKey: true },
      object: arrow,
      point: { x: 140, y: 91 },
      start,
      timestamp: 20,
    });
    const angle =
      snapped.kind === 'arrow'
        ? (Math.atan2(snapped.end.y - start.y, snapped.end.x - start.x) * 180) / Math.PI
        : -1;
    expect(angle).toBeCloseTo(15, 5);
  });

  it('keeps free angles outside the snap tolerance and handles zero-length arrows', () => {
    const arrow = createDrawingObject('arrow', start, 10, defaults)!;
    expect(
      updateCreatedDrawingObject({
        modifiers: { ctrlKey: false, shiftKey: false },
        object: arrow,
        point: { x: 131, y: 99 },
        start,
        timestamp: 20,
      })
    ).toMatchObject({ end: { x: 131, y: 99 } });
    expect(
      updateCreatedDrawingObject({
        modifiers: { ctrlKey: false, shiftKey: false },
        object: arrow,
        point: start,
        start,
        timestamp: 20,
      })
    ).toMatchObject({ end: start });
  });
});
